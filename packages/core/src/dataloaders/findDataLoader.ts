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
import { OpColumn } from "../drivers/EntityWriter";
import { kqDot } from "../keywords";
import { LoadHint } from "../loadHints";
import { hintKey } from "../normalizeHints";
import { buildUnnestCte } from "../unnest";
import { assertNever } from "../utils";
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
  const prepared = { filter, query, bindings, findSettings, checkLimit };
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
          const rows = await em["executePreparedFind"](meta, findOperation, query, findSettings, checkLimit);
          const entities = em.hydrate(type, rows);
          preloadHydrator?.(rows, entities);
          return [entities];
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

        const argsColumns = collectAndReplaceArgs(query);
        argsColumns.unshift({ columnName: "tag", dbType: "int" });
        const columnValues = createColumnValuesFromPrepared(argsColumns, entries);
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

        const rows = await em["executePreparedFind"](meta, findOperation, query2, findSettings, checkLimit);

        const entities = em.hydrate(type, rows);
        preloadJoins?.forEach((j) => j.hydrator(rows, entities));

        // Make an empty array for each batched query, per the dataloader contract
        const results = entries.map(() => [] as T[]);
        // Then put each row into the tagged query it matched
        rows.forEach((row, i) => {
          const entity = entities[i];
          for (const tag of row._tags) results[tag].push(entity);
          delete row._tags;
        });
        return results;
      },
      // Our filter/order tuple is a complex object, so use a stable cache key to ensure caching works.
      { cacheKeyFn: (entry) => whereFilterHash(entry.filter) },
    )
    .load(prepared);
}

export function whereFilterHash(where: FilterAndSettings<any>): any {
  const key = fastWhereFilterHash(where);
  if (key === undefined) throw new Error("fastWhereFilterHash could not serialize find filter");
  return key;
}

class ArgCounter {
  private index = 0;
  next(): number {
    return this.index++;
  }
}

/**
 * Recursively finds args in `query` and replaces them with `_find.argX` placeholders.
 *
 * We also return the name/type of each found/rewritten arg so we can build the `_find` CTE table.
 */
export function collectAndReplaceArgs(query: ParsedFindQuery): { columnName: string; dbType: string }[] {
  const args: { columnName: string; dbType: string }[] = [];
  const argsIndex = new ArgCounter();
  visitConditions(query, {
    visitCond(c: ColumnCondition) {
      if ("value" in c.cond) {
        const { kind } = c.cond;
        if (kind === "in" || kind === "nin") {
          args.push({ columnName: `arg${args.length}`, dbType: `${c.dbType}[]` });
          return rewriteToRawCondition(c, argsIndex);
        } else if (kind === "between") {
          // between has two values
          args.push({ columnName: `arg${args.length}`, dbType: c.dbType });
          args.push({ columnName: `arg${args.length}`, dbType: c.dbType });
          return rewriteToRawCondition(c, argsIndex);
        } else if (kind === "jsonPathExists" || kind === "jsonPathPredicate") {
          // The CTE needs to use `::jsonpath` instead of `::jsonb`, otherwise we'll get an invalid
          // operator error for `jsonb @@ jsonb`. ...maybe the `ColumnCondition` should have a dbType
          // baked into its ADT? Then we could avoid this special case handling.
          args.push({ columnName: `arg${args.length}`, dbType: "jsonpath" });
          return rewriteToRawCondition(c, argsIndex);
        } else {
          args.push({ columnName: `arg${args.length}`, dbType: c.dbType });
          return rewriteToRawCondition(c, argsIndex);
        }
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

/** Builds `_find` column values from already prepared queries. */
export function createColumnValuesFromPrepared(columns: OpColumn[], entries: readonly { bindings: any[] }[]): any[][] {
  const columnValues: any[][] = Array(columns.length);
  for (let i = 0; i < columns.length; i++) columnValues[i] = [];
  entries.forEach((entry, i) => {
    columnValues[0].push(i);
    for (let j = 0; j < entry.bindings.length; j++) {
      columnValues[j + 1].push(entry.bindings[j]);
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

/** Replaces all values with `*` so we can see the generic structure of the query. */
function stripValues(query: ParsedFindQuery): void {
  visitConditions(query, {
    visitCond(c: ColumnCondition) {
      if ("value" in c.cond) {
        c.cond.value = "*";
      }
    },
  });
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

export function getBatchKeyFromGenericStructure(meta: EntityMetadata, query: ParsedFindQuery): string {
  // Clone b/c parseFindQuery does not deep copy complex conditions, i.e. `a.firstName.eq(...)`
  const clone = structuredClone(query);
  stripValues(clone);
  if (meta.stiDiscriminatorValue) {
    // Include the meta b/c STI queries for different subtypes will look identical
    (clone as any).meta = meta.type;
  }
  // We could use `whereFilterHash` too if it's faster?
  return JSON.stringify(clone);
}
