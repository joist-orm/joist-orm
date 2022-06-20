import { Entity } from "./Entity";
import * as EM from "./EntityManager";
import { EntityMetadata } from "./EntityMetadata";

// Hack to make module-level currentlyInstantiatingEntity assignable
const em = EM;
const cache: Record<string, any> = {};
const dummyEm = {
  register: (metadata: any, entity: any) => {
    em.currentlyInstantiatingEntity = entity;
  },
} as any;

/**
 * Returns the relations in `meta`, both those defined in the codegen file + any user-defined `CustomReference`s.
 *
 * This is a little tricky because field assignments don't show up on the prototype, so we actually
 * instantiate a throw-away instance to observe the side-effect of what fields it has.
 */
export function getProperties<T extends Entity>(meta: EntityMetadata<T>): Record<string, any> {
  if (cache[meta.tagName]) {
    return cache[meta.tagName];
  }

  const instance = new meta.cstr(dummyEm, {});
  cache[meta.tagName] = Object.fromEntries(
    [...Object.getOwnPropertyNames(meta.cstr.prototype), ...Object.keys(instance)]
      .filter((key) => key !== "constructor" && !key.startsWith("__"))
      .map((key) => {
        // Return the value of `instance[key]` but wrap it in a try/catch in case it's
        // a getter that runs code that fails b/c of the dummy state we're in.
        try {
          return [key, (instance as any)[key]];
        } catch {
          return [key, undefined];
        }
      }),
  );

  return cache[meta.tagName];
}
