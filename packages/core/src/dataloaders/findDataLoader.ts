import { Entity } from "../Entity";
import { FilterAndSettings } from "../EntityFilter";
import { opToFn } from "../EntityGraphQLFilter";
import { EntityManager, MaybeAbstractEntityConstructor, getEmInternalApi } from "../EntityManager";
import { EntityMetadata, getMetadata } from "../EntityMetadata";
import { buildHintTree } from "../HintTree";
import {
  ColumnCondition,
  ParsedCteClause,
  ParsedFindQuery,
  ParsedGroupBy,
  ParsedSelect,
  ParsedValueFilter,
  RawCondition,
  getTables,
  parseAlias,
  parseFindQuery,
} from "../QueryParser";
import { visitConditions } from "../QueryVisitor";
import { PojoRowData } from "../RowData";
import { OpColumn } from "../drivers/EntityWriter";
import { equal, equalArrays } from "../fields";
import { kqDot } from "../keywords";
import { LoadHint } from "../loadHints";
import { hintKey } from "../normalizeHints";
import { buildUnnestCte } from "../unnest";
import { assertNever, fail } from "../utils";
import { fastWhereFilterHash } from "./fastWhereFilterHash";

export const findOperation = "find";

interface PreparedFindEntry<T extends Entity> {
  filter: FilterAndSettings<T>;
  query: ParsedFindQuery;
  bindings: any[];
  findSettings: any;
  checkLimit: boolean | undefined;
}

export function findDataLoader<T extends Entity>(
  em: EntityManager,
  type: MaybeAbstractEntityConstructor<T>,
  filter: FilterAndSettings<T>,
  hint: LoadHint<T> | undefined,
): Promise<T[]> {
  const { where, ...opts } = filter;
  if ("limit" in opts || "offset" in opts) {
    throw new Error("Cannot use limit/offset with findDataLoader");
  }

  const meta = getMetadata(type);
  const query = parseFindQuery(meta, where, opts);
  const { checkLimit, findSettings } = em["prepareFind"](meta, findOperation, query, {
    ...opts,
    limit: em.entityLimit,
  });
  const bindings: any[] = [];
  collectValues(bindings, query);
  const prepared = { filter, query, bindings, findSettings, checkLimit } satisfies PreparedFindEntry<T>;
  const batchKey = getBatchKeyFromGenericStructure(meta, query);

  return em
    .getLoader<PreparedFindEntry<T>, T[]>(
      findOperation,
      // It's unlikely we'll have simultaneous em.finds with the same WHERE clause structure
      // but lots of different load hints, and it'd be complicated to implement the preloading
      // in a way that doesn't naively over-fetch data (which our loadDataLoader does prevent,
      // but it's simpler b/c it's given exact ids to load), so for now just include the load
      // hint in the batch key.
      `${batchKey}-${hintKey(hint)}`,
      async (entries) => {
        // We're guaranteed that these queries all have the same structure

        // Don't bother with the CTE if there's only 1 query (or each query has exactly the same filter values)
        if (entries.length === 1) {
          const { query, findSettings, checkLimit } = entries[0];
          // Maybe add preload joins
          const { preloader } = getEmInternalApi(em);
          const preloadHydrator = preloader && hint && preloader.addPreloading(meta, buildHintTree(hint), query);
          const rowData = em.driver.lazyRows
            ? await em["executePreparedFindRowData"](meta, findOperation, query, findSettings, checkLimit)
            : new PojoRowData(await em["executePreparedFind"](meta, findOperation, query, findSettings, checkLimit));
          const entities = em.hydrateFromRowData(type, rowData);
          preloadHydrator?.(rowData, entities);
          return [filterDeletedEntities(em, entities)];
        }

        // WITH _find (tag, arg1, arg2) AS (
        //   SELECT unnest($0::int[]), unnest($0::varchar[]), unnest($0::varchar[])
        // )
        // SELECT a.*, array_agg(_find.tag) AS _tags
        // FROM authors a
        // CROSS JOIN _find AS _find
        // WHERE a.first_name = _find.arg0 OR a.last_name = _find.arg1
        // GROUP BY a.id

        // Build the list of 'arg1', 'arg2', ... strings
        const { query, findSettings, checkLimit } = entries[0];
        const { preloader } = getEmInternalApi(em);
        const preloadJoins = preloader && hint && preloader.getPreloadJoins(meta, buildHintTree(hint), query);

        const args = collectAndReplaceArgs(query, entries);
        const argsColumns: OpColumn[] = [{ columnName: "tag", dbType: "int" }, ...args.map((a) => a.column)];
        const columnValues = createColumnValuesFromPrepared(args, entries);
        const query2: ParsedFindQuery = {
          ...query,
          selects: ["array_agg(_find.tag) as _tags", ...query.selects],
          tables: [{ join: "cross", table: "_find", alias: "_find" }, ...query.tables],
          ctes: [buildUnnestCte("_find", argsColumns, columnValues), ...(query.ctes ?? [])],
        };
        if (preloadJoins) {
          query2.selects.push(
            ...preloadJoins.flatMap((j) =>
              // Because we 'group by primary.id' to collapse the "a1 matched multiple finds" into
              // a single row, we also need to pick just the first value of each preload column
              j.selects.map((s) => `(array_agg(${s.value}))[1] AS ${s.as}`),
            ),
          );
          query2.tables.push(...preloadJoins.map((j) => j.join));
        }

        // Because we want to use `array_agg(tag)`, add `GROUP BY`s to the values we're selecting
        query2.groupBys = buildGroupBys(query2.selects);

        // Also because of our `array_agg` group by, add any order bys to the group by
        const [primary] = getTables(query2);
        for (const { alias, column } of query2.orderBys) {
          if (alias !== primary.alias) {
            query2.groupBys.push({ alias, column });
          }
        }

        const rowData = em.driver.lazyRows
          ? await em["executePreparedFindRowData"](meta, findOperation, query2, findSettings, checkLimit)
          : new PojoRowData(await em["executePreparedFind"](meta, findOperation, query2, findSettings, checkLimit));

        const entities = em.hydrateFromRowData(type, rowData);
        preloadJoins?.forEach((j) => j.hydrator(rowData, entities));

        // Make an empty array for each batched query, per the dataloader contract
        const results = entries.map(() => [] as T[]);
        // Then put each row into the tagged query it matched
        for (let i = 0; i < entities.length; i++) {
          const entity = entities[i];
          if (!entity.isDeletedEntity) {
            for (const tag of rowData.get(i, "_tags")) results[tag].push(entity);
          }
        }
        return results;
      },
      // Our filter/order tuple is a complex object, so use a stable cache key to ensure caching works.
      { cacheKeyFn: queryFilterHash },
    )
    .load(prepared);
}

/**
 * Returns a stable cache key from the already-parsed query rather than the raw `where`.
 *
 * A scope `where` is an opaque proxy that `fastWhereFilterHash` can't serialize — but it doesn't need
 * to: by this point the scope's structure and values are already worked into the `ParsedFindQuery`, so
 * hashing that distinguishes e.g. `Author.adult` (age>=18) from `Author.senior` (age>=65) correctly.
 */
export function queryFilterHash(entry: { query: ParsedFindQuery; findSettings: object }): any {
  return whereFilterHash({ query: entry.query, findSettings: entry.findSettings });
}

export function whereFilterHash(where: object): any {
  const key = fastWhereFilterHash(where);
  if (key === undefined) throw new Error("fastWhereFilterHash could not serialize find filter");
  return key;
}

/** Filters pending-delete entities in place to avoid allocating a replacement array for the common find path. */
export function filterDeletedEntities<T extends Entity>(em: EntityManager, entities: T[]): T[] {
  // Most EMs never delete entities, so skip even the findIndex scan until a delete has happened.
  if (!getEmInternalApi(em).hasAnyDeletes()) return entities;

  const firstDeleted = entities.findIndex((entity) => entity.isDeletedEntity);
  if (firstDeleted === -1) return entities;

  let writeIndex = firstDeleted;
  for (let readIndex = firstDeleted + 1; readIndex < entities.length; readIndex++) {
    const entity = entities[readIndex];
    if (!entity.isDeletedEntity) {
      entities[writeIndex++] = entity;
    }
  }
  entities.length = writeIndex;
  return entities;
}

class ArgCounter {
  private index = 0;
  next(): number {
    return this.index++;
  }
}

/**
 * A single batched arg: the `_find` CTE column to create, plus the index into each entry's `bindings`
 * array that fills it. `bindingIndex` can differ from the column's position because inlined constants
 * are skipped — see {@link collectAndReplaceArgs}.
 */
export interface CteArg {
  column: OpColumn;
  bindingIndex: number;
}

/**
 * Rewrites each batched arg in `query` into a `_find.argX` placeholder.
 *
 * Any condition whose value(s) are identical across every batched query is left inline (using
 * query's condition as-is from entity0), so it renders as `col = ?` for better query planning.
 *
 * The returned array has the non-constant CTE columns, one {@link CteArg} per `_find.argX`.
 *
 * Because constants are skipped, the 1st CTE column (i.e. for last name) might actually have a
 * binding index of `1` if we've skipped an early constant column (i.e. first name).
 *
 * @param query the initial query in the batch, that all other queries structurally match
 * @param entries the values (bindings) for each query in the batch
 */
export function collectAndReplaceArgs(query: ParsedFindQuery, entries: readonly { bindings: any[] }[]): CteArg[] {
  const args: CteArg[] = [];
  const argsIndex = new ArgCounter();
  // `bindings` were pushed in this same `visitConditions` order, so we can walk the conditions and
  // each entry's `bindings` in lockstep, deciding per condition whether to inline or batch its value(s).
  const constant = computeConstantBindings(entries);
  let bindingIndex = 0;
  visitConditions(query, {
    visitCond(c: ColumnCondition) {
      if ("value" in c.cond) {
        const { kind } = c.cond;
        // `between` consumes two bindings, everything else (incl. array `in`/`nin`) consumes one.
        const consumed = kind === "between" ? 2 : 1;
        const start = bindingIndex;
        bindingIndex += consumed;
        // If every batched query shares this condition's value(s), leave it as a normal `col = ?`
        // condition (rendered from `entries[0]`'s value) instead of threading it through the CTE.
        let allConstant = true;
        for (let k = 0; k < consumed; k++) {
          if (!constant[start + k]) {
            allConstant = false;
            break;
          }
        }
        if (allConstant) return;
        // `arg${args.length}` keeps the CTE column names in step with the `_find.argX` references that
        // `rewriteToRawCondition` emits, since both only advance for the args we actually batch.
        if (kind === "between") {
          args.push({ column: { columnName: `arg${args.length}`, dbType: c.dbType }, bindingIndex: start });
          args.push({ column: { columnName: `arg${args.length}`, dbType: c.dbType }, bindingIndex: start + 1 });
        } else {
          // Figure out the _find CTE's `unnest($n::${dbType})` so Postgres knows what we're sending in
          const dbType =
            kind === "in" || kind === "nin"
              ? `${c.dbType}[]` // `in`/`nin` compare against an array column
              : kind === "jsonPathExists" || kind === "jsonPathPredicate"
                ? "jsonpath" // jsonPath needs `::jsonpath` (not `::jsonb`, which would be an invalid `jsonb @@ jsonb`)
                : c.dbType;
          args.push({ column: { columnName: `arg${args.length}`, dbType }, bindingIndex: start });
        }
        return rewriteToRawCondition(c, argsIndex);
      } else if (c.cond.kind === "is-null" || c.cond.kind === "not-null") {
        // leave it alone
      } else {
        throw new Error("Unsupported");
      }
    },
  });
  return args;
}

function rewriteToRawCondition(c: ColumnCondition, argsIndex: ArgCounter): RawCondition {
  const [op, negate] = makeOp(c.cond, argsIndex);
  return {
    kind: "raw",
    aliases: [c.alias],
    condition: `${negate ? "NOT " : ""}${kqDot(c.alias, c.column)} ${op}`,
    pruneable: c.pruneable ?? false,
    bindings: [],
  };
}

/**
 * Builds the column-major values for the `_find` CTE.
 *
 * Column 0 is the per-entry `tag`; the remaining columns mirror `args` 1:1, each pulling its
 * `bindingIndex` from every entry's `bindings` (so inlined constants are naturally skipped).
 */
export function createColumnValuesFromPrepared(
  args: readonly CteArg[],
  entries: readonly { bindings: any[] }[],
): any[][] {
  const columnValues: any[][] = new Array(args.length + 1);
  for (let i = 0; i < columnValues.length; i++) columnValues[i] = [];
  entries.forEach((entry, i) => {
    columnValues[0].push(i);
    for (let k = 0; k < args.length; k++) {
      columnValues[k + 1].push(entry.bindings[args[k].bindingIndex]);
    }
  });
  return columnValues;
}

/** Pushes the arg values of a given query in the cross-query `bindings` array. */
export function collectValues(bindings: any[], query: ParsedFindQuery): void {
  visitConditions(query, {
    visitCond(c: ColumnCondition) {
      if ("value" in c.cond) {
        // between has two values
        if (c.cond.kind === "between") {
          bindings.push(c.cond.value[0]);
          bindings.push(c.cond.value[1]);
        } else {
          bindings.push(c.cond.value);
        }
      }
    },
  });
}

/** Returns true for select expressions that do not need to be represented in GROUP BY. */
function isAggregateSelect(select: string): boolean {
  return select.toLowerCase().includes("array_agg(");
}

/** Builds GROUP BYs for selected values, accounting for whole-row selects that are grouped by primary key. */
function buildGroupBys(selects: ParsedSelect[]): ParsedGroupBy[] {
  const sqlSelects = selects.map(selectSqlForGroupBy);
  const wholeRowAliases = new Set(
    sqlSelects
      .filter((select) => !isAggregateSelect(select) && stripSelectAlias(select).endsWith(".*"))
      .map(parseAlias),
  );
  return sqlSelects
    .filter((select) => !isAggregateSelect(select))
    .filter((select) => !isCoveredByWholeRowGroupBy(select, wholeRowAliases))
    .map((select) => groupBySelect(select));
}

/** Returns a SQL string for group-by analysis, until we support bindings in ParsedGroupBy. */
function selectSqlForGroupBy(select: ParsedSelect): string {
  if (typeof select === "string") {
    return select;
  }
  throw new Error(`find batching does not support grouped selects with bindings: ${select.sql}`);
}

/** Builds a GROUP BY for a selected value so `array_agg(_find.tag)` can coexist with plugin-rewritten selects. */
function groupBySelect(select: string): ParsedGroupBy {
  const expression = stripSelectAlias(select);
  if (expression.endsWith(".*")) {
    return { alias: parseAlias(expression), column: "id" };
  }
  return { expression };
}

/** Removes a trailing SQL alias from a select expression, i.e. `(a.id) as id` -> `(a.id)`. */
function stripSelectAlias(select: string): string {
  const match = /^(.*)\s+as\s+[^\s]+$/i.exec(select);
  return match?.[1] ?? select;
}

/** Returns true when an expression is functionally covered by an already-grouped whole-row alias. */
function isCoveredByWholeRowGroupBy(select: string, wholeRowAliases: Set<string>): boolean {
  const expression = stripSelectAlias(select);
  if (expression.endsWith(".*")) {
    return false;
  }
  const aliases = findSelectedAliases(expression);
  return aliases.length > 0 && aliases.every((alias) => wholeRowAliases.has(alias));
}

/** Finds SQL aliases referenced as `alias.column` or `"alias".column`, i.e. `a.first_name` -> `a`. */
function findSelectedAliases(expression: string): string[] {
  const aliases = new Set<string>();
  for (const match of expression.matchAll(/(?:"([^"]+)"|([a-zA-Z_][\w]*))\./g)) {
    aliases.add(match[1] ?? match[2]);
  }
  return [...aliases];
}

/** Returns [operator, argsTaken, negate], i.e. `["=", 1, false]`. */
function makeOp(cond: ParsedValueFilter<any>, argsIndex: ArgCounter): [string, boolean] {
  switch (cond.kind) {
    case "eq":
    case "ne":
    case "gte":
    case "gt":
    case "lte":
    case "lt":
    case "like":
    case "nlike":
    case "ilike":
    case "nilike":
    case "regex":
    case "nregex":
    case "iregex":
    case "niregex":
    case "jsonPathExists":
    case "jsonPathPredicate":
    case "contains":
    case "overlaps":
    case "containedBy": {
      const fn = opToFn[cond.kind] ?? fail(`Invalid operator ${cond.kind}`);
      return [`${fn} _find.arg${argsIndex.next()}`, false];
    }
    case "noverlaps":
    case "ncontains": {
      const fn = (opToFn as any)[cond.kind.substring(1)] ?? fail(`Invalid operator ${cond.kind}`);
      return [`${fn} _find.arg${argsIndex.next()}`, true];
    }
    case "is-null":
      return [`IS NULL`, false];
    case "not-null":
      return [`IS NOT NULL`, false];
    case "in":
      return [`= ANY(_find.arg${argsIndex.next()})`, false];
    case "nin":
      return [`!= ALL(_find.arg${argsIndex.next()})`, false];
    case "between":
      return [`BETWEEN _find.arg${argsIndex.next()} AND _find.arg${argsIndex.next()}`, false];
    default:
      assertNever(cond);
  }
}

/**
 * Creates a `VALUES (...), (...)` SQL string for use in a CTE, typically for our
 * batch INSERTs/UPDATEs where the CTE is how we inject N rows of data/params into
 * the single INSERT/UPDATE statement.
 *
 * The caller is responsible for filling in the `bindings`, which should have 1
 * entry for each `rows x columns` cell.
 *
 * @deprecated Use newUnnestCte instead because it uses arrays to have a bounded number of parameters.
 */
export function buildValuesCte(
  alias: string,
  columns: { columnName: string; dbType: string }[],
  rows: readonly any[],
  // Should have a value for each `row x column` cell.
  bindings: readonly any[],
): ParsedCteClause {
  return {
    alias,
    columns,
    query: {
      kind: "raw",
      sql: `VALUES
        ${rows.map((_, i) => `(${columns.map((c) => (i === 0 ? `?::${c.dbType}` : `?`)).join(", ")})`).join(", ")}
      `,
      bindings,
    },
  };
}

/** Returns, per binding slot, whether every batched query shares the same value. */
function computeConstantBindings(entries: readonly { bindings: any[] }[]): boolean[] {
  const length = entries[0].bindings.length;
  const constant = new Array<boolean>(length);
  for (let j = 0; j < length; j++) {
    const first = entries[0].bindings[j];
    let same = true;
    for (let i = 1; i < entries.length; i++) {
      if (!argsEqual(entries[i].bindings[j], first)) {
        same = false;
        break;
      }
    }
    constant[j] = same;
  }
  return constant;
}

/**
 * Deep-equals two find-arg values (scalars, Dates, Temporals, or arrays thereof), reusing the same
 * scalar/array equality `setField` uses for change detection.
 *
 * Only used to decide whether a condition can be inlined, so false negatives are safe (we just fall
 * back to the CTE); we only return true when the values are genuinely equal.
 */
function argsEqual(a: any, b: any): boolean {
  return equal(a, b) || (Array.isArray(a) && Array.isArray(b) && equalArrays(a, b));
}

export function getBatchKeyFromGenericStructure(meta: EntityMetadata, query: ParsedFindQuery): string {
  // Temporarily swap condition values for `*` so we can see the generic structure of the query,
  // then restore them; this avoids deep-cloning the entire parsed query on every em.find call.
  // Track values per condition object b/c parseFindQuery does not deep copy complex conditions,
  // i.e. `a.firstName.eq(...)`, so the same condition instance could appear twice.
  const saved = new Map<any, any>();
  visitConditions(query, {
    visitCond(c: ColumnCondition) {
      const { cond } = c;
      if ("value" in cond && !saved.has(cond)) {
        saved.set(cond, cond.value);
        cond.value = "*";
      }
    },
  });
  const structure = JSON.stringify(query);
  for (const [cond, value] of saved) cond.value = value;
  // Include the meta b/c STI queries for different subtypes will look identical
  return meta.stiDiscriminatorValue ? `${structure}|${meta.type}` : structure;
}
