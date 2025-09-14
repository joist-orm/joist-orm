import { BaseEntity } from "./BaseEntity";
import { EntityMetadata } from "./EntityMetadata";
import { RelationConstructor } from "./newEntity";
import { partition } from "./utils";

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
export function getProperties(meta: EntityMetadata): Record<string, any> {
  // If meta is an STI subtype, give it a different key
  const key = meta.stiDiscriminatorValue ? `${meta.tableName}:${meta.stiDiscriminatorValue}` : meta.tableName;
  if (propertiesCache[key]) {
    return propertiesCache[key];
  }

  // Immediately populate key to avoid infinite loops when we later call `instance[key]` to probe
  // for properties, and we end up calling a getter than invokes a ReactiveField/anything else that
  // happens to ask for properties.
  // The caller will admittedly see incorrect (empty) properties, but we generally expect these "evaled
  // on fake instances" getters to throw nonsense errors anyway (which we suppress), so it should be fine.
  const cached = (propertiesCache[key] = {});

  const fakeEm = undefined as any;
  const instance = new (meta.cstr as any)(fakeEm, true);

  // Mostly for historical reasons, we don't treat known primitives/enums as properties,
  // i.e. properties were originally meant to be the wrapper objects like `hasOne`,
  // `hasMany`, `ReactiveField`, etc.
  //
  // That said, we've since start leaking other things like getters, regular async methods,
  // etc., into properties, so that `entityResolver` can pick them up as keys to put into
  // the GraphQL resolvers. So we should probably just remove this filter and let everything
  // get returned as properties.
  const knownPrimitives = Object.values(meta.allFields)
    .filter((f) => f.kind === "primaryKey" || f.kind === "primitive" || f.kind === "enum")
    .map((f) => f.fieldName);

  // We can look directly at the `instance` to find all relations (`has...` calls), and any other
  // instance-level fields (of which only the special `transientFields` is expected/allowed).
  const [relationFields, otherFields] = partition(
    Object.entries(instance),
    ([, value]) => value instanceof RelationConstructor,
  );

  // Enforce transientFields usage
  const invalidFields = otherFields.filter(([fieldName]) => fieldName !== "transientFields");
  if (invalidFields.length > 0) {
    throw new Error(
      `${meta.type} has invalid class fields, ${invalidFields.map(([k]) => k).join(", ")} should go in transientFields`,
    );
  }

  const properties = [
    // Include the instance-level relations that will be getter-ized by `newEntity`
    ...relationFields,
    // And then any prototype-level getters/methods like `isRed` by recursively looking for ownKeys
    // (this is the previously-mentioned nod to entityResolver to let it copy over getters/methods).
    ...getRecursiveOwnNames(Object.getPrototypeOf(instance))
      .filter((key) => !knownPrimitives.includes(key))
      .map((key) => {
        try {
          return [key, (instance as any)[key] ?? unknown];
        } catch {
          return [key, unknown];
        }
      }),
  ];

  // Keep one version with the relations still lazy, solely for `newEntity`
  // (technically newEntity will only ask for this once-per-cstr, so a cache is kind of over-kill,
  // but creating it here, right before we `relationCstr.create`, is a convenient spot).
  relationConstructors[key] = [...relationFields, ...otherFields];

  // But expose to everyone else the concrete/constructed relations
  Object.assign(
    cached,
    Object.fromEntries(
      properties.map(([fieldName, value]) => [
        fieldName,
        value instanceof RelationConstructor ? value.create(instance, fieldName) : value,
      ]),
    ),
  );

  return cached;
}

/**
 * Returns the `RelationConstructor`s (...and transientField) for `meta`.
 *
 * Should only be used by `newEntity` while moving relations to the prototype.
 */
export function getRelationConstructors(meta: EntityMetadata): [string, RelationConstructor<any> | object][] {
  getProperties(meta); // We populate the relationConstructors during getProperties
  const key = meta.stiDiscriminatorValue ? `${meta.tableName}:${meta.stiDiscriminatorValue}` : meta.tableName;
  return relationConstructors[key];
}

export class UnknownProperty {}
const unknown = new UnknownProperty();

const propertiesCache: Record<string, any> = {};
const relationConstructors: Record<string, any> = {};

// These are keys we codegen into `AuthorCodegen` files to get the best typing
// experience, but really should be treated as BaseEntity keys that we don't
// need to expose from `getProperties`.
const ignoredKeys = new Set([
  "constructor",
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
    for (const name of Object.getOwnPropertyNames(curr)) {
      if (!ignoredKeys.has(name)) {
        keys.push(name);
      }
    }
  }
  return keys;
}
