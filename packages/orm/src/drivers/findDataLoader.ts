import DataLoader from "dataloader";
import Knex, { QueryBuilder } from "knex";
import hash from "object-hash";
import { Entity, EntityConstructor, entityLimit, getMetadata, isEntity } from "../EntityManager";
import { buildQuery, FilterAndSettings } from "../QueryBuilder";
import { getOrSet } from "../utils";
import { LoaderCache } from "./EntityPersister";

export function loaderForFind<T extends Entity>(
  knex: Knex,
  cache: LoaderCache,
  type: EntityConstructor<T>,
): DataLoader<FilterAndSettings<T>, unknown[]> {
  return getOrSet(cache, type.name, () => {
    return new DataLoader<FilterAndSettings<T>, unknown[], string>(
      async (queries) => {
        function ensureUnderLimit(rows: unknown[]): unknown[] {
          if (rows.length >= entityLimit) {
            throw new Error(`Query returned more than ${entityLimit} rows`);
          }
          return rows;
        }

        // If there is only 1 query, we can skip the tagging step.
        if (queries.length === 1) {
          return [ensureUnderLimit(await buildQuery(knex, type, queries[0]))];
        }

        // Map each incoming query[i] to itself or a previous dup
        const uniqueQueries: FilterAndSettings<T>[] = [];
        const queryToUnique: Record<number, number> = {};
        queries.forEach((q, i) => {
          let j = uniqueQueries.findIndex((uq) => whereFilterHash(uq) === whereFilterHash(q));
          if (j === -1) {
            uniqueQueries.push(q);
            j = uniqueQueries.length - 1;
          }
          queryToUnique[i] = j;
        });

        // There are duplicate queries, but only one unique query, so we can execute just it w/o tagging.
        if (uniqueQueries.length === 1) {
          const rows = ensureUnderLimit(await buildQuery(knex, type, queries[0]));
          // Reuse this same result for however many callers asked for it.
          return queries.map(() => rows);
        }

        // TODO: Instead of this tagged approach, we could probably check if the each
        // where cause: a) has the same structure for joins, and b) has conditions that
        // we can evaluate client-side, and then combine it into a query like:
        //
        // SELECT entity.*, t1.foo as condition1, t2.bar as condition2 FROM ...
        // WHERE t1.foo (union of each queries condition)
        //
        // And then use the `condition1` and `condition2` to tease the combined result set
        // back apart into each condition's result list.

        // For each query, add an additional `__tag` column that will identify that query's
        // corresponding rows in the combined/UNION ALL'd result set.
        //
        // We also add a `__row` column with that queries order, so that after we `UNION ALL`,
        // we can order by `__tag` + `__row` and ensure we're getting back the combined rows
        // exactly as they would be in done individually (i.e. per the docs `UNION ALL` does
        // not gaurantee order).
        const tagged = uniqueQueries.map((queryAndSettings, i) => {
          const query = buildQuery(knex, type, queryAndSettings) as QueryBuilder;
          return query.select(knex.raw(`${i} as __tag`), knex.raw("row_number() over () as __row"));
        });

        const meta = getMetadata(type);

        // Kind of dumb, but make a dummy row to start our query with
        let query = knex
          .select("*", knex.raw("-1 as __tag"), knex.raw("-1 as __row"))
          .from(meta.tableName)
          .orderBy("__tag", "__row")
          .where({ id: -1 });

        // Use the dummy query as a base, then `UNION ALL` in all the rest
        tagged.forEach((add) => {
          query = query.unionAll(add, true);
        });

        // Issue a single SQL statement for all of them
        const rows = ensureUnderLimit(await query);

        const resultForUniques: any[][] = [];
        uniqueQueries.forEach((q, i) => {
          resultForUniques[i] = [];
        });
        rows.forEach((row: any) => {
          resultForUniques[row["__tag"]].push(row);
        });

        // We return an array-of-arrays, where result[i] is the rows for queries[i]
        const result: any[][] = [];
        queries.forEach((q, i) => {
          result[i] = resultForUniques[queryToUnique[i]];
        });
        return result;
      },
      {
        // Our filter/order tuple is a complex object, so object-hash it to ensure caching works
        cacheKeyFn: whereFilterHash,
      },
    );
  });
}

// If a where clause includes an entity, object-hash cannot hash it, so just use the id.
const replacer = (v: any) => (isEntity(v) ? v.id : v);

function whereFilterHash(where: FilterAndSettings<any>): string {
  return hash(where, { replacer });
}
