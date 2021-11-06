import isPlainObject from "is-plain-object";
import {
  ActualFactoryOpts,
  Entity,
  EntityConstructor,
  EntityManager,
  EntityMetadata,
  getMetadata,
  IdOf,
  isEntity,
  New,
  OptsOf,
  PrimitiveField,
} from "./EntityManager";
import { isManyToOneField, isOneToOneField } from "./index";
import { tagIfNeeded } from "./keys";
import { fail } from "./utils";

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
  // We share a single `use` array for a given `newEntity` factory call; if the user
  // doesn't pass one in, just create a new one.
  const use = useMap(opts.use);

  // fullOpts will end up being a full/type-safe opts with every required field
  // filled in, either driven by the passed-in opts or by making new entities as-needed
  const fullOpts = Object.fromEntries(
    meta.fields
      .map((field) => {
        const { fieldName } = field;

        // Use the opts value if they passed one in
        if (fieldName in opts && (opts as any)[fieldName] !== defaultValueMarker) {
          const optValue = (opts as any)[fieldName];

          // Watch for our "the parent is not yet created" null marker.
          // Or just a factory having a `const { field } = opts`; that makes it undefined (...as long
          // as the field is not required, as we have a potentially odd test case for creating a required
          // parent if an opt key is undefined).
          if (optValue === null || (optValue === undefined && !field.required)) {
            return [];
          }

          // If this is a partial with defaults for the entity, call newTestInstance to get it created
          if (field.kind === "m2o" || field.kind === "o2o") {
            if (isEntity(optValue)) {
              return [fieldName, optValue];
            } else if (optValue && typeof optValue === "string") {
              return [
                fieldName,
                em.entities.find((e) => e.id === optValue || getTestId(em, e) === optValue) ||
                  fail(`Did not find tagged id ${optValue}`),
              ];
            } else if (optValue && !isPlainObject(optValue)) {
              // If optValue isn't a POJO, assume this is a completely-custom factory
              return [fieldName, field.otherMetadata().factory(em, optValue)];
            }
            // Find the opposite side, to see if it's a o2o or o2m pointing back at us
            const otherField = field.otherMetadata().fields.find((f) => f.fieldName === field.otherFieldName)!;
            return [
              fieldName,
              field.otherMetadata().factory(em, {
                // Because of the `!isPlainObject` above, optValue will either be undefined or an object here
                ...applyUse(optValue || {}, use, field.otherMetadata()),
                // We include `[]` as a marker for "don't create the children", i.e. if you're doing
                // `newLineItem(em, { parent: { ... } });` then any factory defaults inside the parent's
                // factory, i.e. `lineItems: [{}]`, should be skipped.
                [field.otherFieldName]: otherField.kind === "o2o" ? null : [],
              }),
            ];
          }

          // If this is a list of children, watch for partials that should be newTestInstance'd
          if (field.kind === "o2m" || field.kind == "m2m") {
            const values = (optValue as Array<any>).map((optValue) => {
              if (isEntity(optValue)) {
                return optValue;
              } else if (optValue && typeof optValue === "string") {
                return (
                  em.entities.find((e) => e.id === optValue || getTestId(em, e) === optValue) ||
                  fail(`Did not find tagged id ${optValue}`)
                );
              } else if (optValue && !isPlainObject(optValue)) {
                // If optValue isn't a POJO, assume this is a completely-custom factory
                return field.otherMetadata().factory(em, optValue);
              }
              return field.otherMetadata().factory(em, {
                // Because of the `!isPlainObject` above, optValue will either be undefined or an object here
                ...applyUse(optValue || {}, use, field.otherMetadata()),
                // We include null as a marker for "don't create the parent"; even if it's required,
                // once the child has been created, the act of adding it to our collection will get the
                // parent set. It might be better to do o2ms as a 2nd-pass, after we've done the em.create
                // call and could directly pass this entity instead of null.
                [field.otherFieldName]: null,
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

        if (
          field.kind === "primitive" &&
          (field.required || (opts as any)[fieldName] === defaultValueMarker) &&
          !field.derived &&
          !field.protected
        ) {
          return [fieldName, defaultValueForField(field)];
        } else if (field.kind === "m2o") {
          const otherMeta = field.otherMetadata();
          // If there is a single existing instance of this type, assume the caller is fine with that,
          // even if the field is not required.
          const existing = em.entities.filter((e) => e instanceof otherMeta.cstr);
          if (existing.length === 1) {
            return [fieldName, existing[0]];
          }
          // Otherwise only make a new entity only if the field is required
          if (field.required) {
            return [fieldName, otherMeta.factory(em, applyUse({}, use, otherMeta))];
          }
        } else if (field.kind === "enum" && field.required) {
          return [fieldName, field.enumDetailType.getValues()[0]];
        }
        return [];
      })
      .filter((t) => t.length > 0),
  );

  const entity = em.create(meta.cstr, fullOpts as any) as New<T>;

  // If the type we just made doesn't exist in `use` yet, remember it. This works better than
  // looking at the values in `fullOpts`, because instead of waiting until the end of the
  // `build fullOpts` loop, we're also invoking `newTestInstance` as we go through the loop itself,
  // creating each test instance within nested/recursive `newTestInstance` calls.
  if (!use.has(entity.constructor)) {
    use.set(entity.constructor, entity);
  }

  return entity;
}

/** Given we're going to call a factory, make sure any `use`s are put into `opts`. */
function applyUse(opts: object, use: UseMap, metadata: EntityMetadata<any>): object {
  // Look for any fields that have this entity's type
  metadata.fields
    .filter((f) => !(f.fieldName in opts))
    .forEach((f) => {
      if (isManyToOneField(f) || isOneToOneField(f)) {
        (opts as any)[f.fieldName] = use.get(f.otherMetadata().cstr);
      }
    });
  (opts as any).use = use;
  return opts;
}

/**
 * A marker value for later replacement with the test instance's "unique-ish" index.
 *
 * This is meant to just be a helpful identifier in fields like entity names/descriptions for
 * debugging purposes.
 */
export const testIndex = "TEST_INDEX";

const defaultValueMarker: any = {};

/**
 * A marker value for the default `newTestInstance` behavior.
 *
 * Useful for passing arguments to `newTestInstance` where you sometimes want to
 * provide a specific value, and other times ask for the "pick a default" behavior
 * (i.e. you don't want to pass `undefined` b/c that means explicitly "leave this
 * key unset").
 *
 * Note that this is a function so that we can infer the return type as basically
 * `any` without really using `any` (which would disable type-checking in the rest
 * of the expression).
 */
export function defaultValue<T>(): T {
  return defaultValueMarker;
}

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

/** Fakes a probably-right id for un-persisted entities. Solely used for quick lookups in tests/factories. */
function getTestId<T extends Entity>(em: EntityManager, entity: T): string {
  const meta = getMetadata(entity);
  const sameType = em.entities.filter((e) => e instanceof meta.cstr);
  return tagIfNeeded(meta, String(sameType.indexOf(entity) + 1));
}

function defaultValueForField(field: PrimitiveField): unknown {
  switch (field.type) {
    case "string":
      return field.fieldName;
    case "number":
      return 0;
    case "Date":
      return testDate;
    case "boolean":
      return false;
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
        ? Array<V | IdOf<V> | ActualFactoryOpts<V>>
        : T[P]
      : U extends Entity
      ? U | IdOf<U> | ActualFactoryOpts<U>
      : T[P]
    : T[P];
};

// Map of constructor --> default entity
type UseMap = Map<Function, Entity>;

// Do a one-time conversion of the user's `use` array into a map for internal use
function useMap(use: Entity | Entity[] | UseMap | undefined): UseMap {
  if (!use) {
    return new Map();
  } else if (use instanceof Map) {
    return use;
  } else if (use instanceof Array) {
    const map: UseMap = new Map();
    use.forEach((e) => map.set(e.constructor, e));
    return map;
  } else {
    const map: UseMap = new Map();
    map.set(use.constructor, use);
    return map;
  }
}
