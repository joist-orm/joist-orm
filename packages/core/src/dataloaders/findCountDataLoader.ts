import { Entity, IdType } from "../Entity";
import { FilterAndSettings, FindFilter } from "../EntityFilter";
import { GraphQLFilterWithAlias } from "../EntityGraphQLFilter";
import {
  EntityManager,
  FindCountFilterOptions,
  getEmInternalApi,
  MaybeAbstractEntityConstructor,
} from "../EntityManager";
import { getMetadata } from "../EntityMetadata";
import { kq } from "../keywords";
import { ParsedFindQuery, parseFindQuery } from "../QueryParser";
import { isScope, isSelectAllFilter, resolveScope } from "../scopes";
import { buildUnnestCte } from "../unnest";
import { fail } from "../utils";
import {
  collectAndReplaceArgs,
  collectValues,
  createColumnValuesFromPrepared,
  getBatchKeyFromGenericStructure,
  queryFilterHash,
} from "./findDataLoader";

export const findCountOperation = "find-count";

export function findCountDataLoader<T extends Entity>(
  em: EntityManager,
  type: MaybeAbstractEntityConstructor<T>,
  filter: FilterAndSettings<T>,
): Promise<number> {
  const { where, ...opts } = filter;
  if (opts.limit || opts.offset) {
    throw new Error("Cannot use limit/offset with findCountDataLoader");
  }

  const meta = getMetadata(type);
  const query = parseFindQuery(meta, where, opts);
  const pendingDeletedIds = appendPendingDeletedIds(em, type, query, meta.idDbType, where, opts);
  const { findSettings } = em["prepareFind"](meta, findCountOperation, query, { ...opts, checkLimit: false });
  const bindings: any[] = [];
  collectValues(bindings, query);
  const prepared = { filter, pendingDeletedIds, query, bindings, findSettings };
  const batchKey = getBatchKeyFromGenericStructure(meta, query);

  return em
    .getLoader<typeof prepared, number>(
      findCountOperation,
      batchKey,
      async (entries) => {
        // We're guaranteed that these queries all have the same structure

        // Don't bother with the CTE if there's only 1 query (or each query has exactly the same filter values)
        if (entries.length === 1) {
          const { query, findSettings } = entries[0];
          const primary = query.tables.find((t) => t.join === "primary") ?? fail("No primary");
          query.selects = [`count(distinct ${kq(primary.alias)}.id) as count`];
          query.orderBys = [];
          const rows = await em["executePreparedFind"](meta, findCountOperation, query, findSettings, false);
          return [Number(rows[0].count)];
        }

        // WITH _find (tag, arg1, arg2) AS (
        //  SELECT unnest($0::int[]), unnest($0::varchar[]), unnest($0::varchar[])
        // )
        // SELECT _find.tag, _data.count
        // FROM _find
        // CROSS JOIN LATERAL (
        //   SELECT count(*) as count
        //   FROM author a WHERE a.first_name = _find.arg1 OR a.last_name = _find.arg2
        // ) _data

        // Build the list of 'arg1', 'arg2', ... strings
        const { query, findSettings } = entries[0];
        const args = collectAndReplaceArgs(query, entries);
        const argsColumns = [{ columnName: "tag", dbType: "int" }, ...args.map((a) => a.column)];

        // We're not returning the entities, just counting them...
        const primary = query.tables.find((t) => t.join === "primary") ?? fail("No primary");
        query.selects = [`count(distinct ${kq(primary.alias)}.id) as count`];
        query.orderBys = [];

        const query2: ParsedFindQuery = {
          selects: ["_find.tag as tag", "_data.count as count"],
          tables: [
            { join: "primary", table: "_find", alias: "_find" },
            // Not sure what fromAlias is for/that it matters...
            { join: "lateral", query: query, table: meta.tableName, alias: "_data", fromAlias: "_f" },
          ],
          // For each unique query, capture its filter values in `bindings` to populate the CTE _find table
          ctes: [buildUnnestCte("_find", argsColumns, createColumnValuesFromPrepared(args, entries))],
          orderBys: [],
        };

        const rows = await em["executePreparedFind"](meta, findCountOperation, query2, findSettings, false);

        // Make an empty array for each batched query, per the dataloader contract
        const results = entries.map(() => 0);
        // Then put each row into the tagged query it matched
        for (const row of rows) {
          results[row.tag] = Number(row.count);
        }
        return results;
      },
      // Our filter/order tuple is a complex object, so use a stable cache key to ensure caching works.
      { cacheKeyFn: (entry) => queryFilterHash(entry) },
    )
    .load(prepared);
}

/** Merges root-scope count/id settings with caller options, dropping pagination-only settings. */
export function mergeCountOptions<T extends Entity>(
  where: FindFilter<T>,
  options: FindCountFilterOptions<T>,
): { where: FindFilter<T>; options: FindCountFilterOptions<T> };
export function mergeCountOptions<T extends Entity>(
  where: FindFilter<T> | GraphQLFilterWithAlias<T>,
  options: FindCountFilterOptions<T>,
): { where: FindFilter<T> | GraphQLFilterWithAlias<T>; options: FindCountFilterOptions<T> };
export function mergeCountOptions<T extends Entity>(
  where: FindFilter<T> | GraphQLFilterWithAlias<T>,
  options: FindCountFilterOptions<T>,
): { where: FindFilter<T> | GraphQLFilterWithAlias<T>; options: FindCountFilterOptions<T> } {
  if (!isScope<T>(where)) return { where, options };

  const resolved = resolveScope(where);
  const scopeOptions: FindCountFilterOptions<T> = {};
  if (resolved.softDeletes !== undefined) scopeOptions.softDeletes = resolved.softDeletes;
  return { where, options: { ...scopeOptions, ...options } };
}

/** Adds `id not in pendingDeletedIds` to the count query so pending deletes are excluded in SQL. */
function appendPendingDeletedIds<T extends Entity>(
  em: EntityManager,
  type: MaybeAbstractEntityConstructor<T>,
  query: ParsedFindQuery,
  idDbType: "bigint" | "int" | "uuid" | "text",
  where: FilterAndSettings<T>["where"],
  opts: Omit<FilterAndSettings<T>, "where">,
): readonly IdType[] {
  const pendingDeletedIds = isSelectAllFilter(where, opts.conditions)
    ? []
    : getEmInternalApi(em).pendingDeleteIds(type);
  if (pendingDeletedIds.length === 0) return pendingDeletedIds;

  const primary = query.tables.find((t) => t.join === "primary") ?? fail("No primary");
  const condition = {
    kind: "column" as const,
    alias: primary.alias,
    column: "id",
    dbType: idDbType,
    cond: { kind: "nin" as const, value: pendingDeletedIds },
    pruneable: true,
  };

  if (!query.condition) {
    query.condition = { kind: "exp", op: "and", conditions: [condition] };
  } else if (query.condition.op === "and") {
    query.condition.conditions.push(condition);
  } else {
    query.condition = { kind: "exp", op: "and", conditions: [query.condition, condition] };
  }
  return pendingDeletedIds;
}
