import DataLoader from "dataloader";
import { Entity } from "../Entity";
import { FilterAndSettings } from "../EntityFilter";
import { EntityManager, MaybeAbstractEntityConstructor } from "../EntityManager";
import { getMetadata } from "../EntityMetadata";
import { combineConditions, getTables, joinKeywords, parseFindQuery } from "../QueryParser";
import { cleanSql, fail } from "../utils";
import {
  buildConditions,
  buildValuesCte,
  collectArgs,
  createBindings,
  getKeyFromGenericStructure,
  whereFilterHash,
} from "./findDataLoader";

export function findCountDataLoader<T extends Entity>(
  em: EntityManager,
  type: MaybeAbstractEntityConstructor<T>,
  filter: FilterAndSettings<T>,
): DataLoader<FilterAndSettings<T>, number> {
  const { where, ...opts } = filter;
  if (opts.limit || opts.offset) {
    throw new Error("Cannot use limit/offset with findDataLoader");
  }

  const meta = getMetadata(type);
  const query = parseFindQuery(meta, where, opts);
  const batchKey = getKeyFromGenericStructure(query);

  return em.getLoader(
    "find-count",
    batchKey,
    async (queries) => {
      // We're guaranteed that these queries all have the same structure

      // Don't bother with the CTE if there's only 1 query (or each query has exactly the same filter values)
      if (queries.length === 1) {
        const { where, ...options } = queries[0];
        const query = parseFindQuery(getMetadata(type), where, options);
        const primary = query.tables.find((t) => t.join === "primary") ?? fail("No primary");
        query.selects = [`count(distinct "${primary.alias}".id) as count`];
        query.orderBys = [];
        const rows = await em.driver.executeFind(em, query, {});
        return [Number(rows[0].count)];
      }

      // WITH data(tag, arg1, arg2) AS (VALUES
      //   (0::int, 'a'::varchar, 'a'::varchar),
      //   (1, 'b', 'b'),
      //   (2, 'c', 'c')
      // )
      // SELECT d.tag, count(*)
      // FROM authors a
      // JOIN data d ON (d.arg1 = a.first_name OR d.arg2 = a.last_name)
      // group by d.tag;

      // Build the list of 'arg1', 'arg2', ... strings
      const args = collectArgs(query);
      args.unshift({ columnName: "tag", dbType: "int" });

      const selects = ["_find.tag as tag", "count(*) as count"];
      const [primary, joins] = getTables(query);

      // For each unique query, capture its filter values in `bindings` to populate the CTE _find table
      const bindings = createBindings(meta, queries);
      // Create the JOIN clause, i.e. ON a.firstName = _find.arg0
      const [conditions] = buildConditions(combineConditions(query));

      const sql = `
        ${buildValuesCte("_find", args, queries)}
        SELECT ${selects.join(", ")}
        FROM ${primary.table} as ${primary.alias}
        ${joins.map((j) => `${joinKeywords(j)} ${j.table} ${j.alias} ON ${j.col1} = ${j.col2}`).join(" ")}
        JOIN _find ON ${conditions}
        GROUP BY _find.tag
      `;

      const rows = await em.driver.executeQuery(em, cleanSql(sql), bindings);

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
