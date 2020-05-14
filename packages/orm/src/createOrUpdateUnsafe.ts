// Utility type to strip off null and defined and infer only T.
import { Entity, EntityConstructor, EntityManager, getMetadata, IdOf, isEntity, isKey, OptsOf } from "./EntityManager";
import { PartialOrNull } from "./index";

type NullOrDefinedOr<T> = T | null | undefined;

export type DeepPartialOrNull<T extends Entity> = { id?: IdOf<T> | null } & Foo<PartialOrNull<OptsOf<T>>>;

type Foo<T> = {
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
export async function createOrUpdateUnsafe<T extends Entity>(
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
        const entity = await createOrUpdateUnsafe(em, field.otherMetadata().cstr, value as any);
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
              return await createOrUpdateUnsafe(em, field.otherMetadata().cstr, value as any);
            }
          });
      return [key, await Promise.all(entities)];
    } else {
      return [key, value];
    }
  });
  const _opts = Object.fromEntries(await Promise.all(p)) as OptsOf<T>;

  if (id === null || id === undefined) {
    return em.createUnsafe(constructor, _opts);
  } else {
    const entity = await em.load(constructor, id);
    entity.setUnsafe(_opts);
    return entity;
  }
}
