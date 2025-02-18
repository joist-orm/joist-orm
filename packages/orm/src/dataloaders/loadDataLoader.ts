import DataLoader from "dataloader";
import { getInstanceData } from "../BaseEntity";
import { Entity } from "../Entity";
import { EntityManager, getEmInternalApi } from "../EntityManager";
import { EntityMetadata } from "../EntityMetadata";
import { buildHintTree } from "../HintTree";
import { ParsedFindQuery, addTablePerClassJoinsAndClassTag } from "../QueryParser";
import { keyToNumber } from "../keys";
import { LoadHint } from "../loadHints";
import { abbreviation, indexBy } from "../utils";

export function loadDataLoader<T extends Entity>(
  em: EntityManager,
  meta: EntityMetadata,
  overwriteExisting: boolean = false,
): DataLoader<{ entity: string; hint: LoadHint<T> | undefined }, T | undefined> {
  // Batch different populate hints together and defer to the hint tree to do the right thing
  return em.getLoader(`load-${overwriteExisting}`, meta.type, async (loads) => {
    const keys = loads.map((l) => keyToNumber(meta, l.entity));
    const alias = abbreviation(meta.tableName);
    const query = {
      selects: [`"${alias}".*`],
      tables: [{ alias, join: "primary", table: meta.tableName }],
      condition: {
        kind: "exp",
        op: "and",
        conditions: [{ kind: "column", alias, column: "id", dbType: meta.idDbType, cond: { kind: "in", value: keys } }],
      },
      orderBys: [{ alias, column: "id", order: "ASC" }],
    } satisfies ParsedFindQuery;
    addTablePerClassJoinsAndClassTag(query, meta, alias, true);
    // Inject preloading joins into the query if enabled
    const { preloader } = getEmInternalApi(em);
    const preloadHydrator = preloader && preloader.addPreloading(em, meta, buildHintTree(loads), query);
    // Skip maybeAddOrderBy?
    // maybeAddNotSoftDeleted(conditions, meta, alias, "include");
    const rows = await em.driver.executeFind(em, query, {});
    // Pass overwriteExisting (which defaults to false) because it might be EntityManager.refresh calling us.
    const entities = em.hydrate(meta.cstr, rows, { overwriteExisting });
    preloadHydrator && preloadHydrator(rows, entities);

    // Return the results back in the same order as the keys
    const entitiesById = indexBy(entities, (e) => e.idTagged!);
    return loads.map(({ entity: id }) => {
      const entity = entitiesById.get(id);
      // We generally expect all of our entities to be found, but they may not for API calls like
      // `findOneOrFail` or for `EntityManager.refresh` when the entity has been deleted out from
      // under us.
      if (entity === undefined) {
        const existingEntity = em.findExistingInstance<T>(id);
        if (existingEntity) {
          getInstanceData(existingEntity).markDeletedBecauseNotFound();
        }
      }
      return entity;
    });
  });
}
