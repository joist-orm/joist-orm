import isPlainObject from "is-plain-object";
import {
  ActualFactoryOpts,
  Entity,
  EntityConstructor,
  EntityManager,
  getMetadata,
  isEntity,
  New,
  OptsOf,
  PrimitiveField,
} from "./EntityManager";

/**
 * DeepPartial-esque type specific to our `newTestInstance` factory.
 *
 * Specifically (vs using DeepPartial directly) this:
 *
 * 1. Adds a `use` tag of `Entity | Entity[]` that will be checked for existing
 * entities before creating new ones (i.e. "if `newTestInstance` needs a `Book`,
 * use the one in `use` instead of making a new one).
 *
 * 2. Works specifically against the constructor/entity opts fields.
 */
export type FactoryOpts<T extends Entity> = DeepPartialOpts<T> & { use?: Entity | Entity[] };

// Chosen b/c it's a monday https://www.timeanddate.com/calendar/monthly.html?year=2018&month=1&country=1
export const jan1 = new Date(2018, 0, 1);
export let testDate = jan1;

/** Creates a test instance of `T`. */
export function newTestInstance<T extends Entity>(
  em: EntityManager,
  cstr: EntityConstructor<T>,
  opts: FactoryOpts<T> = {},
): New<T> {
  const meta = getMetadata(cstr);

  // fullOpts will end up being a full/type-safe opts with every required field
  // filled in, either driven by the passed-in opts or by making new entities as-needed
  const fullOpts = Object.fromEntries(
    meta.fields
      .map((field) => {
        const { fieldName } = field;

        // Use the opts value if they passed one in
        if (fieldName in opts) {
          const optValue = (opts as any)[fieldName];

          // Watch for our "the parent is not yet created" null marker
          if (optValue === null) {
            return [];
          }

          // If this is a partial with defaults for the entity, call newTestInstance to get it created
          if (field.kind === "m2o") {
            if (isEntity(optValue)) {
              return [fieldName, optValue];
            } else if (optValue && !isPlainObject(optValue)) {
              return field.otherMetadata().factory(em, opts);
            }
            return [fieldName, field.otherMetadata().factory(em, { ...optValue, use: opts.use })];
          }

          // If this is a list of children, watch for partials that should be newTestInstance'd
          if (field.kind === "o2m" || field.kind == "m2m") {
            const values = (optValue as Array<any>).map((optValue) => {
              if (isEntity(optValue)) {
                return optValue;
              } else if (optValue && !isPlainObject(optValue)) {
                return field.otherMetadata().factory(em, optValue);
              }
              return field.otherMetadata().factory(em, {
                ...optValue,
                // We include null as a marker for "don't create the parent"; even if it's required,
                // once the child has been created, the act of adding it to our collection will get the
                // parent set. It might be better to do o2ms as a 2nd-pass, after we've done the em.create
                // call and could directly pass this entity instead of null.
                [field.otherFieldName]: null,
                use: opts.use,
              });
            });
            return [fieldName, values];
          }

          // Look for strings that want to use the test index
          if (typeof optValue === "string" && optValue.includes(testIndex)) {
            const actualIndex = getTestIndex(em, meta.cstr);
            return [fieldName, optValue.replace(testIndex, String(actualIndex))];
          }

          // Otherwise just use the user's opt value as-is
          return [fieldName, optValue];
        }

        if (field.kind === "primitive" && !field.derived && !field.protected) {
          return [fieldName, defaultValue(field)];
        } else if (field.kind === "m2o") {
          const otherMeta = field.otherMetadata();

          // If there is a single existing instance of this type, assume the caller is fine with that,
          // even if the field is not required.
          const existing = em.entities.filter((e) => e instanceof otherMeta.cstr);
          if (existing.length === 1) {
            return [fieldName, existing[0]];
          }

          // If there is a use type, assume the caller is fine with that, even if the field is not required
          const useEntity = maybeArray(opts.use)?.find((e) => e instanceof otherMeta.cstr);
          if (useEntity) {
            return [fieldName, useEntity];
          }

          // Otherwise only make a new entity only if the field is required
          if (field.required) {
            return [fieldName, otherMeta.factory(em, { use: opts.use })];
          }
        } else if (field.kind === "enum" && field.required) {
          return [fieldName, field.enumDetailType.getValues()[0]];
        }
        return [];
      })
      .filter((t) => t.length > 0),
  );
  return (em.create(meta.cstr, fullOpts as any) as any) as New<T>;
}

/**
 * A marker value for later replacement with the test instance's "unique-ish" index.
 *
 * This is meant to just be a helpful identifier in fields like entity names/descriptions for
 * debugging purposes.
 */
export const testIndex = "TEST_INDEX";

/**
 * Returns a unique-ish test index for putting in `name` fields.
 *
 * Note that `testIndex` is easier to just include in a string, because it doesn't require passing
 * the `EntityManger` and `type`. But if a factory really wants the test index as a number, they can
 * call this method.
 *
 * Despite the name, these are 1-based, i.e. the first `Author` is `a1`.
 */
export function getTestIndex<T extends Entity>(em: EntityManager, type: EntityConstructor<T>): number {
  const existing = em.entities.filter((e) => e instanceof type);
  return existing.length + 1;
}

function defaultValue(field: PrimitiveField): unknown {
  switch (field.type) {
    case "string":
      return field.fieldName;
    case "number":
      return 0;
    case "Date":
      return testDate;
  }
  return null;
}

// Utility type to destructure T out of T | undefined
type DefinedOr<T> = T | undefined;

type DeepPartialOpts<T extends Entity> = AllowRelationsOrPartials<OptsOf<T>>;

type AllowRelationsOrPartials<T> = {
  [P in keyof T]?: T[P] extends DefinedOr<infer U>
    ? U extends Array<infer V>
      ? V extends Entity
        ? Array<V | ActualFactoryOpts<V>>
        : T[P]
      : U extends Entity
      ? U | ActualFactoryOpts<U>
      : T[P]
    : T[P];
};

function maybeArray<T>(array: T | T[] | undefined): T[] | undefined {
  return array ? (Array.isArray(array) ? array : [array]) : undefined;
}
