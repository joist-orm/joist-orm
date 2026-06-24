import { Entity } from "../Entity";
import { FilterAndSettings } from "../EntityFilter";
import { EntityManager, MaybeAbstractEntityConstructor } from "../EntityManager";
import { getMetadata } from "../EntityMetadata";
import { keyToTaggedId } from "../keys";
import { kq } from "../keywords";
import { ParsedFindQuery, parseFindQuery } from "../QueryParser";
import { buildUnnestCte } from "../unnest";
import { fail } from "../utils";
import {
  collectAndReplaceArgs,
  collectValues,
  createColumnValuesFromPrepared,
  getBatchKeyFromGenericStructure,
  queryFilterHash,
} from "./findDataLoader";

export const findIdsOperation = "find-ids";

export function findIdsDataLoader<T extends Entity>(
  em: EntityManager,
  type: MaybeAbstractEntityConstructor<T>,
  filter: FilterAndSettings<T>,
): Promise<string[]> {
  const { where, ...opts } = filter;
  if (opts.limit || opts.offset) {
    throw new Error("Cannot use limit/offset with findIdsDataLoader");
  }

  const meta = getMetadata(type);
  const query = parseFindQuery(meta, where, opts);
  const { findSettings } = em["prepareFind"](meta, findIdsOperation, query, { ...opts, limit: undefined });
  const bindings: any[] = [];
  collectValues(bindings, query);
  const prepared = { filter, query, bindings, findSettings };
  const batchKey = getBatchKeyFromGenericStructure(meta, query);

  return em
    .getLoader<typeof prepared, string[]>(
      findIdsOperation,
      batchKey,
      async (entries) => {
        // We're guaranteed that these queries all have the same structure

        // Don't bother with the CTE if there's only 1 query (or each query has exactly the same filter values)
        if (entries.length === 1) {
          const { query, findSettings } = entries[0];
          const primary = query.tables.find((t) => t.join === "primary") ?? fail("No primary");
          query.selects = [`${kq(primary.alias)}.id as id`];
          query.orderBys = [{ alias: primary.alias, column: "id", order: "ASC" }];
          const rows = await em["executePreparedFind"](meta, findIdsOperation, query, findSettings, false);
          return [rows.map((row: any) => keyToTaggedId(meta, row.id)!)];
        }

        // WITH _find (tag, arg1, arg2) AS (
        //   SELECT unnest($0::int[]) unnest($0::varchar[]), unnest($0::varchar[])
        // )
        // SELECT _find.tag, _data.id
        // FROM _find
        // CROSS JOIN LATERAL (
        //   SELECT distinct a.id as id
        //   FROM author a WHERE a.first_name = _find.arg1 OR a.last_name = _find.arg2
        // ) _data

        // Build the list of 'arg1', 'arg2', ... strings
        const { query, findSettings } = entries[0];
        const argsColumns = collectAndReplaceArgs(query);
        argsColumns.unshift({ columnName: "tag", dbType: "int" });

        // We're not returning the entities, just selecting their IDs
        const primary = query.tables.find((t) => t.join === "primary") ?? fail("No primary");
        query.selects = [`${kq(primary.alias)}.id as id`];
        query.orderBys = [{ alias: primary.alias, column: "id", order: "ASC" }];

        const query2: ParsedFindQuery = {
          selects: ["_find.tag as tag", "_data.id as id"],
          tables: [
            { join: "primary", table: "_find", alias: "_find" },
            { join: "lateral", query, table: meta.tableName, alias: "_data", fromAlias: "_f" },
          ],
          // For each unique query, capture its filter values in `bindings` to populate the CTE _find table
          ctes: [buildUnnestCte("_find", argsColumns, createColumnValuesFromPrepared(argsColumns, entries))],
          orderBys: [],
        };

        const rows = await em["executePreparedFind"](meta, findIdsOperation, query2, findSettings, false);

        // Make an empty array for each batched query, per the dataloader contract
        const results: string[][] = entries.map(() => []);
        // Then put each row's ID into the tagged query it matched
        for (const row of rows) {
          results[row.tag].push(keyToTaggedId(meta, row.id)!);
        }
        return results;
      },
      // Our filter/order tuple is a complex object, so use a stable cache key to ensure caching works.
      { cacheKeyFn: queryFilterHash },
    )
    .load(prepared);
}
