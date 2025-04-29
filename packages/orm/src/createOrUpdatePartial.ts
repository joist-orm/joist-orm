import { isPlainObject } from "joist-utils";
import { Entity, isEntity } from "./Entity";
import { EntityManager, IdOf, MaybeAbstractEntityConstructor, isKey } from "./EntityManager";
import { ManyToManyField, OneToManyField, getMetadata } from "./EntityMetadata";
import {
  PartialOrNull,
  TimestampSerde,
  asConcreteCstr,
  getConstructorFromTaggedId,
  getProperties,
  setOpt,
} from "./index";
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

/** Flags that allow `createOrUpdatePartial` to delete or remove entities. */
type ManagementFlags = {
  delete?: boolean | null;
  remove?: boolean | null;
  op?: "remove" | "delete" | "include" | "incremental";
};

type AllowRelationsToBeIdsOrEntitiesOrPartials<T> = {
  [P in keyof T]: T[P] extends NullOrDefinedOr<infer U>
    ? U extends Array<infer V>
      ? V extends Entity
        ? Array<V | (DeepPartialOrNull<V> & ManagementFlags) | IdOf<V>> | null
        : T[P]
      : U extends Entity
        ? U | (DeepPartialOrNull<U> & ManagementFlags) | IdOf<U> | null
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
  const meta = getMetadata(entity);
  const { em } = entity;
  // Do a Promise.all so we .load() relations in parallel
  await Promise.all(
    Object.entries(input).map(async ([key, value]) => {
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
        } else if (typeof value === "object" && value && "id" in value) {
          // This is a many-to-one partial update to an existing entity (they passed an id)
          const other = await createOrUpdatePartial(em, field.otherMetadata().cstr, value as any);
          setOpt(meta, entity, name, other);
        } else {
          // This is a many-to-one partial w/o passing an id, i.e. `upsert(Author, { id: "a:1", publisher: { name: "p1" } })`
          let other: any;
          if (entity.isNewEntity) {
            // If we're brand new, our child/other has to be brand new as well
            other = await createOrUpdatePartial(em, field.otherMetadata().cstr, value);
          } else {
            // If we already exist, see what our current value is
            other = await (entity as any)[name].load();
            if (other) {
              await createOrUpdatePartial(em, field.otherMetadata().cstr, { id: other.id, ...(value as any) });
            } else {
              // If it doesn't, go ahead and create a new one
              other = await createOrUpdatePartial(em, field.otherMetadata().cstr, value);
            }
          }
          setOpt(meta, entity, name, other);
        }
      } else if (field.kind === "o2o") {
        if (!value || isEntity(value)) {
          await (entity as any)[name].load();
          setOpt(meta, entity, name, value);
        } else if (isKey(value)) {
          const [, other] = await Promise.all([
            (entity as any)[name].load(),
            em.load(field.otherMetadata().cstr, value),
          ]);
          setOpt(meta, entity, name, other);
        } else {
          // const [allowDelete, allowRemove, allowOp] = allowFlags(field);
          const [, other] = await Promise.all([
            (entity as any)[name].load(),
            createOrUpdatePartial(em, field.otherMetadata().cstr, value as any),
          ]);
          setOpt(meta, entity, name, other);
        }
      } else if (field.kind === "o2m" || field.kind === "m2m") {
        await (entity as any)[name].load();

        // Look for one-to-many/many-to-many partials
        // `null` is handled later, and treated as `[]`, which needs the collection loaded

        let anyValueHasOp = false;
        let anyValueMissingOp = false;
        const maybeSoftDelete = meta.timestampFields.deletedAt;

        const others = await Promise.all(
          toArray(value).map(async (value: any) => {
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

              // The `op` behavior means incremental and wants to do this:
              // which we "can't do" without having the entity to get at the current value.
              // This is why historically we had the op-handling in embedded in setOpts, is that only it
              // had access to the entity, and create partial "couldn't". But, really, why is createOrUpdatePartial
              // going through setOpts anyway? If we had the entity at hand, we could directly iterate and call sets.
              // Granted, setOpts has some field-specific handling, but we could extract a setOpt singular and have
              // both us & them call it.
              // values.forEach((v) => {
              //   if (v.op === "delete") {
              //     // We need to check if this is a soft-deletable entity, and if so, we will soft-delete it.
              //     if (maybeSoftDelete) {
              //       const serde = meta.fields[maybeSoftDelete].serde as TimestampSerde<unknown>;
              //       const now = new Date();
              //       v.set({ [maybeSoftDelete]: serde.mapFromNow(now) });
              //     } else {
              //       entity.em.delete(v);
              //     }
              //   } else if (v.op === "remove") {
              //     (current as any).remove(v);
              //   } else if (v.op === "include") {
              //     (current as any).add(v);
              //   } else if (v.op === "incremental") {
              //     // This is a marker entry to opt-in to incremental behavior, just drop it
              //   }
              // });
              // return; // return from the op-based incremental behavior

              const [deleteMarker, removeMarker, opMarker] = getManagementMarkers(field, value);
              if (opMarker) anyValueHasOp ??= true;
              if (!opMarker) anyValueHasOp ??= true;
              const entity = await createOrUpdatePartial(em, field.otherMetadata().cstr, value as any);
              if (deleteMarker || opMarker === "delete") {
                if (maybeSoftDelete) {
                  const serde = meta.fields[maybeSoftDelete].serde as TimestampSerde<unknown>;
                  const now = new Date();
                  entity.set({ [maybeSoftDelete]: serde.mapFromNow(now) });
                } else {
                  em.delete(entity);
                }
                return entity;
              } else if (removeMarker || opMarker === "remove") {
                return undefined;
              } else {
                return entity;
              }
            }
          }),
        );

        if (anyValueHasOp && anyValueMissingOp) {
          throw new Error("If any child sets the `op` key, then all children must have the `op` key.");
        }

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
export async function createOrUpdatePartial<T extends Entity>(
  em: EntityManager<any, any, any>,
  constructor: MaybeAbstractEntityConstructor<T>,
  input: DeepPartialOrNull<T>,
): Promise<T> {
  const { id, ...rest } = input;
  const isNew = id === null || id === undefined;
  const entity = isNew
    ? // asConcreteCstr is not actually safe but for now we rely on our cstr runtime check to catch this
      em.createPartial(asConcreteCstr(constructor), {})
    : await em.load(constructor, id);
  await updatePartial(entity, rest as any);
  return entity;
}

function getManagementMarkers(field: OneToManyField | ManyToManyField, value: any): [any, any, any] {
  const allowDelete = !field.otherMetadata().fields["delete"];
  const allowRemove = !field.otherMetadata().fields["remove"];
  const allowOp = !field.otherMetadata().fields["op"];

  // Look for `delete: true/false` and `remove: true/false` markers
  const deleteMarker: any = allowDelete && value["delete"];
  const removeMarker: any = allowRemove && value["remove"];
  const opMarker: any = allowOp && value["op"];

  // Remove the markers, regardless of true/false, before recursing into createOrUpdatePartial to avoid unknown fields
  if (deleteMarker !== undefined) delete value.delete;
  if (removeMarker !== undefined) delete value.remove;
  if (opMarker !== undefined) delete value.op;

  return [deleteMarker, removeMarker, opMarker];
}
