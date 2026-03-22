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
import { loadBatchLoader } from "./loadBatchLoader";
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
  return em.getBatchLoader(populateOperation, batchKey, async (populates) => {
    async function populateLayer(layerMeta: EntityMetadata | undefined, layerNode: HintNode<Entity>): Promise<void> {
      // Skip join-based preloading if nothing in this layer needs loading. If any entity in the list
      // needs loading, just load everything
      const { preloader } = getEmInternalApi(em);
      // We may not have a layerMeta if we're going through non-field properties
      if (preloader && layerMeta) {
        const preloadThisLayer = Object.entries(layerNode.hints).some(([key, hint]) => {
          for (const entity of hint.entities) {
            if ((entity as any)[key]?.isLoaded === false && !(entity as any)[key]?.isPreloaded) return true;
          }
          return false;
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
          // This happens to let through non-relation hints like 'name' on user, which wasn't intentional,
          // but currently doesn't blow up (somehow), and is depended on by internal tests.
          if (!relation || typeof relation.load !== "function") {
            // We don't want to throw on poly hints, because they're not actually loaded on the entity
            if (isPolyHint(key)) continue;
            throw new Error(`Invalid load hint '${key}' on ${entity}`);
          }

          // If we're populating a hasReactiveField, don't bother loading it
          // if it's already been calculated (i.e. we have no reason to believe its value
          // is stale, so we should avoid pulling all of its data into memory).
          //
          // (Note that we can't do this same optimization for ReactiveReferenceImpl, because
          // as a FK, it will always need at least some `.load()` to fetch its entity from the database.
          // So we go ahead and call `.load()`, assuming it will just load its cached value, but it
          // will also check internally if it's marked for recalc, and load its load hint if necessary.
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
              batchPromises.add(oneToManyBatchLoader(em, relation).load(entity.idTagged!));
              relationsToPreload.push(relation);
              continue;
            } else if (field.kind === "m2m" && !field.derived) {
              batchPromises.add(manyToManyBatchLoader(em, relation).load(`${relation.columnName}=${entity.id}`));
              relationsToPreload.push(relation);
              continue;
            } else if (field.kind === "o2o") {
              batchPromises.add(oneToOneBatchLoader(em, relation).load(entity.idTagged!));
              relationsToPreload.push(relation);
              continue;
            } else if (field.kind === "m2o" && !field.derived) {
              const taggedId = relation.idTaggedMaybe;
              if (taggedId) {
                batchPromises.add(loadBatchLoader(em, field.otherMetadata()).load({ taggedId, hint: undefined }));
                relationsToPreload.push(relation);
                continue;
              }
            }
          }
          fallbackPromises.push(relation.load(opts) as Promise<any>);
        }
      }

      if (batchPromises.size > 0 || fallbackPromises.length > 0) {
        await Promise.all([...batchPromises, ...fallbackPromises]);
      }
      for (const relation of relationsToPreload) {
        relation.preload();
      }

      // 2nd breadth-width pass to do nested load hints, this will fan out at the sibling level.
      // i.e. populateLayer(...reviews...) & populateLayer(...comments...)
      let nestedLoadPromises: (Promise<void> | undefined)[] | undefined;
      for (const [key, tree] of Object.entries(layerNode.hints)) {
        if (Object.keys(tree.hints).length === 0) continue;

        // Get the children we found, i.e. [a1, a2, a3] -> all of their books
        const childrenByParent = new Map<Entity, Entity[]>();
        for (const entity of tree.entities) {
          const relation = getRelationFromMaybePolyKey(entity, key);
          childrenByParent.set(entity, relation ? toArray(getEvenDeleted(relation)) : []);
        }
        if (childrenByParent.size === 0) continue;

        // Rewrite our node.entities to be the next layer of children, i.e. children will be all books, for all of
        // `[a1, a2, a3]`, but only the books of `a2` need to recurse into `book: reviews` and only the books of
        // `a3` need to recurse into `book: comments`, so swap `node.entities` (which is currently authors)
        // with the books. This is what prevents our dataloader-merged TreeHint from over-fetching and loading
        // the superset load hint for all entities.
        function rewrite(node: HintNode<Entity>) {
          const next = new Set<Entity>();
          for (const entity of node.entities) {
            const children = childrenByParent.get(entity);
            if (children) for (const child of children) next.add(child);
          }
          node.entities = next;
          Object.values(node.hints).forEach((node) => rewrite(node));
        }

        rewrite(tree);

        const nextMeta = (layerMeta?.allFields[key] as any)?.otherMetadata?.();
        (nestedLoadPromises ??= []).push(populateLayer(nextMeta, tree));
      }
      if (nestedLoadPromises) await Promise.all(nestedLoadPromises);
    }

    await populateLayer(meta, buildHintTree(populates));
  });
}

/** Probes `relation` to see if it's a m2o/o2m/m2m relation that supports `getWithDeleted`, otherwise calls `get`. */
function getEvenDeleted(relation: any): any {
  return "getWithDeleted" in relation ? relation.getWithDeleted : relation.get;
}
