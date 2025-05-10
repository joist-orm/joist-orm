import DataLoader from "dataloader";
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

export function populateDataLoader(
  em: EntityManager,
  meta: EntityMetadata,
  hint: LoadHint<any>,
  mode: "preload" | "intermixed",
  opts: { forceReload?: boolean } = {},
): DataLoader<{ entity: Entity; hint: LoadHint<any> }, any> {
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
  return em.getLoader(
    "populate",
    batchKey,
    async (populates) => {
      async function populateLayer(layerMeta: EntityMetadata | undefined, layerNode: HintNode<Entity>): Promise<any[]> {
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
              const rows = await em.driver.executeFind(em, query, {});
              const entitiesById = indexBy(entities, (e) => keyToNumber(meta, e.id));
              const entitiesInOrder = rows.map((row) => entitiesById.get(row["id"]));
              hydrator(rows, entitiesInOrder);
            }
          }
        }

        // One breadth-width pass (only 1 level deep, our 2nd pass recurses) to ensure each relation is loaded
        const loadPromises = Object.entries(layerNode.hints).flatMap(([key, tree]) => {
          return [...tree.entities].map((entity) => {
            const relation = getRelationFromMaybePolyKey(entity, key);

            // This happens to let through non-relation hints like 'name' on user, which wasn't intentional,
            // but currently doesn't blow up (somehow), and is not depended on by internal tests.
            if (!relation || typeof relation.load !== "function") {
              // We don't want to throw on poly hints, because they're not actually loaded on the entity
              if (isPolyHint(key)) return;
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
            if (relation instanceof ReactiveFieldImpl && relation.isSet) return;
            if (relation.isLoaded && !opts.forceReload) return undefined;
            // Avoid creating a promise for preloaded relations
            if (relation.isPreloaded) {
              relation.preload();
              return undefined;
            }
            return relation.load(opts) as Promise<any>;
          });
        });

        // 2nd breadth-width pass to do nested load hints, this will fan out at the sibling level.
        // i.e. populateLayer(...reviews...) & populateLayer(...comments...)
        return Promise.all(loadPromises).then(() => {
          // Each of these keys will be fanning out to a new entity, like book -> reviews or book -> comments
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
          return Promise.all(nestedLoadPromises);
        });
      }

      return populateLayer(meta, buildHintTree(populates)).then(() => populates);
    },
    // We always disable caching, because during a UoW, having called `populate(author, nestedHint1)`
    // once doesn't mean that, on the 2nd call to `populate(author, nestedHint1)`, we can completely
    // skip it b/c author's relations may have been changed/mutated to different not-yet-loaded
    // entities.
    //
    // Even though having `{ cache: false }` looks weird here, i.e. why use dataloader at all?, it
    // still helps us fan-in resolvers callers that are happening ~simultaneously into the same
    // effort.
    { cache: false },
  );
}

/** Probes `relation` to see if it's a m2o/o2m/m2m relation that supports `getWithDeleted`, otherwise calls `get`. */
function getEvenDeleted(relation: any): any {
  return "getWithDeleted" in relation ? relation.getWithDeleted : relation.get;
}
