import { Entity } from "./Entity";
import { EntityMetadata, PrimitiveField, getBaseAndSelfMetas, getMetadata } from "./EntityMetadata";
import { Todo } from "./Todo";
import { setField } from "./fields";
import { isLoadedReference } from "./relations/index";

export function hasDefaultValue(meta: EntityMetadata, fieldName: string): boolean {
  return getBaseAndSelfMetas(meta).some(
    (m) => fieldName in m.config.__data.syncDefaults || fieldName in m.config.__data.asyncDefaults,
  );
}

/** Run the sync defaults for `entity`. */
export function setSyncDefaults(entity: Entity): void {
  getBaseAndSelfMetas(getMetadata(entity)).forEach((m) => {
    for (const [field, maybeFn] of Object.entries(m.config.__data.syncDefaults)) {
      const value = (entity as any)[field];
      // Use allFields in case a subtype sets a default for one of its base fields
      if (m.allFields[field].kind === "primitive" && (m.allFields[field] as PrimitiveField)["derived"] === "async") {
        // If this is a ReactiveQueryField, we want to push in a default, but setOpts is called
        // from the codegen constructor, so the user-defined `hasReactiveQueryField` fields will
        // not have been initialized yet (i.e. `entity[field]` will be undefined and not yet an
        // `instanceof ReactiveQueryField`). Thankfully we can just use setField.
        setField(entity, field, maybeFn);
      } else if (value === undefined) {
        (entity as any)[field] = maybeFn instanceof Function ? maybeFn(entity) : maybeFn;
      } else if (isLoadedReference(value) && !value.isSet) {
        // A sync default usually would never be for a reference, because reference defaults usually
        // require a field hint (so would be async) to get "the other entity". However, something like:
        // `config.setDefault("original", (self) => self);` is technically valid.
        value.set(maybeFn instanceof Function ? maybeFn(entity) : maybeFn);
      }
    }
  });
}

/** Runs the async defaults for all inserted entities in `todos`. */
export function setAsyncDefaults(ctx: unknown, todos: Record<string, Todo>): Promise<unknown> {
  return Promise.all(
    Object.values(todos).flatMap((todo) =>
      // Would probably be good to bulk `em.populate` all the entities at once, instead of dataloader-ing them back together
      todo.inserts.flatMap((entity) =>
        getBaseAndSelfMetas(getMetadata(entity)).flatMap(async (m) => {
          // Apply defaults by level, for defaults by depend on another
          for await (const level of m.config.__data.asyncDefaultsByLevel) {
            await Promise.all(
              level.map(async (df) => {
                const value = (entity as any)[df.fieldName];
                if (value === undefined) {
                  (entity as any)[df.fieldName] = await df.getValue(entity, ctx);
                } else if (isLoadedReference(value) && !value.isSet) {
                  value.set(await df.getValue(entity, ctx));
                }
              }),
            );
          }
        }),
      ),
    ),
  );
}
