import { NullOrDefinedOr } from "./utils";
import { Entity, EntityConstructor, EntityManager, getMetadata, IdOf, isEntity, isKey, OptsOf } from "./EntityManager";
import { PartialOrNull } from "./index";

/**
 * The type for `EntityManager.createOrUpdateUnsafe` that allows "upsert"-ish behavior.
 *
 * I.e. `T` is an entity with an optional id (create if unset, update if set), and we recurse
 * into any relations (references or collections) to allow those relations themselves to be
 * any combination of 1) ids to existing entities, 2) entities directly, 3) null/undefined
 * with the appropriate partial-update behavior, or 4) partials.
 */
export type DeepPartialOrNull<T extends Entity> = { id?: IdOf<T> | null } & AllowRelationsToBeIdsOrEntitiesOrPartials<
  PartialOrNull<OptsOf<T>>
>;

type AllowRelationsToBeIdsOrEntitiesOrPartials<T> = {
  [P in keyof T]: T[P] extends NullOrDefinedOr<infer U>
    ? U extends Array<infer V>
      ? V extends Entity
        ? Array<V | (DeepPartialOrNull<V> & { delete?: boolean | null; remove?: boolean | null }) | IdOf<V>> | null
        : T[P]
      : U extends Entity
      ? U | DeepPartialOrNull<U> | IdOf<U> | null
      : T[P]
    : T[P];
};

/**
 * A utility function to create-or-update entities coming from a partial-update style API.
 */
export async function createOrUpdatePartial<T extends Entity>(
  em: EntityManager,
  constructor: EntityConstructor<T>,
  opts: DeepPartialOrNull<T>,
): Promise<T> {
  const { id, ...others } = opts;
  const meta = getMetadata(constructor);

  // The values in others might be themselves partials, so walk through and resolve them to entities.
  const p = Object.entries(others).map(async ([key, value]) => {
    const field = meta.fields.find((f) => f.fieldName === key);
    if (!field) {
      // Allow delete/remove flags that we assume the API layer (i.e. GraphQL) will have specifically
      // allowed, i.e. this isn't the Rails form bug where users can POST in any random field they want.
      const flagField = key === "delete" || key === "remove";
      if (flagField) {
        // Pass these along for setOpts to look for
        return [key, value];
      }
      throw new Error(`Unknown field ${key}`);
    }
    if (field.kind === "m2o" && !isEntity(value)) {
      if (!value || isEntity(value)) {
        return [key, value];
      } else if (isKey(value)) {
        // This is a many-to-one reference
        const entity = await em.load(field.otherMetadata().cstr, value);
        return [key, entity];
      } else {
        // This is a many-to-one partial
        const entity = await createOrUpdatePartial(em, field.otherMetadata().cstr, value as any);
        return [key, entity];
      }
    } else if (field.kind === "o2m" || field.kind === "m2m") {
      // Look for one-to-many/many-to-many partials

      // We allow `delete` and `remove` commands but only if they don't collide with existing fields
      // Also we trust the API layer, i.e. GraphQL, to not let these fields leak unless explicitly allowed.
      const allowDelete = !field.otherMetadata().fields.some((f) => f.fieldName === "delete");
      const allowRemove = !field.otherMetadata().fields.some((f) => f.fieldName === "remove");

      const entities = !value
        ? []
        : (value as Array<any>).map(async (value) => {
            if (!value || isEntity(value)) {
              return value;
            } else if (isKey(value)) {
              return await em.load(field.otherMetadata().cstr, value);
            } else {
              // Look for `delete: true/false` and `remove: true/false` markers
              const deleteMarker = allowDelete && value["delete"];
              const removeMarker = allowRemove && value["remove"];
              // Remove the markers, regardless of true/false, before recursing into createOrUpdatePartial to avoid unknown fields
              if (deleteMarker !== undefined) delete value.delete;
              if (removeMarker !== undefined) delete value.remove;
              const entity = await createOrUpdatePartial(em, field.otherMetadata().cstr, value as any);
              // Put the markers back for setOpts to find
              if (deleteMarker === true) entity.delete = true;
              if (removeMarker === true) entity.remove = true;
              return entity;
            }
          });
      return [key, await Promise.all(entities)];
    } else {
      return [key, value];
    }
  });
  const _opts = Object.fromEntries(await Promise.all(p)) as OptsOf<T>;

  if (id === null || id === undefined) {
    return em.createPartial(constructor, _opts);
  } else {
    const entity = await em.load(constructor, id);
    entity.setPartial(_opts);
    return entity;
  }
}
