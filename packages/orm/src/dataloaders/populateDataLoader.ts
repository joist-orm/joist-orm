import DataLoader from "dataloader";
import { Entity } from "../Entity";
import { EntityMetadata, getMetadata } from "../EntityMetadata";
import { HintNode, buildHintTree } from "../HintTree";
import { EntityManager, getConstructorFromTaggedId } from "../index";
import { preloadJoins } from "../joinPreloading";
import { LoadHint } from "../loadHints";
import { PersistedAsyncPropertyImpl } from "../relations/hasPersistedAsyncProperty";
import { toArray } from "../utils";

export function populateDataLoader(
  em: EntityManager,
  batchKey: string,
  opts: { forceReload?: boolean } = {},
): DataLoader<{ entity: Entity; hint: LoadHint<any> }, any> {
  return em.getLoader(
    "populate",
    batchKey,
    async (populates) => {
      console.log("POPULATING", populates);

      async function populateLayer(
        layerMeta: EntityMetadata<any> | undefined,
        layerNode: HintNode<Entity>,
      ): Promise<any[]> {
        console.log("POPULATING LAYER", layerMeta?.tagName, layerNode);
        // Skip join-based preloading if nothing in this layer needs loading. If any entity in the list
        // needs loading, just load everything
        const anyInThisLayerNeedsLoaded = Object.entries(layerNode.subHints).some(([key, hint]) => {
          return [...hint.entities].some(
            (entity: any) => !!entity[key] && !entity[key].isLoaded && !entity[key].isPreloaded,
          );
        });
        // We may not have a layerMeta if we're going through non-field properties
        if (anyInThisLayerNeedsLoaded && layerMeta) {
          await preloadJoins(em, layerMeta, layerNode, "populate");
        }

        // One breadth-width pass (only 1 level deep, our 2nd pass recurses) to ensure each relation is loaded
        const loadPromises = Object.entries(layerNode.subHints).flatMap(([key, tree]) => {
          return [...tree.entities].map((entity) => {
            const relation = (entity as any)[key];
            if (!relation || typeof relation.load !== "function") {
              throw new Error(`Invalid load hint '${key}' on ${entity}`);
            }
            // If we're populating a hasPersistedAsyncProperty, don't bother loading it
            // if it's already been calculated (i.e. we have no reason to believe its value
            // is stale, so we should avoid pulling all of its data into memory).
            //
            // But if it's _not_ previously set, i.e. b/c the entity itself is a new entity,
            // then go ahead and call `.load()` so that the downstream reactive calc can
            // call `.get` to evaluate its derived value.
            if (relation instanceof PersistedAsyncPropertyImpl && relation.isSet) return;
            if (relation.isLoaded && !opts.forceReload) return undefined;
            // Avoid promise deadlocks
            // if (relation.isLoadInProgress) return undefined;
            // return relation.load(opts) as Promise<any>;
            console.log("LOADING", relation);
            return relation.load(opts).then(() => {
              console.log("...done", relation);
            });
          });
        });

        // 2nd breadth-width pass to do nested load hints, this will fan out at the sibling level.
        // i.e. populateLayer(...reviews...) & populateLayer(...comments...)
        return Promise.all(loadPromises).then(() => {
          // Each of these keys will be fanning out to a new entity, like book -> reviews or book -> comments
          const nestedLoadPromises = Object.entries(layerNode.subHints).map(([key, tree]) => {
            if (Object.keys(tree.subHints).length === 0) return;

            // Get the children we found, i.e. [a1, a2, a3] -> all of their books
            const childrenByParent = new Map(
              [...tree.entities].map((entity) => [entity, toArray(getEvenDeleted((entity as any)[key]))]),
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
              Object.values(node.subHints).forEach((node) => rewrite(node));
            }

            rewrite(tree);

            const nextMeta = (layerMeta?.allFields[key] as any)?.otherMetadata?.();
            return populateLayer(nextMeta, tree);
          });
          return Promise.all(nestedLoadPromises);
        });
      }

      const rootMeta = getMetadata(getConstructorFromTaggedId(batchKey));
      await populateLayer(rootMeta, buildHintTree(populates));
      // After the nested hints are done, echo back the original now-loaded list
      return populates.map(() => 0 as any);
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
