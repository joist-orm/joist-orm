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
  ParsedFindQuery,
  ParsedValueFilter,
  RawCondition,
  getTables,
  parseAlias,
  parseFindQuery,
} from "../QueryParser";
import { visitConditions } from "../QueryVisitor";
import { buildRawQuery } from "../drivers/buildRawQuery";
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
        const preloadHydrator = preloader && hint && preloader.addPreloading(meta, buildHintTree(hint), query);
        const rows = await em.driver.executeFind(em, query, opts);
        ensureUnderLimit(em, rows);
        const entities = em.hydrate(type, rows);
        preloadHydrator?.(rows, entities);
        return [entities];
      }

      // WITH _find (tag, arg1, arg2) AS (VALUES
      //   (0::int, 'a'::varchar, 'a'::varchar),
      //   (1, 'b', 'b'),
      //   (2, 'c', 'c')
      // )
      // SELECT a.*, array_agg(_find.tag) AS _tags
      // FROM authors a
      // CROSS JOIN _find AS _find
      // WHERE a.first_name = _find.arg0 OR a.last_name = _find.arg1
      // GROUP BY a.id

      // Build the list of 'arg1', 'arg2', ... strings
      const { where, ...options } = queries[0];
      const query = parseFindQuery(getMetadata(type), where, options);
      const args = collectAndReplaceArgs(query);
      args.unshift({ columnName: "tag", dbType: "int" });

      query.selects.unshift("array_agg(_find.tag) as _tags");
      // Inject a cross join into the query
      query.tables.unshift({ join: "cross", table: "_find", alias: "_find" });
      query.cte = {
        sql: buildValuesCte("_find", args, queries),
        bindings: createBindings(meta, queries),
      };
      // Because we want to use `array_agg(tag)`, add `GROUP BY`s to the values we're selecting
      query.groupBys = query.selects
        .filter((s) => typeof s === "string")
        .filter((s) => !s.includes("array_agg") && !s.includes("CASE") && !s.includes(" as "))
        .map((s) => {
          // Make a liberal assumption that this is a `a.id` or `a_st0.id` string
          const alias = parseAlias(s);
          return { alias, column: "id" };
        });

      // Also because of our `array_agg` group by, add any order bys to the group by
      const [primary] = getTables(query);
      for (const { alias, column } of query.orderBys) {
        if (alias !== primary.alias) {
          query.groupBys.push({ alias, column });
        }
      }

      const { preloader } = getEmInternalApi(em);
      const preloadJoins = preloader && hint && preloader.getPreloadJoins(meta, buildHintTree(hint), query);
      if (preloadJoins) {
        query.selects.push(
          ...preloadJoins.flatMap((j) =>
            // Because we 'group by primary.id' to collapse the "a1 matched multiple finds" into
            // a single row, we also need to pick just the first value of each preload column
            j.selects.map((s) => `(array_agg(${s.value}))[1] AS ${s.as}`),
          ),
        );
        query.tables.push(...preloadJoins.map((j) => j.join));
      }

      const { sql, bindings } = buildRawQuery(query, { limit: em.entityLimit });
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
