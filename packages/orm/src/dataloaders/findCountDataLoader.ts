import DataLoader from "dataloader";
import { Entity } from "../Entity";
import { FilterAndSettings } from "../EntityFilter";
import { EntityManager, MaybeAbstractEntityConstructor } from "../EntityManager";
import { getMetadata } from "../EntityMetadata";
import { parseFindQuery } from "../QueryParser";
import { fail } from "../utils";
import { whereFilterHash } from "./findDataLoader";

export function findCountDataLoader<T extends Entity>(
  em: EntityManager,
  type: MaybeAbstractEntityConstructor<T>,
  softDeletes: "include" | "exclude",
): DataLoader<FilterAndSettings<T>, number> {
  const batchKey = `${type.name}-${softDeletes}`;
  return em.getLoader(
    "find-count",
    batchKey,
    async (queries) => {
      // We don't actually de-N+1 yet, b/c how many counts are you really
      // going to do in a loop with same-structure-but-different-params?
      return Promise.all(
        queries.map(async (filterAndSettings) => {
          const { where, ...options } = filterAndSettings;
          const query = parseFindQuery(getMetadata(type), where, options);
          const primary = query.tables.find((t) => t.join === "primary") ?? fail("No primary");
          query.selects = [`count(distinct "${primary.alias}".id) as count`];
          query.orderBys = [];
          const rows = await em.driver.executeFind(em, query, {});
          return Number(rows[0].count);
        }),
      );
    },
    // Our filter/order tuple is a complex object, so object-hash it to ensure caching works
    { cacheKeyFn: whereFilterHash },
  );
}
