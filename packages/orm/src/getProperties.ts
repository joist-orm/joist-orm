import { Entity } from "./Entity";
import * as EM from "./EntityManager";
import { EntityMetadata } from "./EntityMetadata";

// Hack to make currentlyInstantiatingEntity assignable
const em = EM;

/**
 * Returns the relations in `meta`, both those defined in the codegen file + any user-defined `CustomReference`s.
 *
 * This is a little tricky because field assignments don't show up on the prototype, so we actually
 * instantiate a throw-away instance to observe the side-effect of what fields it has.
 */
export function getProperties<T extends Entity>(meta: EntityMetadata<T>): string[] {
  return [...Object.getOwnPropertyNames(meta.cstr.prototype), ...Object.keys(getFakeInstance(meta))].filter(
    (key) => key !== "constructor" && !key.startsWith("__"),
  );
}

const fakeInstances: Record<string, Entity> = {};

/**
 * Returns a fake instance of `meta` so that user-defined `CustomReference` and `AsyncProperty`s can
 * be inspected on boot.
 */
export function getFakeInstance<T extends Entity>(meta: EntityMetadata<T>): T {
  return (fakeInstances[meta.cstr.name] ??= new meta.cstr(
    {
      register: (metadata: any, entity: any) => {
        em.currentlyInstantiatingEntity = entity;
        entity.__orm = { metadata: meta, data: {} };
      },
    } as any,
    {},
  )) as T;
}
