import DataLoader from "dataloader";
import { Entity } from "../Entity";
import { EntityManager } from "../EntityManager";
import { EntityMetadata } from "../EntityMetadata";
import { assertIdsAreTagged, deTagIds } from "../keys";
import { abbreviation } from "../QueryBuilder";
import { addTablePerClassJoinsAndClassTag, ParsedFindQuery } from "../QueryParser";
import { getOrSet, indexBy } from "../utils";

export function loadDataLoader<T extends Entity>(
  em: EntityManager,
  meta: EntityMetadata<T>,
): DataLoader<string, T | undefined> {
  return getOrSet(em.loadLoaders, meta.type, () => {
    return new DataLoader<string, T | undefined>(async (_keys) => {
      assertIdsAreTagged(_keys);
      const keys = deTagIds(meta, _keys);

      // const rows = await em.driver.load(em, meta, keys);

      const alias = abbreviation(meta.tableName);
      const query: ParsedFindQuery = {
        selects: [`"${alias}".*`],
        tables: [{ alias, join: "primary", table: meta.tableName }],
        conditions: [{ alias, column: "id", cond: { kind: "in", value: keys } }],
        orderBys: [{ alias, column: "id", order: "ASC" }],
      };

      addTablePerClassJoinsAndClassTag(query, meta, alias, true);
      // maybeAddNotSoftDeleted(conditions, meta, alias, "include");

      const rows = await em.driver.executeFind(em, query, {});

      // Pass overwriteExisting (which is the default anyway) because it might be EntityManager.refresh calling us.
      const entities = rows.map((row) => em.hydrate(meta.cstr, row, { overwriteExisting: true }));
      const entitiesById = indexBy(entities, (e) => e.idTagged!);

      // Return the results back in the same order as the keys
      return _keys.map((k) => {
        const entity = entitiesById.get(k);
        // We generally expect all of our entities to be found, but they may not for API calls like
        // `findOneOrFail` or for `EntityManager.refresh` when the entity has been deleted out from
        // under us.
        if (entity === undefined) {
          const existingEntity = em.findExistingInstance<T>(k);
          if (existingEntity) {
            existingEntity.__orm.deleted = "deleted";
          }
        }
        return entity;
      });
    });
  });
}
