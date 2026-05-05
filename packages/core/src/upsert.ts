import { isPlainObject } from "joist-utils";
import { setSyncDefaults } from "./defaults";
import { Entity, isEntity } from "./Entity";
import { EntityManager, IdOf, isKey, MaybeAbstractEntityConstructor } from "./EntityManager";
import { getMetadata, ManyToManyField, ManyToOneField, OneToManyField, OneToOneField } from "./EntityMetadata";
import {
  asConcreteCstr,
  getConstructorFromTaggedId,
  getProperties,
  PartialOrNull,
  setOpt,
  TimestampSerde,
} from "./index";
import { findExistingIfUniqueBy, resurrectIfSoftDeleted } from "./resurrection";
import { OptIdsOf, OptsOf } from "./typeMap";
import { NullOrDefinedOr, toArray } from "./utils";

/**
 * The type for `EntityManager.createOrUpdateUnsafe` that allows "upsert"-ish behavior.
 *
 * I.e. `T` is an entity with an optional id (create if unset, update if set), and we recurse
 * into any relations (references or collections) to allow those relations themselves to be
 * any combination of 1) ids to existing entities, 2) entities directly, 3) null/undefined
 * with the appropriate partial-update behavior, or 4) partials.
 */
export type DeepPartialOrNull<T extends Entity> = { id?: IdOf<T> | null } & AllowRelationsToBeIdsOrEntitiesOrPartials<
  PartialOrNull<OptsOf<T> & OptIdsOf<T>>
> &
  OptIdsOf<T>;

/** Flags that allow `upsert` to delete or remove entities. */
type CollectionFlags = {
  delete?: boolean | null;
  remove?: boolean | null;
  op?: "remove" | "delete" | "include" | "incremental";
};

/** Flag that allows `upsert` to delete. */
type DeleteFlag = {
  delete?: boolean | null;
};

type AllowRelationsToBeIdsOrEntitiesOrPartials<T> = {
  [P in keyof T]: T[P] extends NullOrDefinedOr<infer U>
    ? U extends Array<infer V>
      ? V extends Entity
        ? Array<V | (DeepPartialOrNull<V> & CollectionFlags) | IdOf<V>> | null
        : T[P]
      : U extends Entity
        ? U | (DeepPartialOrNull<U> & DeleteFlag) | IdOf<U> | null
        : T[P]
    : T[P];
};

/**
 * A utility function to do partial-update style updates.
 *
 * The difference between this and `Entity.setPartial` is that we accept `DeepPartialOrNull`
 * updates, similar to `createOrUpdateUnsafe`, instead of just a flat/shallow list of opts.
 */
export async function updatePartial<T extends Entity>(entity: T, input: DeepPartialOrNull<T>): Promise<void> {
  if (Object.keys(input).length === 0) return;
  const meta = getMetadata(entity);
  const { em } = entity;
  // Do a Promise.all so we .load() relations in parallel
  await Promise.all(
    Object.entries(input).map(async ([key, value]) => {
      // setPartial ==> `undefined` is a noop
      if (value === undefined) return;

      // Watch for the `bookId` / `bookIds` aliases
      const field = meta.allFields[key] || Object.values(meta.allFields).find((f) => f.fieldIdName === key);

      if (!field) {
        // Allow (ignore here) delete/remove flags that we assume the API layer (i.e. GraphQL) will have specifically
        // allowed, i.e. this isn't the Rails form bug where users can POST in any random field they want.
        const flagField = key === "delete" || key === "remove" || key === "op";
        if (flagField) return;
        // Look for non-field properties like a fullName setter
        const prop = getProperties(meta)[key];
        if (prop) {
          setOpt(meta, entity, key, value);
          return;
        } else {
          throw new Error(`Unknown field ${key}`);
        }
      }

      // Don't use key b/c it might be the bookId alias
      const name = field.fieldName;

      if (field.kind === "poly" && value && !isEntity(value)) {
        // Resolve non-entity poly values
        if (isKey(value)) {
          setOpt(meta, entity, name, await em.load(getConstructorFromTaggedId(value), value));
        } else {
          throw new Error(`Cannot use partial value for polymorphic field `);
        }
      } else if (field.kind === "m2o" && value && !isEntity(value)) {
        // This is a many-to-one reference
        if (isKey(value)) {
          setOpt(meta, entity, name, await em.load(field.otherMetadata().cstr, value));
        } else if (typeof value === "object" && value) {
          let other: any;
          if ("id" in value) {
            // This is a many-to-one partial update to an existing entity (they passed an id)
            other = await upsert(em, field.otherMetadata().cstr, value as any);
          } else {
            // This is a many-to-one partial w/o passing an id, i.e. `upsert(Author, { id: "a:1", publisher: { name: "p1" } })`
            if (entity.isNewEntity) {
              // If we're brand new, our child/other has to be brand new as well
              other = await upsert(em, field.otherMetadata().cstr, value);
            } else {
              // the o2o upsert hash didn't have an id, so find-or-create it
              other = await (entity as any)[name].load();
              if (other) {
                await updatePartial(other, value);
              } else {
                other = await upsert(em, field.otherMetadata().cstr, value);
              }
            }
          }
          const deleteMarker = getDeleteMarker(field, value);
          if (deleteMarker) {
            em.delete(other);
            other = undefined;
          }
          setOpt(meta, entity, name, other);
        }
      } else if (field.kind === "o2o") {
        // ^-- o2o always need loaded to be set, so don't fall through
        if (value === null || isEntity(value)) {
          await (entity as any)[name].load();
          setOpt(meta, entity, name, value);
        } else if (isKey(value)) {
          const [, other] = await Promise.all([
            (entity as any)[name].load(),
            em.load(field.otherMetadata().cstr, value),
          ]);
          setOpt(meta, entity, name, other);
        } else if (typeof value === "object" && isPlainObject(value)) {
          const deleteMarker = getDeleteMarker(field, value);
          // Always load the o2o so we can set it
          const current = await (entity as any)[name].load();
          let other: any;
          if ("id" in value) {
            // The o2o upsert hash was passed an id, so load it
            other = await upsert(em, field.otherMetadata().cstr, value as any);
          } else {
            // the o2o upsert hash didn't have an id, so find-or-create it
            other = current;
            if (other) {
              await updatePartial(other, value);
            } else {
              other = await upsert(em, field.otherMetadata().cstr, value);
            }
          }
          if (deleteMarker) {
            em.delete(other);
          } else {
            setOpt(meta, entity, name, other);
          }
        } else {
          throw new Error(`Invalid value ${value}`);
        }
      } else if (field.kind === "o2m" || field.kind === "m2m") {
        // Look for one-to-many/many-to-many partials
        // `null` is handled later, and treated as `[]`, which needs the collection loaded

        const values = toArray(value);
        const otherMeta = field.otherMetadata();
        const maybeSoftDelete = otherMeta.timestampFields?.deletedAt;

        // Incremental handling
        const anyValueHasOp = values.some((v) => v && typeof v === "object" && !isEntity(v) && "op" in v);
        if (anyValueHasOp) {
          let anyValueMissingOp = false;
          const current = (entity as any)[name];
          // The `op` behavior means incremental and wants to do this:
          await Promise.all(
            values.map(async (value: any) => {
              const [, , op] = getCollectionMarkers(field, value);
              if (op === "delete") {
                const other = await upsert(em, otherMeta.cstr, withOwnerField(field, value, entity));
                // We need to check if this is a soft-deletable entity, and if so, we will soft-delete it.
                if (maybeSoftDelete) {
                  const serde = otherMeta.fields[maybeSoftDelete].serde as TimestampSerde<unknown>;
                  const now = new Date();
                  other.set({ [maybeSoftDelete]: serde.mapFromNow(now) });
                } else {
                  entity.em.delete(other);
                }
              } else if (op === "remove") {
                const other = await upsert(em, otherMeta.cstr, withOwnerField(field, value, entity));
                current.remove(other);
              } else if (op === "include") {
                const other = await upsert(em, otherMeta.cstr, withOwnerField(field, value, entity));
                current.add(other);
              } else if (op === "incremental") {
                // This is a marker entry, just ignore it
              }
            }),
          );
          if (anyValueMissingOp) {
            throw new Error("If any child sets the `op` key, then all children must have the `op` key.");
          }
          return; // return from the op-based incremental behavior
        }

        // Otherwise we do exhaustive sets, will still looking for `delete`/`remove` markers
        const others = await Promise.all(
          values.map(async (value: any) => {
            if (isEntity(value)) {
              return value;
            } else if (isKey(value)) {
              return em.load(field.otherMetadata().cstr, value);
            } else if (value === null || value === undefined) {
              return undefined;
            } else if (!isPlainObject(value)) {
              throw new Error(`Invalid value ${value}`);
            } else {
              // Look for `delete: true/false` and `remove: true/false` markers
              const [deleteMarker, removeMarker] = getCollectionMarkers(field, value);
              const other = await upsert(em, field.otherMetadata().cstr, withOwnerField(field, value, entity));
              if (deleteMarker) {
                // if (maybeSoftDelete) {
                //   const serde = meta.fields[maybeSoftDelete].serde as TimestampSerde<unknown>;
                //   const now = new Date();
                //   other.set({ [maybeSoftDelete]: serde.mapFromNow(now) });
                // } else {
                // }
                em.delete(other);
                return other;
              } else if (removeMarker) {
                return undefined;
              } else {
                return other;
              }
            }
          }),
        );

        await (entity as any)[name].load();
        setOpt(
          meta,
          entity,
          name,
          others.filter((v) => v !== undefined),
        );
      } else {
        // If we get here, value should be a vanilla value that `setOpt` can handle/pass through as-is
        setOpt(meta, entity, name, value);
      }
    }),
  );
}

/**
 * A utility function to create-or-update/upsert entities coming from a partial-update style API.
 */
export async function upsert<T extends Entity>(
  em: EntityManager<any, any, any>,
  constructor: MaybeAbstractEntityConstructor<T>,
  input: DeepPartialOrNull<T>,
): Promise<T> {
  const { id, ...rest } = input;
  const entity =
    id !== null && id !== undefined
      ? await em.load(constructor, id)
      : // Look for an existing entity we could resurrect
        ((id === undefined ? await findExistingIfUniqueBy(em, constructor, rest) : undefined) ??
        em.createPartial(asConcreteCstr(constructor), {}));
  await updatePartial(entity, rest as any);
  // Do this manually since we're not going through setOpts anymore
  if (entity.isNewEntity) {
    setSyncDefaults(entity);
  } else {
    resurrectIfSoftDeleted(entity);
  }
  return entity;
}

/**
 * Adds the o2m owner field so child resurrection can find rows whose `uniqueBy` includes their parent.
 * I.e. upserting `Author.books: [{ title: "b1" }]` should lookup `Book.uniqueBy = [["author", "title"]]`.
 */
function withOwnerField(field: OneToManyField | ManyToManyField, value: any, owner: Entity): any {
  if (field.kind !== "o2m" || !isPlainObject(value)) return value;
  const ownerField = field.otherFieldName;
  const ownerFieldId = field.otherMetadata().allFields[ownerField]?.fieldIdName;
  if (Object.hasOwn(value, ownerField) || (ownerFieldId && Object.hasOwn(value, ownerFieldId))) return value;
  if (ownerFieldId && !owner.isNewEntity) return { ...value, [ownerFieldId]: owner.id };
  return { ...value, [ownerField]: owner };
}

function getCollectionMarkers(field: OneToManyField | ManyToManyField, value: any): [any, any, any] {
  const allowDelete = !field.otherMetadata().fields["delete"];
  const allowRemove = !field.otherMetadata().fields["remove"];
  const allowOp = !field.otherMetadata().fields["op"];

  // Look for `delete: true/false` and `remove: true/false` markers
  const deleteMarker: any = allowDelete && value["delete"];
  const removeMarker: any = allowRemove && value["remove"];
  const opMarker: any = allowOp && value["op"];

  // Remove the markers, regardless of true/false, before recursing into upsert to avoid unknown fields
  if (deleteMarker !== undefined) delete value.delete;
  if (removeMarker !== undefined) delete value.remove;
  if (opMarker !== undefined) delete value.op;

  return [deleteMarker, removeMarker, opMarker];
}
function getDeleteMarker(field: OneToOneField | ManyToOneField, value: any): boolean {
  const allowDelete = !field.otherMetadata().fields["delete"];
  const deleteMarker: any = allowDelete && value["delete"];
  if (deleteMarker !== undefined) delete value.delete;
  return deleteMarker;
}
