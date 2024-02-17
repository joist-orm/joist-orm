import { getOrmField } from "./BaseEntity";
import { Entity } from "./Entity";
import { EntityMetadata, Field } from "./EntityMetadata";
import { asConcreteCstr } from "./index";

/**
 * Returns the fields, relations, and properties in `meta`, both those defined in the codegen file + any
 * user-defined `CustomReference`s, `hasAsyncProperty`s, etc.
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
  const key = meta.tableName;
  if (propertiesCache[key]) {
    return propertiesCache[key];
  }

  const instance = getFakeInstance(meta);

  // Fields won't have a wrapper relation, but we include them as a FieldProperty. We didn't previously
  // consider "fields" to be "properties", but if we don't include all fields, then a subset of them
  // can accidentally leak in, i.e. if the user defines getters/setters for a field, it will get caught
  // in our property detection, so we might as well handle it correctly.
  const fieldProperties = Object.fromEntries(
    Object.values(meta.allFields)
      .filter((f) => f.kind === "primaryKey" || f.kind === "primitive" || f.kind === "enum")
      .map((f) => [f.fieldName, new FieldProperty(f)]),
  );

  propertiesCache[key] = Object.fromEntries(
    [
      ...Object.values(meta.allFields).map((f) => f.fieldName),
      // Look for lazy relation getters on the prototype
      ...Object.getOwnPropertyNames(meta.cstr.prototype),
      // Look for user-defined relations on the instance
      ...Object.keys(instance),
    ]
      .filter((key) => key !== "constructor" && !key.startsWith("__"))
      .map((key) => {
        // Return the value of `instance[key]` but wrap it in a try/catch in case it's
        // a getter that runs code that fails b/c of the dummy state we're in.
        try {
          return [key, fieldProperties[key] ?? (instance as any)[key] ?? unknown];
        } catch (e) {
          return [key, unknown];
        }
      })
      // Purposefully return methods, primitives, etc. so that `entityResolver` can add them to the resolver
      .filter(([key]) => key !== "fullNonReactiveAccess" && key !== "transientFields"),
  );
  return propertiesCache[key];
}

export class UnknownProperty {}
const unknown = new UnknownProperty();

export class FieldProperty {
  constructor(public field: Field) {}
}

const propertiesCache: Record<string, any> = {};
const fakeInstances: Record<string, Entity> = {};

/**
 * Returns a fake instance of `meta` so that user-defined `CustomReference` and `AsyncProperty`s can
 * be inspected on boot.
 */
export function getFakeInstance(meta: EntityMetadata): Entity {
  // asConcreteCstr is safe b/c we're just doing property scanning and not real instantiation
  return (fakeInstances[meta.cstr.name] ??= new (asConcreteCstr(meta.cstr))(
    {
      __api: {},
      register: (entity: any) => {
        const orm = getOrmField(entity);
        (orm as any).metadata = meta;
        orm.data = {};
      },
      // Tell our "cannot instantiate an abstract class" constructor logic check to chill
      fakeInstance: true,
    } as any,
    {},
  ));
}
