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
        ? Array<V | DeepPartialOrNull<V> | IdOf<V>> | null
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
    const field = meta.fields.find((f) => f.fieldName === key)!;
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
      const entities = !value
        ? []
        : (value as Array<any>).map(async (value) => {
            if (!value || isEntity(value)) {
              return value;
            } else if (isKey(value)) {
              return await em.load(field.otherMetadata().cstr, value);
            } else {
              return await createOrUpdatePartial(em, field.otherMetadata().cstr, value as any);
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
