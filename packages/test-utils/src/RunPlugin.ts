import {
  assertNever,
  Column,
  createRowFromEntityData,
  Entity,
  getInstanceData,
  getMetadata,
  getRelations,
  isEntity,
  JoinRow,
  JoinRowTodo,
  ManyToManyCollection,
  ManyToOneReferenceImpl,
  MaybeAbstractEntityConstructor,
  OneToManyCollection,
  OneToOneReferenceImpl,
  Plugin,
  PolymorphicKeySerde,
  PolymorphicReferenceImpl,
  ReactiveReferenceImpl,
  Todo,
} from "joist-orm";
import { EntityManager, getEmInternalApi } from "joist-orm/build/EntityManager";

/*
 * `run...` helpers use this plugin to mirror any changes made to their isolated entity manager inside to the original
 * entity manager they were passed.  This allows changes to be synchronously reflected between the two entity managers
 * without needing to query the database.
 */
export class RunPlugin extends Plugin {
  // The em passed here is the target which we'll mirror changes to.  The plugin should not be added to it, but rather
  // to the new em `run..` helpers create or by downstream ems created by implementation code
  constructor(public readonly em: EntityManager) {
    super();
  }

  maybeCloneForNewEm() {
    return this;
  }

  afterWrite(entityTodos: Record<string, Todo>, joinRowTodos: Record<string, JoinRowTodo>) {
    const api = getEmInternalApi(this.em);
    // We don't want any old preloaded data leaking into our changes, so we clear it out before we start as a precaution
    api.clearPreloadedRelations();
    // Likewise, any data loaders in memory will have stale data, so we clear them out as well
    api.clearDataloaders();
    this.#syncEntityData(entityTodos);
    this.#syncReferences(entityTodos);
    this.#syncManyToManys(joinRowTodos);
    this.#preloadUnloadedRelations(entityTodos);
  }

  #syncEntityData(entityTodos: Record<string, Todo>) {
    const { em } = this;
    Object.values(entityTodos).forEach((todo) => {
      todo.inserts.forEach((newEntity) => {
        const row = createRowFromEntityData(newEntity, { preferOriginalData: false });
        em.hydrate(newEntity.constructor as MaybeAbstractEntityConstructor<any>, [row]);
      });
      todo.updates.forEach((newEntity) => {
        const oldEntity = em.findExistingInstance(newEntity.idTagged);
        // This fail shouldn't really be possible, since any entity should either have been created:
        // * via factory or em.create in the original em
        // * by the new em inside the `run` call, in which case it'd be an insert instead of an update
        // * by a previous afterWrite call, which would have already been an insert and added to the original em
        // * by a previous `run` call, which would have already been an insert as well
        if (!oldEntity) fail(`Expected to find existing entity for $ {e.idTagged}`);
        const { data: newData } = getInstanceData(newEntity);
        const { data: oldData } = getInstanceData(oldEntity);
        const meta = getMetadata(newEntity);
        (newEntity as any).changes.fields
          .values()
          .filter((fieldName: string) => fieldName in newData)
          .filter((fieldName: string) => !!meta.allFields[fieldName].serde)
          .forEach((fieldName: string) => {
            // We're imitating a round trip to the database here, so we use our field's serde to map the value back
            // and forth.
            const serde = meta.allFields[fieldName].serde!;
            let column: Column | undefined;
            let value: any;
            if (serde instanceof PolymorphicKeySerde) {
              [column, value] =
                serde.columns
                  .values()
                  .map((c) => [c, c.rowValue(newData)] as const)
                  .find(([, v]) => v !== undefined) ?? [];
            } else {
              [column] = serde.columns;
              // the 2nd and 3rd arguments are only used if the 4th argument is defined, so it's OK to pass undefined here
              value = column.rowValue(newData);
            }
            serde.setOnEntity(oldData, column ? { [column.columnName]: value } : {});
          });
      });
      todo.deletes.forEach((newEntity) => {
        const existing = em.findExistingInstance(newEntity.idTagged);
        // Again it shouldn't really be possible for a deletion to happen without the entity being present in the
        // original em, but just in case we'll skip if we don't find it
        if (!existing) fail(`Expected to find existing entity for $ {e.idTagged}`);
        getInstanceData(existing).markDeletedBecauseNotFound();
      });
    });
  }

  // Ensure m2o/rr/poly changes from the new em are reflected in the original em
  #syncReferences(entityTodos: Record<string, Todo>) {
    const { em } = this;
    Object.values(entityTodos).forEach((todo) => {
      todo.inserts.forEach((newEntity) => {
        const oldEntity = em.findExistingInstance(newEntity.idTagged)!;
        getReferences(newEntity).forEach((r) => {
          const other = r.isSet ? em.findExistingInstance(r.idTaggedMaybe) : undefined;
          preloadReference(em, r.fieldName, oldEntity, other);
          if (other) maybePreloadOtherSide(em, r.fieldName, oldEntity, other);
        });
      });
      todo.updates.forEach((newEntity) => {
        const oldEntity = em.findExistingInstance(newEntity.idTagged)!;
        getReferences(newEntity)
          .filter((r) => (newEntity as any).changes[r.fieldName].hasChanged)
          .forEach((r) => {
            const other = r.isSet ? em.findExistingInstance(r.idTaggedMaybe) : undefined;
            preloadReference(em, r.fieldName, oldEntity, other);
            if (other) maybePreloadOtherSide(em, r.fieldName, oldEntity, other);
            const originalId = (newEntity as any).changes[r.fieldName].originalValue;
            const originalOther = originalId ? em.findExistingInstance(originalId) : undefined;
            if (originalOther) maybePreloadOtherSide(em, r.fieldName, oldEntity, originalOther, true);
          });
        // If the entity was soft-deleted, then we need to clear out the caches for any o2m collections that contain it
        if ("deletedAt" in newEntity && (newEntity as any).changes.deletedAt.hasChanged) {
          getReferences(oldEntity).forEach((r) => {
            const other = r.isSet ? em.findExistingInstance(r.idTaggedMaybe) : undefined;
            if (other) {
              const otherSide = getOtherSide(r.fieldName, oldEntity, other);
              if (otherSide instanceof OneToManyCollection) otherSide.resetIsLoaded();
            }
          });
        }
      });
      todo.deletes.forEach((newEntity) => {
        const oldEntity = em.findExistingInstance(newEntity.idTagged)!;
        getReferences(newEntity).forEach((r) => {
          // Since both old and new entities are marked as deleted, we can't just go looking through their relations
          // for the other side's id since this will error.  Likewise, we only care about the collection that this
          // entity used to belong to in the old em so we can remove it.  So just grab the other id directly from the
          // old entity's data and then preload its other side relation.
          const entityOrId = getInstanceData(oldEntity).data[r.fieldName];
          const originalOther = entityOrId
            ? em.findExistingInstance(isEntity(entityOrId) ? entityOrId.idTagged : entityOrId)
            : undefined;
          if (originalOther) maybePreloadOtherSide(em, r.fieldName, oldEntity, originalOther, true);
        });
      });
    });
  }

  // Ensure m2m changes are propagated from the new em to the original em
  #syncManyToManys(joinRowTodos: Record<string, JoinRowTodo>) {
    const { em } = this;
    const api = getEmInternalApi(em);
    Object.entries(joinRowTodos).forEach(([joinTable, todo]) => {
      const preloads = new Set<ManyToManyCollection<Entity, Entity>>();
      processJoinRows(em, joinTable, todo.newRows, preloads, (oldEntity, entities) => entities.push(oldEntity));
      processJoinRows(em, joinTable, todo.deletedRows, preloads, (oldEntity, entities) =>
        entities.splice(entities.indexOf(oldEntity), 1),
      );
      // Since multiple join rows could reference the same m2m, our processJoinRows doesn't actually call preload() so
      // we need to do it now
      preloads.values().forEach((r) => {
        const id = r.entity.idTagged;
        const entities = api.getPreloadedRelation(id, r.fieldName) as Entity[];
        // unique our entities in case somehow an entity was inserted by multiple join rows
        api.setPreloadedRelation(id, r.fieldName, [...new Set(entities)]);
        r.preload();
      });
    });
  }

  // Make sure any unloaded relations on net new entities are marked as loaded.  We should have already preloaded all
  // concrete references in a previous step. So we just need to load collections (plus o2os) if they haven't already
  // been preloaded by another step. Since nothing else preloaded them, they must have no data so we can just set
  // them to an empty array.
  #preloadUnloadedRelations(entityTodos: Record<string, Todo>) {
    const { em } = this;
    Object.entries(entityTodos).forEach(([, todo]) => {
      todo.inserts.forEach((newEntity) => {
        const oldEntity = em.findExistingInstance(newEntity.idTagged)!;
        getCollections(oldEntity)
          .filter((r) => !r.isPreloaded)
          .forEach((r) => {
            getEmInternalApi(em).setPreloadedRelation(oldEntity.idTagged, r.fieldName, []);
            r.preload();
          });
      });
    });
  }
}

// References that represent one (or more) foreign keys directly on the entity
type ConcreteReference =
  | ManyToOneReferenceImpl<Entity, Entity, any>
  | ReactiveReferenceImpl<Entity, Entity, any, any>
  | PolymorphicReferenceImpl<Entity, Entity, any>;

function preloadReference(em: EntityManager, fieldName: string, entity: Entity, other: Entity | undefined) {
  // Preload for concrete references doesn't make us of the global preloaded cache.  It just looks at its owner's data
  // to get a key, then checks if that entity is already in the em and uses that if so.  So we just need to set the
  // owner's data to have the correct key then we can call preload since all entities should already be in the original
  // em
  const reference = (entity as any)[fieldName] as ConcreteReference;
  (reference as any).unload();
  const { data } = getInstanceData(entity);
  data[fieldName] = other?.idTagged;
  if (!entity.isDeletedEntity) reference.preload();
}

function getOtherSide(fieldName: string, entity: Entity, other: Entity) {
  const meta = getMetadata(entity);
  const metas = new Set([meta, ...meta.baseTypes]);
  return getRelations(other)
    .values()
    .filter((r) => r instanceof OneToOneReferenceImpl || r instanceof OneToManyCollection)
    .find((r) => metas.has(r.otherMeta) && r.otherFieldName === fieldName);
}

function maybePreloadOtherSide(
  em: EntityManager,
  fieldName: string,
  entity: Entity,
  other: Entity,
  remove: boolean = false,
): void {
  const meta = getMetadata(entity);
  const otherSide = getOtherSide(fieldName, entity, other);
  // If our other side is a large o2m then we can just ignore it, since it isn't loadable regardless
  if (!otherSide) return;
  // Since our preload scans the entire em, we only need to run it once per collection/o2o.  We clear out preloads
  // when we start the afterWrite, so if anything is preloaded we know we put it there.
  if (otherSide.isPreloaded) return;
  let otherEntities: Entity[];
  if (otherSide instanceof OneToOneReferenceImpl) {
    otherEntities = remove ? [] : [entity];
  } else if (otherSide instanceof OneToManyCollection) {
    // Scan the entire em for (non-deleted) entities of our type that reference the other side
    otherEntities = em
      .getEntities(meta.cstr)
      .values()
      .filter((e) => !e.isDeletedEntity)
      .filter((e) => ((e as any)[otherSide.otherFieldName] as ConcreteReference).idTaggedMaybe === other.idTagged)
      .toArray();
  } else {
    assertNever(otherSide);
  }
  // We don't need to worry about order here because o2ms do their own sorting internally and o2os are inherently
  // unordered (since it's just a single entity)
  getEmInternalApi(em).setPreloadedRelation(other.idTagged, otherSide.fieldName, otherEntities);
  otherSide.preload();
  // This method is confusingly name, what it actually does is clear out the sorted caches that m2m uses to avoid
  // sorting on every `.get` call.  Since we just preloaded the collection with new data, we know these caches need to
  // be cleared
  if (otherSide instanceof OneToManyCollection) otherSide.resetIsLoaded();
}

function processJoinRows(
  em: EntityManager,
  joinTable: string,
  rows: JoinRow[],
  preloads: Set<ManyToManyCollection<Entity, Entity>>,
  callback: (oldEntity: Entity, entities: Entity[]) => void,
) {
  const api = getEmInternalApi(em);
  rows.forEach((row) => {
    // A join row's `columns` is always an object with two key/value pairs, one for each side of the m2m
    const [[col1, e1], [col2, e2]] = Object.entries(row.columns);
    (
      [
        // Each join row needs to append/remove from both sides of the m2m. So we need to do the same operation once for
        // each side.
        [col1, e1, e2],
        [col2, e2, e1],
      ] as const
    ).forEach(([column, newEntity, newOther]) => {
      const { idTagged: id } = newEntity;
      const oldEntity = em.findExistingInstance(id)!;
      if (oldEntity.isDeletedEntity) return;
      const newM2m = getManyToManys(newEntity).find((r) => r.joinTableName === joinTable && r.columnName === column)!;
      const { fieldName } = newM2m;
      const oldM2m = (oldEntity as any)[fieldName] as ManyToManyCollection<Entity, Entity>;
      let entities: Entity[];
      if (preloads.has(oldM2m)) {
        // If a previous join row has already preloaded this relation, then we can just append/remove from the
        // existing preloaded data.
        entities = api.getPreloadedRelation(id, fieldName) as Entity[];
      } else if (oldM2m.isLoaded) {
        // The order here is important.  M2ms are returned in the order their join rows were inserted, so we need to
        // make sure we match that behavior here.  So we get all the extant rows first and then append each new row
        // in order from there.  Removals are fine since they'll modify the array in place and the correct order will
        // be preserved.
        entities = oldM2m.get;
      } else if (newEntity.isNewEntity) {
        // If this is a new entity, then all the join rows referencing it must also be inserts. So we can just use an
        // empty array initially and inserts will be appended to it.
        entities = [];
      } else {
        fail(`Expected ${fieldName} to be loaded`);
      }
      callback(em.findExistingInstance(newOther.idTagged)!, entities);
      api.setPreloadedRelation(id, fieldName, entities);
      // We only need to preload the m2m once, but multiple join rows could reference it, so we keep track of which m2ms
      // need to be preloaded as we work, then actually call preload() at the end once we're done.
      preloads.add(oldM2m);
    });
  });
}

function getReferences(entity: Entity): IteratorObject<ConcreteReference> {
  return getRelations(entity)
    .values()
    .filter(
      (r) =>
        r instanceof ManyToOneReferenceImpl ||
        r instanceof ReactiveReferenceImpl ||
        r instanceof PolymorphicReferenceImpl,
    );
}

function getManyToManys(entity: Entity): IteratorObject<ManyToManyCollection<Entity, Entity>> {
  return getRelations(entity)
    .values()
    .filter((r) => r instanceof ManyToManyCollection);
}

function getCollections(entity: Entity) {
  return getRelations(entity)
    .values()
    .filter(
      (r) =>
        r instanceof ManyToManyCollection || r instanceof OneToManyCollection || r instanceof OneToOneReferenceImpl,
    );
}
