import DataLoader from "dataloader";
import { Entity } from "../Entity";
import { FilterAndSettings } from "../EntityFilter";
import { EntityManager, MaybeAbstractEntityConstructor } from "../EntityManager";
import { getMetadata } from "../EntityMetadata";
import { kq } from "../keywords";
import { ParsedFindQuery, parseFindQuery } from "../QueryParser";
import { buildUnnestCte } from "../unnest";
import { fail } from "../utils";
import {
  collectAndReplaceArgs,
  createColumnValues,
  getBatchKeyFromGenericStructure,
  whereFilterHash,
} from "./findDataLoader";

export const findCountOperation = "find-count";

export function findCountDataLoader<T extends Entity>(
  em: EntityManager,
  type: MaybeAbstractEntityConstructor<T>,
  filter: FilterAndSettings<T>,
): DataLoader<FilterAndSettings<T>, number> {
  const { where, ...opts } = filter;
  if (opts.limit || opts.offset) {
    throw new Error("Cannot use limit/offset with findCountDataLoader");
  }

  const meta = getMetadata(type);
  const query = parseFindQuery(meta, where, opts);
  const batchKey = getBatchKeyFromGenericStructure(meta, query);

  return em.getLoader(
    findCountOperation,
    batchKey,
    async (queries) => {
      // We're guaranteed that these queries all have the same structure

      // Don't bother with the CTE if there's only 1 query (or each query has exactly the same filter values)
      if (queries.length === 1) {
        const { where, ...options } = queries[0];
        const meta = getMetadata(type);
        const query = parseFindQuery(meta, where, options);
        const primary = query.tables.find((t) => t.join === "primary") ?? fail("No primary");
        query.selects = [`count(distinct ${kq(primary.alias)}.id) as count`];
        query.orderBys = [];
        const rows = await em["executeFind"](meta, findCountOperation, query, {});
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
      const { where, ...options } = queries[0];
      const query = parseFindQuery(getMetadata(type), where, options);
      const argsColumns = collectAndReplaceArgs(query);
      argsColumns.unshift({ columnName: "tag", dbType: "int" });

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
        ctes: [buildUnnestCte("_find", argsColumns, createColumnValues(meta, argsColumns, queries))],
        orderBys: [],
      };

      const rows = await em["executeFind"](meta, findCountOperation, query2, {});

      // Make an empty array for each batched query, per the dataloader contract
      const results = queries.map(() => 0);
      // Then put each row into the tagged query it matched
      for (const row of rows) {
        results[row.tag] = Number(row.count);
      }
      return results;
    },
    // Our filter/order tuple is a complex object, so object-hash it to ensure caching works
    { cacheKeyFn: whereFilterHash },
  );
}
