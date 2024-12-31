import DataLoader from "dataloader";
import hash from "object-hash";
import { isAlias } from "../Aliases";
import { Entity, isEntity } from "../Entity";
import { FilterAndSettings } from "../EntityFilter";
import { opToFn } from "../EntityGraphQLFilter";
import { EntityManager, MaybeAbstractEntityConstructor, getEmInternalApi } from "../EntityManager";
import { EntityMetadata, getMetadata } from "../EntityMetadata";
import { buildHintTree } from "../HintTree";
import {
  ColumnCondition,
  ParsedExpressionFilter,
  ParsedFindQuery,
  ParsedValueFilter,
  RawCondition,
  getTables,
  joinKeywords,
  parseFindQuery,
} from "../QueryParser";
import { visitConditions } from "../QueryVisitor";
import { kq, kqDot } from "../keywords";
import { LoadHint } from "../loadHints";
import { maybeRequireTemporal } from "../temporal";
import { plainDateMapper, plainDateTimeMapper, plainTimeMapper, zonedDateTimeMapper } from "../temporalMappers";
import { assertNever, cleanSql } from "../utils";

export function findDataLoader<T extends Entity>(
  em: EntityManager,
  type: MaybeAbstractEntityConstructor<T>,
  filter: FilterAndSettings<T>,
  hint: LoadHint<T> | undefined,
): DataLoader<FilterAndSettings<T>, T[]> {
  const { where, ...opts } = filter;
  if (opts.limit || opts.offset) {
    throw new Error("Cannot use limit/offset with findDataLoader");
  }

  const meta = getMetadata(type);
  const query = parseFindQuery(meta, where, opts);
  const batchKey = getBatchKeyFromGenericStructure(meta, query);

  return em.getLoader(
    "find",
    // It's unlikely we'll have simultaneous em.finds with the same WHERE clause structure
    // but lots of different load hints, and it'd be complicated to implement the preloading
    // in a way that doesn't naively over-fetch data (which our loadDataLoader does prevent,
    // but it's simpler b/c it's given exact ids to load), so for now just include the load
    // hint in the batch key.
    `${batchKey}-${JSON.stringify(hint)}`,
    async (queries) => {
      // We're guaranteed that these queries all have the same structure

      // Don't bother with the CTE if there's only 1 query (or each query has exactly the same filter values)
      if (queries.length === 1) {
        const { where, ...opts } = queries[0];
        // We have to parseFindQuery queries[0], b/c our query variable may be captured from
        // a prior invocation that instantiated our dataloader instance.
        const query = parseFindQuery(meta, where, opts);
        // Maybe add preload joins
        const { preloader } = getEmInternalApi(em);
        const preloadHydrator = preloader && hint && preloader.addPreloading(em, meta, buildHintTree(hint), query);
        const rows = await em.driver.executeFind(em, query, opts);
        ensureUnderLimit(em, rows);
        const entities = em.hydrate(type, rows);
        preloadHydrator?.(rows, entities);
        return [entities];
      }

      // WITH data(tag, arg1, arg2) AS (VALUES
      //   (0::int, 'a'::varchar, 'a'::varchar),
      //   (1, 'b', 'b'),
      //   (2, 'c', 'c')
      // )
      // SELECT array_agg(d.tag), a.*
      // FROM authors a
      // JOIN data d ON (d.arg1 = a.first_name OR d.arg2 = a.last_name)
      // group by a.id;

      // Build the list of 'arg1', 'arg2', ... strings
      const args = collectArgs(query);
      args.unshift({ columnName: "tag", dbType: "int" });

      const selects = ["array_agg(_find.tag) as _tags", ...query.selects];
      const [primary, joins] = getTables(query);

      // For each unique query, capture its filter values in `bindings` to populate the CTE _find table
      const bindings = createBindings(meta, queries);
      // Create the JOIN clause, i.e. ON a.firstName = _find.arg0
      const [conditions] = buildConditions(query.condition!);

      // Because we want to use `array_agg(tag)`, add `GROUP BY`s to the values we're selecting
      const groupBys = selects
        .filter((s) => typeof s === "string")
        .filter((s) => !s.includes("array_agg") && !s.includes("CASE") && !s.includes(" as "))
        .map((s) => s.replace("*", "id"));

      // Also because of our `array_agg` group by, add any order bys to the group by
      for (const o of query.orderBys) {
        if (o.alias !== primary.alias) {
          groupBys.push(kqDot(o.alias, o.column));
        }
      }

      const { preloader } = getEmInternalApi(em);
      const preloadJoins = preloader && hint && preloader.getPreloadJoins(em, meta, buildHintTree(hint), query);
      if (preloadJoins) {
        selects.push(
          ...preloadJoins.flatMap((j) =>
            // Because we 'group by primary.id' to collapse the "a1 matched multiple finds" into
            // a single row, we also need to pick just the first value of each preload column
            j.selects.map((s) => `(array_agg(${s.value}))[1] AS ${s.as}`),
          ),
        );
      }

      const sql = `
        ${buildValuesCte("_find", args, queries)}
        SELECT ${selects.join(", ")}
        FROM ${primary.table} as ${kq(primary.alias)}
        ${joins.map((j) => `${joinKeywords(j)} ${j.table} ${kq(j.alias)} ON ${j.col1} = ${j.col2}`).join(" ")}
        JOIN _find ON ${conditions}
        ${preloadJoins?.map((j) => j.join).join(" ") ?? ""}
        GROUP BY ${groupBys.join(", ")}
        ORDER BY ${query.orderBys.map((o) => `${kq(o.alias)}.${o.column} ${o.order}`).join(", ")}
        LIMIT ${em.entityLimit};
      `;

      const rows = await em.driver.executeQuery(em, cleanSql(sql), bindings);
      ensureUnderLimit(em, rows);

      const entities = em.hydrate(type, rows);
      preloadJoins?.forEach((j) => j.hydrator(rows, entities));

      // Make an empty array for each batched query, per the dataloader contract
      const results = queries.map(() => [] as T[]);
      // Then put each row into the tagged query it matched
      rows.forEach((row, i) => {
        const entity = entities[i];
        for (const tag of row._tags) results[tag].push(entity);
        delete row._tags;
      });
      return results;
    },
    // Our filter/order tuple is a complex object, so object-hash it to ensure caching works
    { cacheKeyFn: whereFilterHash },
  );
}

const Temporal = maybeRequireTemporal()?.Temporal;
// If a where clause includes an entity, object-hash cannot hash it, so just use the id.
function replacer(v: any) {
  if (isEntity(v)) {
    // Use toString() instead of id so that new entities are kept separate, i.e. `Author#2`
    return v.toString();
  } else if (isAlias(v)) {
    // Strip out `{ as: ...alias proxy... }` from the `em.find` inline conditions
    return "alias";
  } else if (Temporal) {
    if (v instanceof Temporal.ZonedDateTime) {
      return zonedDateTimeMapper.toDb(v);
    } else if (v instanceof Temporal.PlainDateTime) {
      return plainDateTimeMapper.toDb(v);
    } else if (v instanceof Temporal.PlainDate) {
      return plainDateMapper.toDb(v);
    } else if (v instanceof Temporal.PlainTime) {
      return plainTimeMapper.toDb(v);
    }
  }
  return v;
}

export function whereFilterHash(where: FilterAndSettings<any>): any {
  return hash(where, { replacer, algorithm: "md5" });
}

/** Collects & names all the args in a query, i.e. `['arg1', 'arg2']`--not the actual values. */
export function collectArgs(query: ParsedFindQuery): { columnName: string; dbType: string }[] {
  const args: { columnName: string; dbType: string }[] = [];
  visitConditions(query, {
    visitCond(c: ColumnCondition) {
      if ("value" in c.cond) {
        const { kind } = c.cond;
        if (kind === "in" || kind === "nin") {
          args.push({ columnName: `arg${args.length}`, dbType: `${c.dbType}[]` });
        } else if (kind === "between") {
          // between has two values
          args.push({ columnName: `arg${args.length}`, dbType: c.dbType });
          args.push({ columnName: `arg${args.length}`, dbType: c.dbType });
        } else {
          args.push({ columnName: `arg${args.length}`, dbType: c.dbType });
        }
      }
    },
  });
  return args;
}

export function collectAndReplaceArgs(query: ParsedFindQuery): { columnName: string; dbType: string }[] {
  const args: { columnName: string; dbType: string }[] = [];
  let argsIndex = 0;
  visitConditions(query, {
    visitCond(c: ColumnCondition) {
      if ("value" in c.cond) {
        const { kind } = c.cond;
        if (kind === "in" || kind === "nin") {
          args.push({ columnName: `arg${args.length}`, dbType: `${c.dbType}[]` });
        } else if (kind === "between") {
          // between has two values
          args.push({ columnName: `arg${args.length}`, dbType: c.dbType });
          args.push({ columnName: `arg${args.length}`, dbType: c.dbType });
        } else {
          args.push({ columnName: `arg${args.length}`, dbType: c.dbType });
          const [op, argsTaken, negate] = makeOp(c.cond, argsIndex);
          argsIndex += argsTaken;
          return {
            kind: "raw",
            aliases: [c.alias],
            condition: `${negate ? "NOT " : ""}${kqDot(c.alias, c.column)} ${op}`,
            pruneable: c.pruneable ?? false,
            bindings: [],
          } satisfies RawCondition;
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

export function createBindings(meta: EntityMetadata, queries: readonly FilterAndSettings<any>[]): any[] {
  const bindings: any[] = [];
  queries.forEach((query, i) => {
    const { where, ...opts } = query;
    // add this query's `tag` value
    bindings.push(i);
    collectValues(bindings, parseFindQuery(meta, where, opts));
  });
  return bindings;
}

/** Pushes the arg values of a given query in the cross-query `bindings` array. */
function collectValues(bindings: any[], query: ParsedFindQuery): void {
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

/**
 * Creates the `a1.firstName = _find.args1` AND a2.lastName = _find.args2` condition
 * that joins our `_find` CTE (1 row per query that's getting auto-joined together)
 * into the main table.
 *
 * We return a tuple for `[SQL, argsTaken]`, but `argsTaken` is only used for recursive
 * calls to know which `_find.argsX` they should use, as we match up columns of the `_find`
 * CTE (`args0`, `args1`, `args2`, ...) to positions in the `JOIN ON (...)` "batched where"
 * clause.
 */
export function buildConditions(ef: ParsedExpressionFilter, argsIndex: number = 0): [string, number] {
  const conditions = [] as string[];
  const originalIndex = argsIndex;
  ef.conditions.forEach((c) => {
    if (c.kind === "column") {
      const [op, argsTaken, negate] = makeOp(c.cond, argsIndex);
      if (c.alias === "unset") {
        throw new Error("Alias was not bound in em.find");
      }
      if (negate) {
        conditions.push(`NOT (${kqDot(c.alias, c.column)} ${op})`);
      } else {
        conditions.push(`${kqDot(c.alias, c.column)} ${op}`);
      }
      argsIndex += argsTaken;
    } else if (c.kind === "exp") {
      let [cond, argsTaken] = buildConditions(c, argsIndex);
      const needsWrap = !("cond" in c);
      if (needsWrap) cond = `(${cond})`;
      conditions.push(cond);
      argsIndex += argsTaken;
    } else if (c.kind === "raw") {
      conditions.push(c.condition);
      if (c.bindings.length > 0) {
        throw new Error("RawConditions with bindings is not batchable yet");
      }
    } else {
      throw new Error(`Unsupported condition kind ${c}`);
    }
  });
  const argsTaken = argsIndex - originalIndex;
  return [conditions.join(` ${ef.op.toUpperCase()} `), argsTaken];
}

/** Returns [operator, argsTaken, negate], i.e. `["=", 1, false]`. */
function makeOp(cond: ParsedValueFilter<any>, argsIndex: number): [string, number, boolean] {
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
    case "contains":
    case "overlaps":
    case "containedBy": {
      const fn = opToFn[cond.kind] ?? fail(`Invalid operator ${cond.kind}`);
      return [`${fn} _find.arg${argsIndex}`, 1, false];
    }
    case "noverlaps":
    case "ncontains": {
      const fn = (opToFn as any)[cond.kind.substring(1)] ?? fail(`Invalid operator ${cond.kind}`);
      return [`${fn} _find.arg${argsIndex}`, 1, true];
    }
    case "is-null":
      return [`IS NULL`, 0, false];
    case "not-null":
      return [`IS NOT NULL`, 0, false];
    case "in":
      return [`= ANY(_find.arg${argsIndex})`, 1, false];
    case "nin":
      return [`!= ALL(_find.arg${argsIndex})`, 1, false];
    case "between":
      return [`BETWEEN _find.arg${argsIndex} AND _find.arg${argsIndex + 1}`, 2, false];
    default:
      assertNever(cond);
  }
}

export function buildValuesCte(
  tableName: string,
  columns: { columnName: string; dbType: string }[],
  rows: readonly any[],
): string {
  return `WITH ${tableName} (${columns.map((c) => `${kq(c.columnName)}`).join(", ")}) AS (VALUES
      ${rows.map((_, i) => `(${columns.map((c) => (i === 0 ? `?::${c.dbType}` : `?`)).join(", ")})`).join(", ")}
  )`;
}

function ensureUnderLimit(em: EntityManager, rows: unknown[]): void {
  if (rows.length >= em.entityLimit) {
    throw new Error(`Query returned more than ${em.entityLimit} rows`);
  }
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
