import { BaseEntity } from "./BaseEntity";
import { Entity } from "./Entity";
import { EntityMetadata } from "./EntityMetadata";
import { RelationConstructor } from "./newEntity";

/**
 * Returns the relations in `meta`, both those defined in the codegen file + any user-defined `CustomReference`s.
 *
 * This is a little tricky because field assignments don't show up on the prototype, so we actually
 * instantiate a throw-away instance to observe the side-effect of what fields it has.
 *
 * The map values will be:
 *
 * - The `AbstractRelationImpl` or `AbstractPropertyImpl` for relations
 * - The primitive value like true/false/"foo" for getters that return primitive values
 * - A `UnknownProperty` for keys/getters that return `undefined` or throw errors
 * - Any other custom value that the user has defined
 *
 * Basically the values won't be `undefined`, to avoid throwing off `if getPropertyes(meta)[key]`
 * checks.
 */
export function getProperties(meta: EntityMetadata, keepRelationConstructors = false): Record<string, any> {
  // If meta is an STI subtype, give it a different key
  const key = meta.stiDiscriminatorValue ? `${meta.tableName}:${meta.stiDiscriminatorValue}` : meta.tableName;
  if (propertiesCache[key]) {
    return keepRelationConstructors ? propertiesCache2[key] : propertiesCache[key];
  }

  // Immediately populate key to avoid infinite loops when we later call `instance[key]` to probe
  // for properties, and we end up calling a getter than invokes a ReactiveField/anything else that
  // happens to ask for properties.
  // The caller will admittedly see incorrect (empty) properties, but we generally expect these "evaled
  // on fake instances" getters to throw nonsense errors anyway (which we suppress), so it should be fine.
  const cached = (propertiesCache[key] = {});

  const fakeEm = undefined as any;
  const instance = new (meta.cstr as any)(fakeEm, true);
  fakeInstances[meta.cstr.name] = instance;

  // Mostly for historical reasons, we don't treat known primitives/enums as properties,
  // i.e. properties were originally meant to be the wrapper objects like `hasOne`,
  // `hasMany`, `ReactiveField`, etc.
  //
  // That said, we've since start leaking other things like getters, regular async methods,
  // etc., into properties, so that `entityResolver` can pick them up as keys to put into
  // the GraphQL resolvers. So we should probably just remove this filter and let everything
  // get returned as properties.
  const knownPrimitives = Object.values(meta.allFields)
    .filter((f) => f.kind === "primaryKey" || ((f.kind === "primitive" || f.kind === "enum") && !f.derived))
    .map((f) => f.fieldName);

  // Recursively looking for ownKeys will find:
  // - Custom properties set on the instance, like `readonly author: Reference<Author> = hasOneThrough(...)`
  // - Getters declared within the class like `get initials()`
  // - Getters auto-created by transform-properties when it lazies `readonly author = hasOneThrough(...)` relations
  // - Getters declared within the codegen classes like `get books(): Reference<...>`
  const properties = getRecursiveOwnNames(instance)
    .filter((key) => key !== "constructor" && !key.startsWith("__") && !knownPrimitives.includes(key))
    .map((key) => {
      // Return the value of `instance[key]` but wrap it in a try/catch in case it's
      // a getter that runs code that fails b/c of the dummy state we're in.
      try {
        return [key, (instance as any)[key] ?? unknown];
      } catch {
        return [key, unknown];
      }
    })
    // Purposefully return methods, primitives, etc. so that `entityResolver` can add them to the resolver
    .filter(([key]) => key !== "fullNonReactiveAccess");

  // Keep one version with the relations still lazy
  propertiesCache2[key] = Object.fromEntries(properties);

  // But expose to everyone else the concrete/constructed relations
  Object.assign(cached, Object.fromEntries(properties.filter(([fieldName]) => fieldName !== "transientFields")));
  for (const [fieldName, value] of properties) {
    if (value instanceof RelationConstructor) {
      (instance as any)[fieldName] = (cached as any)[fieldName] = value.create(instance, fieldName);
    }
  }

  return cached;
}

export class UnknownProperty {}
const unknown = new UnknownProperty();

const propertiesCache: Record<string, any> = {};
const propertiesCache2: Record<string, any> = {};
const fakeInstances: Record<string, Entity> = {};

/**
 * Returns a fake instance of `meta` so that user-defined `CustomReference` and `AsyncProperty`s can
 * be inspected on boot.
 */
export function getFakeInstance(meta: EntityMetadata): Entity {
  // Use getProperties to create the fake instance
  getProperties(meta);
  return fakeInstances[meta.cstr.name] ?? fail(`${meta.cstr.name} fake instance not found`);
}

// These are keys we codegen into `AuthorCodegen` files to get the best typing
// experience, but really should be treated as BaseEntity keys that we don't
// need to expose from `getProperties`.
const ignoredKeys = new Set([
  "id",
  "idMaybe",
  "idTagged",
  "idTaggedMaybe",
  "set",
  "setPartial",
  "setDeepPartial",
  "changes",
  "isSoftDeletedEntity",
  "load",
  "populate",
  "isLoaded",
  "toJSON",
]);

// function getRecursiveOwnNames(cstr: MaybeAbstractEntityConstructor<any>): string[] {
function getRecursiveOwnNames(instance: any): string[] {
  const keys: string[] = [];
  for (let curr = instance; curr && curr !== BaseEntity.prototype; curr = Object.getPrototypeOf(curr)) {
    keys.push(...Object.getOwnPropertyNames(curr));
  }
  return keys.filter((k) => !ignoredKeys.has(k));
}
