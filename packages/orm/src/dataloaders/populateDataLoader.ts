import DataLoader from "dataloader";
import { Entity } from "../Entity";
import {
  EntityMetadata,
  Field,
  ManyToManyField,
  ManyToOneField,
  OneToManyField,
  OneToOneField,
} from "../EntityMetadata";
import { HintNode, buildHintTree } from "../HintTree";
import {
  EntityManager,
  ManyToManyCollection,
  ManyToOneReferenceImpl,
  OneToManyCollection,
  getEmInternalApi,
  getProperties,
} from "../index";
import { LoadHint } from "../loadHints";
import { toArray } from "../utils";
import { loadBatchFn } from "./loadDataLoader";
import { manyToManyBatchFn } from "./manyToManyDataLoader";
import { oneToManyBatchFn } from "./oneToManyDataLoader";

// Really the only goal is to reduce promise creation.
// Instead of doing `relation.load` -> 1 promise per relation instance,
// We really want `load(relations)` -> 1 promise per relation identity.
// Ideally grouped by entity so we can preload
//
// We should strive to complete a request with as few event loops ticks as
// possible. Chunkier ticks, to reduce the overhead per tick.
//
// In GraphQL ideally we do a populate as high as possible, and the rest of
// the leaf behavior is synchronous accesses.

export function populateDataLoader(
  em: EntityManager,
  meta: EntityMetadata,
  hint: LoadHint<any>,
  mode: "preload" | "intermixed",
  opts: { forceReload?: boolean } = {},
): DataLoader<{ entity: Entity; hint: LoadHint<any> }, any> {
  // Ideally this calls directly into o2mLoads(entities, field), no more dataloader-ing,
  // we are the dataloader.
  //
  // How to handle hasReactiveReferences? Can we statically know their load hint? I guess so.

  const batchKey = `${meta.tagName}:${opts.forceReload}`;
  return em.getLoader(
    "populate",
    batchKey,
    async (populates) => {
      // We fundamentally need to load a layer at a time.
      // Maybe each layer has dirty fields in it. That's fine, maybe we load them...
      // ...we could skip preloading AsyncReferences that we know are dirty, and instead
      // first load their full hint, calc it, and then load the rest of the hint that
      // drills through the AsyncReference.

      async function populateLayer(layerMeta: EntityMetadata | undefined, layerNode: HintNode<Entity>): Promise<any[]> {
        // Partition the hint into fundamental vs. derived relations
        const [sql, non] = partitionHint(layerMeta, layerNode);

        // ^ will have all the available nested SQL hints, which is good for preloading (if enabled).
        // However, `non` isn't guaranteed to have all of its data loaded in a single SQL, due to either:
        // - No preloading enabled/available, or
        // - Hitting a derived relation, which needs to invoke JS filtering before further loading
        //
        // And we can't continue to the next layer until `non`s data is fully loaded.

        // Fundamental relations are loaded via SQL, i.e. `author.books` or `author.publisher`.
        // Derived relations will be like `author.reviews` which is a `hasManyThrough`. We need
        // to load `author.reviews` to continue loading further down its tree.
        //
        // What if we see `{ author: { reviews: comments, publisher: comments } }` we could
        // - load publisher with SQL call
        // - rewrite `reviews` -> `books: reviews`
        // - load `books` with SQL call
        // - Should we go ahead and load `publisher` comments, or wait for the books call to return,
        //   and then do the 3rd level all at once?

        // The SQL ones we can just load, put in the preload cache, and keep going.
        // The NON once we need to convert to SQL, recursively, and then keep going.
        // This feels like a `todo` queue.

        // We can handle `hasManyThrough` different from `hasManyDerived`. The former does no
        // filter, so we could preload through it, but `hasManyDerived` we need to stop and let
        // JS code eval what subset of entities we need to keep going. For the preloader to know
        // this, we need our `layerNode` hint to get the NON load hints merged in to it.

        const allEntities = [...layerNode.entities];
        const nonNewEntities = allEntities.filter((e) => !e.isNewEntity);

        // Make 1 promise per SQL call at this layer
        await Promise.all(
          Object.keys(sql.subHints).map(async (fieldName) => {
            const field = getProperties(layerMeta!)[fieldName];
            // These instanceofs match the isSqlField check
            if (field instanceof OneToManyCollection) {
              const loadIds: string[] = [];
              for (const entity of nonNewEntities) {
                if (!(entity as any)[fieldName].isLoaded) {
                  loadIds.push(entity.idTagged);
                }
              }
              if (loadIds.length > 0) {
                const children = await oneToManyBatchFn(em, field, loadIds);
                for (let i = 0; i < children.length; i++) {
                  getEmInternalApi(em).setPreloadedRelation(loadIds[i], fieldName, children[i]);
                }
              }
            } else if (field instanceof ManyToOneReferenceImpl) {
              const loads: any[] = [];
              for (const entity of nonNewEntities) {
                const otherId = (entity as any)[fieldName].idTaggedMaybe;
                if (otherId && !em.getEntity(otherId)) {
                  loads.push({ entity: otherId, hint: undefined });
                }
              }
              if (loads.length > 0) {
                await loadBatchFn(em, field.otherMeta, loads);
              }
            } else if (field instanceof ManyToManyCollection) {
              const entityIds: string[] = [];
              const m2mIds: string[] = [];
              for (const entity of nonNewEntities) {
                if (!(entity as any)[fieldName].isLoaded) {
                  entityIds.push(entity.idTagged);
                  m2mIds.push(`${field.columnName}=${entity.idTagged}`);
                }
              }
              if (m2mIds.length > 0) {
                const children = await manyToManyBatchFn(em, field, m2mIds);
                for (let i = 0; i < children.length; i++) {
                  getEmInternalApi(em).setPreloadedRelation(entityIds[i], fieldName, children[i]);
                }
              }
            } else {
              throw new Error(`Not implemented yet ${field}`);
            }
            // This marks all the relations as loaded, without needing the `.load()` promise/DL overhead
            for (const entity of allEntities) {
              (entity as any)[fieldName].preload();
            }
          }),
        );

        // Each of these keys will be fanning out to a new entity, like book -> reviews or book -> comments
        const nestedLoadPromises = Object.entries(layerNode.subHints).map(([key, tree]) => {
          if (Object.keys(tree.subHints).length === 0) return;

          // Get the children we found, i.e. [a1, a2, a3] -> all of their books
          const childrenByParent = new Map<Entity, Entity[]>();
          for (const entity of tree.entities) {
            childrenByParent.set(entity, toArray(getEvenDeleted((entity as any)[key])));
          }
          if (childrenByParent.size === 0) return;

          rewrite(childrenByParent, tree);
          const nextMeta = (layerMeta?.allFields[key] as any)?.otherMetadata?.();
          return populateLayer(nextMeta, tree);
        });
        return Promise.all(nestedLoadPromises);
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

// Rewrite our node.entities to be the next layer of children, i.e. children will be all books, for all of
// `[a1, a2, a3]`, but only the books of `a2` need to recurse into `book: reviews` and only the books of
// `a3` need to recurse into `book: comments`, so swap `node.entities` (which is currently authors)
// with the books. This is what prevents our dataloader-merged TreeHint from over-fetching and loading
// the superset load hint for all entities.
function rewrite(childrenByParent: Map<Entity, Entity[]>, node: HintNode<Entity>) {
  node.entities = new Set(Array.from(node.entities).flatMap((entity) => childrenByParent.get(entity) ?? []));
  Object.values(node.subHints).forEach((node) => rewrite(childrenByParent, node));
}

/** Probes `relation` to see if it's a m2o/o2m/m2m relation that supports `getWithDeleted`, otherwise calls `get`. */
function getEvenDeleted(relation: any): any {
  return "getWithDeleted" in relation ? relation.getWithDeleted : relation.get;
}

export function isSqlField(
  field: Field | undefined,
): field is OneToManyField | ManyToOneField | ManyToManyField | OneToOneField {
  return (
    !!field &&
    (field.kind === "o2m" || field.kind === "o2o" || field.kind === "m2o" || field.kind === "m2m") &&
    // If `otherField` is missing, this could be a large collection which can't be loaded...
    !!field.otherMetadata().allFields[field.otherFieldName]
  );
}

// Skip join-based preloading if nothing in this layer needs loading. If any entity in the list
// needs loading, just load everything
// const { preloader } = getEmInternalApi(em);
// // We may not have a layerMeta if we're going through non-field properties like custom fields
// if (preloader && layerMeta) {
//   const preloadThisLayer = Object.entries(layerNode.subHints).some(([key, hint]) => {
//     return [...hint.entities].some(
//         (entity: any) => !!entity[key] && !entity[key].isLoaded && !entity[key].isPreloaded,
//     );
//   });
//   if (preloadThisLayer) {
//     // Do an up-front SQL call of `select id, ...preloads... from table`,
//     const assigner = new AliasAssigner();
//     const meta = layerMeta;
//     const alias = assigner.getAlias(meta.tableName);
//     const entities = [...layerNode.entities].filter((e) => !e.isNewEntity);
//     const ids = entities.map((e) => keyToNumber(meta, e.id));
//     // Create a ParsedFindQuery for `addPreloading` to inject joins into
//     const query: ParsedFindQuery = {
//       // We already have the entities loaded, so can do just `SELECT a.id` + the preload columns
//       selects: [kqDot(alias, "id")],
//       tables: [{ alias, join: "primary", table: meta.tableName }],
//       condition: {
//         op: "and",
//         conditions: [{ alias, column: "id", dbType: meta.idDbType, cond: { kind: "in", value: ids } }],
//       },
//       orderBys: [],
//     };
//     const hydrator = preloader.addPreloading(em, meta, layerNode, query);
//     if (hydrator) {
//       const rows = await em.driver.executeFind(em, query, {});
//       const entitiesById = indexBy(entities, (e) => keyToNumber(meta, e.id));
//       const entitiesInOrder = rows.map((row) => entitiesById.get(row["id"]));
//       hydrator(rows, entitiesInOrder);
//     }
//   }
// }

/** Partitions a hint into SQL-able and non-SQL-able hints. */
function partitionHint(meta: EntityMetadata | undefined, hint: HintNode<any>): [HintNode<any>, HintNode<any>] {
  let sql: HintNode<any> = { entities: new Set(), entitiesKind: "instances", subHints: {} };
  let non: HintNode<any> = { entities: new Set(), entitiesKind: "instances", subHints: {} };
  for (const [key, subHint] of Object.entries(hint.subHints)) {
    const field = meta?.allFields[key];
    if (field && isSqlField(field)) {
      const [_sql, _non] = partitionHint(field.otherMetadata(), subHint);
      deepMerge(sql, key, _sql);
      deepMerge(non, key, _non);
    } else {
      // If this isn't a raw SQL relation, but it exposes a load-hint, inline that into our SQL.
      // This will get the non-SQL relation's underlying SQL data preloaded.
      const p = meta && getProperties(meta)[key];
      const loadHint = p?.loadHint;
      if (loadHint) {
        // This is something like `hasManyThrough`, so the load hint will be rooted
        // at our meta, so let it resolve...
        const h2 = buildHintTree([...subHint.entities].map((entity) => ({ entity, hint: loadHint })));
        const [_sql, _non] = partitionHint(meta, h2);
        deepMerge2(sql, _sql);
        // ...what if this loadHint has nons that themselves could be rewritten
        // into this pass's SQL loads? Like `Author.foo` relies on `Author.bar` relies on `Author.books`.
      } else {
        throw new Error(`Invalid load hint '${key}' on ${meta?.cstr.name}`);
      }
      deepMerge(non, key, subHint);
    }
  }
  return [sql, non];
}

function deepMerge(node: HintNode<any>, key: string, other: HintNode<any>): void {
  if (!node.subHints[key]) {
    node.subHints[key] = { entitiesKind: node.entitiesKind, entities: new Set(), subHints: {} };
  }
  const sub = node.subHints[key];
  for (const entity of other.entities) {
    sub.entities.add(entity);
  }
  for (const key in other.subHints) {
    deepMerge(sub, key, other.subHints[key]);
  }
}

function deepMerge2(node: HintNode<any>, other: HintNode<any>): void {
  for (const entity of other.entities) {
    node.entities.add(entity);
  }
  for (const key in other.subHints) {
    node.subHints[key] ??= { entitiesKind: node.entitiesKind, entities: new Set(), subHints: {} };
    deepMerge2(node.subHints[key], other.subHints[key]);
  }
}
