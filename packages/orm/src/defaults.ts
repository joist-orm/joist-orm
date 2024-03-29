import { Entity } from "./Entity";
import { EntityMetadata, getBaseAndSelfMetas, getMetadata } from "./EntityMetadata";
import { Todo } from "./Todo";
import { setField } from "./fields";
import { ReactiveQueryFieldImpl } from "./relations/ReactiveQueryField";
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
      if ((entity as any)[field] === undefined) {
        (entity as any)[field] = maybeFn instanceof Function ? maybeFn(entity) : maybeFn;
      } else if ((entity as any)[field] instanceof ReactiveQueryFieldImpl) {
        setField(entity, field, maybeFn);
      }
    }
  });
}

/** Runs the async defaults for all inserted entities in `todos`. */
export function setAsyncDefaults(ctx: unknown, todos: Record<string, Todo>): Promise<unknown> {
  return Promise.all(
    Object.values(todos).flatMap((todo) =>
      todo.inserts.flatMap((entity) =>
        getBaseAndSelfMetas(getMetadata(entity)).flatMap((m) =>
          Object.entries(m.config.__data.asyncDefaults).map(async ([fieldName, fn]) => {
            const value = (entity as any)[fieldName];
            if (value === undefined) {
              (entity as any)[fieldName] = await fn(entity, ctx);
            } else if (isLoadedReference(value) && !value.isSet) {
              value.set(await fn(entity, ctx));
            }
          }),
        ),
      ),
    ),
  );
}
