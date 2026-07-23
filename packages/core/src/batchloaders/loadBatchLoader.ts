import { getInstanceData } from "../BaseEntity";
import { EntityManager, getEmInternalApi } from "../EntityManager";
import { EntityMetadata } from "../EntityMetadata";
import { buildHintTree } from "../HintTree";
import { ParsedFindQuery, addTablePerClassJoinsAndClassTag, lazyExcludedSelects } from "../QueryParser";
import { keyToNumber, tagId } from "../keys";
import { LoadHint } from "../loadHints";
import { abbreviation } from "../utils";
import { BatchLoader } from "./BatchLoader";

export const loadOperation = "load";

/**
 * Batches em.load-style fetches, writing to identity map (via hydrate) instead of returning values.
 * After the batch resolves, callers retrieve their entity from `em.findExistingInstance`.
 *
 * Accepts tuples of `{ taggedId, hint }` so the preloader can inject join-based
 * preloading into the same SELECT that fetches the entities.
 */
export function loadBatchLoader(
  em: EntityManager,
  meta: EntityMetadata,
  overwriteExisting: boolean = false,
): BatchLoader<{ taggedId: string; hint: LoadHint<any> | undefined }> {
  return em.getBatchLoader(loadOperation, `${meta.type}-${overwriteExisting}`, async (loads) => {
    const keys = loads.map((l) => keyToNumber(meta, l.taggedId));
    const alias = abbreviation(meta.tableName);
    const query = {
      selects: meta.hasLazyColumns ? lazyExcludedSelects(meta, alias) : [`"${alias}".*`],
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
    const preloadHydrator =
      preloader &&
      preloader.addPreloading(meta, buildHintTree(loads.map((l) => ({ entity: l.taggedId, hint: l.hint }))), query);
    const rowData = await em["executeFindRowData"](meta, loadOperation, query, {});
    const entities = em.hydrateFromRowData(meta.cstr, rowData, { overwriteExisting });
    preloadHydrator && preloadHydrator(rowData, entities);
    // If we're missing any requested rows, mark any requested-but-not-found entities as deleted
    if (rowData.rowCount !== loads.length) {
      const foundIds = new Set<string>();
      for (let i = 0; i < rowData.rowCount; i++) foundIds.add(tagId(meta, rowData.get(i, "id")));
      for (const load of loads) {
        if (!foundIds.has(load.taggedId)) {
          const existingEntity = em.findExistingInstance(load.taggedId);
          if (existingEntity) {
            getInstanceData(existingEntity).markDeletedBecauseNotFound();
          }
        }
      }
    }
    // All sidecar reads (preload aggregates, the found-ids check) are done, so trim/compact the result
    rowData.finalize?.();
  });
}
