import { Entity, isEntity } from "./Entity";
import { EntityConstructor, EntityManager, IdOf, isKey, OptIdsOf, OptsOf } from "./EntityManager";
import { getMetadata } from "./EntityMetadata";
import { getConstructorFromTaggedId, PartialOrNull } from "./index";
import { NullOrDefinedOr } from "./utils";

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

type AllowRelationsToBeIdsOrEntitiesOrPartials<T> = {
  [P in keyof T]: T[P] extends NullOrDefinedOr<infer U>
    ? U extends Array<infer V>
      ? V extends Entity
        ? Array<
            | V
            | (DeepPartialOrNull<V> & {
                delete?: boolean | null;
                remove?: boolean | null;
                op?: "remove" | "delete" | "include" | "incremental";
              })
            | IdOf<V>
          > | null
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
  em: EntityManager<any>,
  constructor: EntityConstructor<T>,
  opts: DeepPartialOrNull<T>,
): Promise<T> {
  const { id, ...others } = opts as any;
  const meta = getMetadata(constructor);
  const isNew = id === null || id === undefined;
  const collectionsToLoad: string[] = [];

  // The values in others might be themselves partials, so walk through and resolve them to entities.
  const p = Object.entries(others).map(async ([key, value]) => {
    // Watch for the `bookId` / `bookIds` aliases
    const field = meta.allFields[key] || Object.values(meta.allFields).find((f) => f.fieldIdName === key);

    if (!field) {
      // Allow delete/remove flags that we assume the API layer (i.e. GraphQL) will have specifically
      // allowed, i.e. this isn't the Rails form bug where users can POST in any random field they want.
      const flagField = key === "delete" || key === "remove" || key === "op";
      if (flagField) {
        // Pass these along for setOpts to look for
        return [key, value];
      }
      throw new Error(`Unknown field ${key}`);
    }

    // Don't use key b/c it might be the bookId alias
    const name = field.fieldName;

    if (field.kind === "poly" && !isEntity(value)) {
      if (!value) {
        return [name, value];
      } else if (isKey(value)) {
        // This is a polymorphic reference
        const entity = await em.load(getConstructorFromTaggedId(value), value);
        return [name, entity];
      } else {
        throw new Error(`Cannot use partial value for polymorphic field `);
      }
    } else if (field.kind === "m2o" && !isEntity(value)) {
      if (!value || isEntity(value)) {
        return [name, value];
      } else if (isKey(value)) {
        // This is a many-to-one reference
        const entity = await em.load(field.otherMetadata().cstr, value);
        return [name, entity];
      } else if (typeof value === "object" && value && !("id" in value)) {
        // This is a many-to-one partial into an existing reference that we need to resolve
        let currentValue: any;
        if (isNew) {
          // The parent is brand new so the child is defacto brand new as well
          currentValue = await createOrUpdatePartial(em, field.otherMetadata().cstr, value);
        } else {
          // The parent exists, see if it has an existing child we can update
          const parentEntity = await em.load(constructor, id, [name] as any);
          currentValue = (parentEntity as any)[name].get;
          if (currentValue) {
            await createOrUpdatePartial(em, field.otherMetadata().cstr, { id: currentValue.id, ...value });
          } else {
            // If it doesn't, go ahead and create a new one
            currentValue = await createOrUpdatePartial(em, field.otherMetadata().cstr, value);
          }
        }
        return [name, currentValue];
      } else {
        // This is a many-to-one partial into a new entity
        const entity = await createOrUpdatePartial(em, field.otherMetadata().cstr, value as any);
        return [name, entity];
      }
    } else if (field.kind === "o2m" || field.kind === "m2m") {
      // Look for one-to-many/many-to-many partials

      // We allow `delete` and `remove` commands but only if they don't collide with existing fields
      // Also we trust the API layer, i.e. GraphQL, to not let these fields leak unless explicitly allowed.
      const allowDelete = !field.otherMetadata().fields["delete"];
      const allowRemove = !field.otherMetadata().fields["remove"];
      const allowOp = !field.otherMetadata().fields["op"];
      collectionsToLoad.push(field.fieldName);

      const entities = !value
        ? []
        : (value as Array<any>).map(async (value) => {
            if (!value || isEntity(value)) {
              return value;
            } else if (isKey(value)) {
              return await em.load(field.otherMetadata().cstr, value);
            } else {
              // Look for `delete: true/false` and `remove: true/false` markers
              const deleteMarker: any = allowDelete && value["delete"];
              const removeMarker: any = allowRemove && value["remove"];
              const opMarker: any = allowOp && value["op"];
              // If this is the incremental marker, just leave it in as-is so that setOpts can see it
              if (opMarker === "incremental") {
                return value;
              }
              // Remove the markers, regardless of true/false, before recursing into createOrUpdatePartial to avoid unknown fields
              if (deleteMarker !== undefined) delete value.delete;
              if (removeMarker !== undefined) delete value.remove;
              if (opMarker !== undefined) delete value.op;
              const entity = await createOrUpdatePartial(em, field.otherMetadata().cstr, value as any);
              // Put the markers back for setOpts to find
              if (deleteMarker === true) entity.delete = true;
              if (removeMarker === true) entity.remove = true;
              if (opMarker) entity.op = opMarker;
              return entity;
            }
          });
      return [name, await Promise.all(entities)];
    } else {
      return [name, value];
    }
  });
  const _opts = Object.fromEntries(await Promise.all(p)) as OptsOf<T>;

  if (isNew) {
    return em.createPartial(constructor, _opts);
  } else {
    const entity = await em.load(constructor, id);
    // For o2m and m2m .set to work, they need to be loaded so that they know what to remove.
    // Note that we also have the `delete: true` pattern for flagging not only "remove" but "delete",
    // for a parent's mutation to control the lifecycle of a child entity (i.e. line items).
    // Musing: Maybe this should happen implicitly, like if a LineItem.parent is set to null, that
    // LineItem knows to just `em.delete` itself? Instead of relying on hints from GraphQL mutations.
    await Promise.all(collectionsToLoad.map((fieldName) => (entity as any)[fieldName].load()));
    entity.setPartial(_opts);
    return entity;
  }
}
