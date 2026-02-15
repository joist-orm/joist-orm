import { Entity } from "../Entity";
import { EntityMetadata } from "../EntityMetadata";
import { HintNode, buildHintTree } from "../HintTree";
import {
  AliasAssigner,
  EntityManager,
  ParsedFindQuery,
  addTablePerClassJoinsAndClassTag,
  getEmInternalApi,
  indexBy,
  keyToNumber,
  kqDot,
} from "../index";
import { LoadHint } from "../loadHints";
import { getRelationFromMaybePolyKey, isPolyHint } from "../reactiveHints";
import { ReactiveFieldImpl } from "../relations/ReactiveField";
import { toArray } from "../utils";
import { BatchLoader } from "./BatchLoader";
import { manyToManyBatchLoader } from "./manyToManyBatchLoader";
import { oneToManyBatchLoader } from "./oneToManyBatchLoader";
import { oneToOneBatchLoader } from "./oneToOneBatchLoader";

export const populateOperation = "populate";

export function populateBatchLoader(
  em: EntityManager,
  meta: EntityMetadata,
  hint: LoadHint<any>,
  mode: "preload" | "intermixed",
  opts: { forceReload?: boolean } = {},
): BatchLoader<{ entity: Entity; hint: LoadHint<any> }> {
  // For batching populates, we want different levels of course-ness:
  // - preloading populates that are only SQL should be batched together as much as possible, but
  // - intermixed populates (some with custom relations) should be batched as separately as possible
  //   (while still batching identical populates together) to reduce the chance of promise deadlocks.
  //
  // I.e. if we know this is a sql-only hint, we can batch all loads for a given entity
  // together do leverage join-based preloading.
  //
  // However, intermixed batches can be prone to promise deadlocking (one relation .load getting
  // stuck in a batch that is asking for its own dependencies to load), so if this is an intermixed
  // hint, then use a batch key that includes the hint itself, which will make it unlikely
  // for non-sql relations to deadlock on each other/themselves.
  const batchKey =
    mode === "preload"
      ? `${meta.tagName}:${opts.forceReload}`
      : `${meta.tagName}:${JSON.stringify(hint)}:${opts.forceReload}`;
  return em.getBatchLoader(
    populateOperation,
    batchKey,
    async (populates) => {
      async function populateLayer(layerMeta: EntityMetadata | undefined, layerNode: HintNode<Entity>): Promise<void> {
        // Skip join-based preloading if nothing in this layer needs loading. If any entity in the list
        // needs loading, just load everything
        const { preloader } = getEmInternalApi(em);
        // We may not have a layerMeta if we're going through non-field properties
        if (preloader && layerMeta) {
          const preloadThisLayer = Object.entries(layerNode.hints).some(([key, hint]) => {
            return [...hint.entities].some(
              (entity: any) => !!entity[key] && !entity[key].isLoaded && !entity[key].isPreloaded,
            );
          });
          if (preloadThisLayer) {
            // Do an up-front SQL call of `select id, ...preloads... from table`,
            const assigner = new AliasAssigner();
            const meta = layerMeta;
            const alias = assigner.getAlias(meta.tableName);
            const entities = [...layerNode.entities].filter((e) => !e.isNewEntity);
            const ids = entities.map((e) => keyToNumber(meta, e.id));
            // Create a ParsedFindQuery for `addPreloading` to inject joins into
            const query: ParsedFindQuery = {
              // We already have the entities loaded, so can do just `SELECT a.id` + the preload columns
              selects: [kqDot(alias, "id")],
              tables: [{ alias, join: "primary", table: meta.tableName }],
              condition: {
                kind: "exp",
                op: "and",
                conditions: [
                  { kind: "column", alias, column: "id", dbType: meta.idDbType, cond: { kind: "in", value: ids } },
                ],
              },
              orderBys: [],
            };
            // If we're selecting from small_publishers, join in our base class in case
            // the preloader wants to join on a column like `publishers.group_id`
            addTablePerClassJoinsAndClassTag(query, meta, alias, false);
            const hydrator = preloader.addPreloading(meta, layerNode, query);
            if (hydrator) {
              const rows = await em["executeFind"](meta, populateOperation, query, {});
              const entitiesById = indexBy(entities, (e) => keyToNumber(meta, e.id));
              const entitiesInOrder = rows.map((row) => entitiesById.get(row["id"]));
              hydrator(rows, entitiesInOrder);
            }
          }
        }

        // First pass: batch SQL relations directly, fall back to relation.load() for non-SQL
        const batchPromises = new Set<Promise<void>>();
        const relationsToPreload: { preload(): void }[] = [];
        const fallbackPromises: (Promise<any> | undefined)[] = [];

        for (const [key, tree] of Object.entries(layerNode.hints)) {
          const field = layerMeta?.allFields[key];
          for (const entity of tree.entities) {
            const relation = getRelationFromMaybePolyKey(entity, key);

            if (!relation || typeof relation.load !== "function") {
              if (isPolyHint(key)) continue;
              throw new Error(`Invalid load hint '${key}' on ${entity}`);
            }

            if (relation instanceof ReactiveFieldImpl && relation.isSet) continue;
            if (relation.isLoaded && !opts.forceReload) continue;
            if (relation.isPreloaded) {
              relation.preload();
              continue;
            }

            // For non-derived SQL relations on existing entities, use batch loaders directly
            // (1 shared promise per batch instead of per-entity async overhead).
            // Skip new entities (no id) and derived relations (reactive m2m/m2o have extra logic in load).
            if (!entity.isNewEntity && field) {
              if (field.kind === "o2m") {
                batchPromises.add(oneToManyBatchLoader(em, relation as any).load(entity.idTagged!));
                relationsToPreload.push(relation);
                continue;
              } else if (field.kind === "m2m" && !field.derived) {
                const col = relation as any;
                batchPromises.add(manyToManyBatchLoader(em, col).load(`${col.columnName}=${entity.id}`));
                relationsToPreload.push(relation);
                continue;
              } else if (field.kind === "o2o") {
                batchPromises.add(oneToOneBatchLoader(em, relation as any).load(entity.idTagged!));
                relationsToPreload.push(relation);
                continue;
              }
              // For m2o, fall through to relation.load() which uses em.load() internally
              // and batches better since em.load() shares the loadBatchLoader with other callers.
            }
            fallbackPromises.push(relation.load(opts) as Promise<any>);
          }
        }

        await Promise.all([...batchPromises, ...fallbackPromises]);
        for (const relation of relationsToPreload) {
          relation.preload();
        }

        // 2nd breadth-width pass to do nested load hints, this will fan out at the sibling level.
        // i.e. populateLayer(...reviews...) & populateLayer(...comments...)
        const nestedLoadPromises = Object.entries(layerNode.hints).map(([key, tree]) => {
          if (Object.keys(tree.hints).length === 0) return;

          // Get the children we found, i.e. [a1, a2, a3] -> all of their books
          const childrenByParent = new Map(
            [...tree.entities].map((entity) => {
              const relation = getRelationFromMaybePolyKey(entity, key);
              return [entity, relation ? toArray(getEvenDeleted(relation)) : []];
            }),
          );
          if (childrenByParent.size === 0) return;

          // Rewrite our node.entities to be the next layer of children, i.e. children will be all books, for all of
          // `[a1, a2, a3]`, but only the books of `a2` need to recurse into `book: reviews` and only the books of
          // `a3` need to recurse into `book: comments`, so swap `node.entities` (which is currently authors)
          // with the books. This is what prevents our dataloader-merged TreeHint from over-fetching and loading
          // the superset load hint for all entities.
          function rewrite(node: HintNode<Entity>) {
            node.entities = new Set(
              Array.from(node.entities).flatMap((entity) => childrenByParent.get(entity) ?? []),
            );
            Object.values(node.hints).forEach((node) => rewrite(node));
          }

          rewrite(tree);

          const nextMeta = (layerMeta?.allFields[key] as any)?.otherMetadata?.();
          return populateLayer(nextMeta, tree);
        });
        await Promise.all(nestedLoadPromises);
      }

      await populateLayer(meta, buildHintTree(populates));
    },
  );
}

/** Probes `relation` to see if it's a m2o/o2m/m2m relation that supports `getWithDeleted`, otherwise calls `get`. */
function getEvenDeleted(relation: any): any {
  return "getWithDeleted" in relation ? relation.getWithDeleted : relation.get;
}
