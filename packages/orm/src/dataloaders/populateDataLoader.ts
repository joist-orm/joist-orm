import DataLoader from "dataloader";
import { Entity } from "../Entity";
import { EntityMetadata } from "../EntityMetadata";
import { HintNode, buildHintTree } from "../HintTree";
import { EntityManager, getEmInternalApi, getProperties } from "../index";
import { canPreload, preloadJoins } from "../joinPreloading";
import { LoadHint, NestedLoadHint } from "../loadHints";
import { deepNormalizeHint, normalizeHint } from "../normalizeHints";
import { PersistedAsyncPropertyImpl } from "../relations/hasPersistedAsyncProperty";
import { toArray } from "../utils";

/** Partitions a hint into SQL-able and non-SQL-able hints. */
export function partitionHint(
  meta: EntityMetadata<any> | undefined,
  hint: LoadHint<any>,
): [NestedLoadHint<any> | undefined, NestedLoadHint<any> | undefined] {
  let sql: NestedLoadHint<any> | undefined = undefined;
  let non: NestedLoadHint<any> | undefined = undefined;
  for (const [key, subHint] of Object.entries(normalizeHint(hint))) {
    const field = meta?.allFields[key];
    if (field && canPreload(meta, field)) {
      const [_sql, _non] = partitionHint(field.otherMetadata(), subHint);
      deepMerge(((sql ??= {})[key] ??= {}), _sql ?? {});
      if (_non) deepMerge(((non ??= {})[key] ??= {}), _non);
    } else {
      // If this isn't a raw SQL relation, but it exposes a load-hint, inline that into our SQL.
      // This will get the non-SQL relation's underlying SQL data preloaded.
      const p = meta && getProperties(meta)[key];
      if (p && p.loadHint) {
        const [_sql, _non] = partitionHint(meta, p.loadHint);
        if (_sql) deepMerge((sql ??= {}), _sql);
        if (_non) deepMerge((non ??= {}), _non);
      }
      deepMerge(((non ??= {})[key] ??= {}), deepNormalizeHint(subHint));
    }
  }
  return [sql, non];
}

function deepMerge<T extends object>(a: T, b: T): void {
  for (const [key, value] of Object.entries(b)) {
    deepMerge(((a as any)[key] ??= {}), value);
  }
}

export function populateDataLoader(
  em: EntityManager,
  meta: EntityMetadata<any>,
  hint: LoadHint<any>,
  mode: "sqlOnly" | "intermixed",
  opts: { forceReload?: boolean } = {},
): DataLoader<{ entity: Entity; hint: LoadHint<any> }, any> {
  // If we know this is a sql-only hint, we can batch all loads for a given entity
  // together do leverage join-based preloading.
  //
  // However, intermixed batches can be prone to promise deadlocking (one relation .load getting
  // stuck in a batch that is asking for its own dependencies to load), so if this is an intermixed
  // hint, then use a batch key that includes the hint itself, which will make it unlikely
  // for non-sql relations to deadlock on each other/themselves.
  const batchKey =
    mode === "sqlOnly"
      ? `${meta.tagName}:${opts.forceReload}`
      : `${meta.tagName}:${JSON.stringify(hint)}:${opts.forceReload}`;
  return em.getLoader(
    "populate",
    batchKey,
    async (populates) => {
      async function populateLayer(
        layerMeta: EntityMetadata<any> | undefined,
        layerNode: HintNode<Entity>,
      ): Promise<any[]> {
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
            if (
              relation instanceof PersistedAsyncPropertyImpl &&
              relation.isSet &&
              !getEmInternalApi(em).rm.isMaybePendingRecalc(entity, key)
            )
              return;
            if (relation.isLoaded && !opts.forceReload) return undefined;
            // Avoid creating a promise
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
