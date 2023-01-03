import { Entity } from "./Entity";
import * as EM from "./EntityManager";
import { EntityMetadata } from "./EntityMetadata";
import { asConcreteCstr } from "./index";

// Hack to make currentlyInstantiatingEntity assignable
const em = EM;

/**
 * Returns the relations in `meta`, both those defined in the codegen file + any user-defined `CustomReference`s.
 *
 * This is a little tricky because field assignments don't show up on the prototype, so we actually
 * instantiate a throw-away instance to observe the side-effect of what fields it has.
 */
export function getProperties<T extends Entity>(meta: EntityMetadata<T>): Record<string, any> {
  if (propertiesCache[meta.tagName]) {
    return propertiesCache[meta.tagName];
  }
  const instance = getFakeInstance(meta);
  propertiesCache[meta.tagName] = Object.fromEntries(
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
      })
      // Purposefully return methods, primitives, etc. so that `entityResolver` can add them to the resolver
      .filter(([key]) => key !== "entity"),
  );
  return propertiesCache[meta.tagName];
}

const propertiesCache: Record<string, any> = {};
const fakeInstances: Record<string, Entity> = {};

/**
 * Returns a fake instance of `meta` so that user-defined `CustomReference` and `AsyncProperty`s can
 * be inspected on boot.
 */
export function getFakeInstance<T extends Entity>(meta: EntityMetadata<T>): T {
  // asConcreteCstr is safe b/c we're just doing property scanning and not real instantiation
  return (fakeInstances[meta.cstr.name] ??= new (asConcreteCstr(meta.cstr))(
    {
      register: (metadata: any, entity: any) => {
        em.currentlyInstantiatingEntity = entity;
        entity.__orm.metadata = meta;
        entity.__orm.data = {};
      },
      // Tell our "cannot instantiate an abstract class" constructor logic check to chill
      fakeInstance: true,
    } as any,
    {},
  )) as T;
}
