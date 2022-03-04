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
  isId,
  ManyToManyField,
  ManyToOneField,
  OneToManyField,
  OneToOneField,
  OptsOf,
  PrimitiveField,
} from "./EntityManager";
import { isManyToOneField, isOneToOneField, New } from "./index";
import { tagId } from "./keys";
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
  // We share a single `use` map for a given `newEntity` factory call
  const use = useMap(opts);

  // fullOpts will end up being a full/type-safe opts with every required field
  // filled in, either driven by the passed-in opts or by making new entities as-needed
  const fullOpts = Object.fromEntries(
    Object.values(meta.fields)
      .map((field) => {
        const { fieldName } = field;

        // Use the opts value if they passed one in
        if (fieldName in opts && (opts as any)[fieldName] !== defaultValueMarker) {
          const optValue = (opts as any)[fieldName];

          // Watch for our "the parent is not yet created" null marker.
          //
          // Or allow a user/factory to explicit request an optional field not be set with
          // a use / if-only-one default, i.e. by passing `newAuthor({ publisher: undefined })`.
          //
          // Note that a factory doing `const { publisher } = opts;` and then passing `publisher`
          // back in can unwittingly look like `newAuthor({ publisher: undefined })`, so we use
          // the same heuristic of "well, a required field can't _actually_ be unset" to guess
          // that the user is using this pattern, and we set the field anyway. If a factory really
          // does want to leave a required field unset, they can pass the null marker, although
          // that would require an `as undefined` at the moment.
          //
          // TODO: Remove the `!field.required` and just fix our internal tests to behave better.
          // Probably requires https://github.com/stephenh/joist-ts/issues/268 first b/c we have
          // tests that are unwittingly sending in `undefined` but still getting back entities.
          if (optValue === null || (optValue === undefined && !field.required)) {
            return [];
          }

          // If this is a partial with defaults for the entity, call newTestInstance to get it created
          if (field.kind === "m2o" || field.kind === "o2o") {
            const other = resolveFactoryOpt(em, opts, field, optValue);
            return [fieldName, other];
          }

          // If this is a list of children, watch for partials that should be newTestInstance'd
          if (field.kind === "o2m" || field.kind == "m2m") {
            const values = (optValue as Array<any>).map((opt) => resolveFactoryOpt(em, opts, field, opt));
            return [fieldName, values];
          }

          // If a child is passing themselves into a parent that is a large collection, just ignore it
          if (field.kind === "lo2m") {
            return [];
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
          // If neither the user nor the factory (i.e. for an explicit "fan out" case) set this field,
          // then look in `use` and for an "obvious" there-is-only-one default (even for optional fields)
          const existing = getObviousDefault(em, field.otherMetadata(), opts);
          if (existing) {
            return [fieldName, existing];
          }
          // Otherwise, only make a new entity only if the field is required
          if (field.required) {
            return [fieldName, resolveFactoryOpt(em, opts, field, undefined)];
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
    use.set(entity.constructor, [entity, false]);
  }

  return entity;
}

/**
 * Resolves a `FactoryEntityOpt` (i.e. maybe an existing entity, maybe an id, maybe a hash of opts) to an entity.
 *
 * If `opt` is `undefined`, then the usual factory semantics of "check use", "look for only one instance" are
 * checked before finally creating a brand new entity.
 *
 * We also accept an optional `otherFieldName` so that, if we do create a new entity, we pass along the null
 * marker for them to know not to create their own version of us.
 *
 * (This was originally intended to be a public API, but the use case ended up being handled
 * by the more-ergonomic `maybeNew` feature; we could explore making this public if another
 * similar use case comes up in the future.)
 */
function resolveFactoryOpt<T extends Entity>(
  em: EntityManager,
  opts: FactoryOpts<any>,
  field: OneToManyField | ManyToOneField | OneToOneField | ManyToManyField,
  opt: FactoryEntityOpt<T> | undefined,
): T {
  const meta = field.otherMetadata();
  if (isEntity(opt)) {
    return opt;
  } else if (isId(opt)) {
    return (
      (em.entities.find((e) => e.id === opt || getTestId(em, e) === opt) as T) || fail(`Did not find tagged id ${opt}`)
    );
  } else if (opt && !isPlainObject(opt) && !(opt instanceof MaybeNew)) {
    // If opt isn't a POJO, assume this is a completely-custom factory
    return meta.factory(em, opt);
  } else {
    // Look for an obvious default
    if (opt === undefined || opt instanceof MaybeNew) {
      const existing = getObviousDefault(em, meta, opts);
      if (existing) {
        return existing;
      }
      // Otherwise fall though to making a new entity via the factory
    }
    // Find the opposite side, to see if it's an o2o or o2m pointing back at us
    const otherField = field.otherMetadata().fields[field.otherFieldName];
    return meta.factory(em, {
      // Because of the `!isPlainObject` above, opt will either be undefined or an object here
      ...applyUse((opt as any) || {}, useMap(opts), meta),
      ...(opt instanceof MaybeNew && opt.opts),
      // We include `[]` as a marker for "don't create the children", i.e. if you're doing
      // `newLineItem(em, { parent: { ... } });` then any factory defaults inside the parent's
      // factory, i.e. `lineItems: [{}]`, should be skipped.
      [otherField.fieldName]: otherField.kind === "o2o" || otherField.kind === "m2o" ? null : [],
    });
  }
}

/** We look for `use`-cached and "if-only-one" defaults. */
function getObviousDefault<T extends Entity>(
  em: EntityManager,
  metadata: EntityMetadata<T>,
  opts: FactoryOpts<any>,
): T | undefined {
  // If neither the user nor the factory (i.e. for an explicit "fan out" case) set this field then look in use
  const use = useMap(opts);
  // ...we used to check "explicit use" vs. "implicit use" here and only use implicit values
  // if the field was required; but in theory our "use if-only-one" heuristic was already looser
  // that this, so it seems fine to just always check use, regardless of field required/optional.
  //
  // Note that we still use explicit/implicit use to know whether the user's `newAuthor` factory
  // should have a use param passed to it, or if we should apply it here after-the-fact. (This gives
  // `newAuthor` the opportunity to apply defaults.)
  if (use.has(metadata.cstr)) {
    return use.get(metadata.cstr)![0] as T;
  }
  // If there is a single existing instance of this type, assume the caller is fine with that
  const existing = em.entities.filter((e) => e instanceof metadata.cstr);
  if (existing.length === 1) {
    return existing[0] as T;
  }
  return undefined;
}

// When a factory is called, i.e. `newAuthor`, opts will:
//
// - Have values explicitly passed by the user/other factories
// - Have values from the user's explicit `use` parameter
// - NOT have guessed (i.e. "only existing entity") or an implicitly-created `use` parameter
//
// This allows the factory to "fan out" by default, i.e. newInternalUser creating its own User
// and Market creating its own ProductAttribute, which originally we couldn't do when
// guessed/implicit opts were passed directly to `newAuthor`.
//
// Now, if the `newAuthor` factory doesn't explicitly "fan out" (by passing `user: {}` to
// `newTestInstance`), we still "fan in" by having `newTestInstance` sneak in the guessed/implicit
// opts of only-one-existing or factory-created instances.

/** Given we're going to call a factory, make sure any `use`s are put into `opts`. */
function applyUse(opts: object, use: UseMap, metadata: EntityMetadata<any>): object {
  // Find any unset fields
  Object.values(metadata.fields)
    .filter((f) => !(f.fieldName in opts))
    .forEach((f) => {
      // And set them to the current `use` entity for their type, if it exists
      if ((isManyToOneField(f) || isOneToOneField(f)) && use.has(f.otherMetadata().cstr)) {
        const def = use.get(f.otherMetadata().cstr)!;
        // Only pass explicit/user-defined `use` entities, so that factories can "fan out" if they want,
        // and not see other factory-created entities look like user-specific values.
        if (def[1]) {
          (opts as any)[f.fieldName] = def[0];
        }
      }
    });
  // Make a copy so we don't leak `use` onto opts that tests might later use in assertions.
  return { ...opts, use };
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
 * Allows a factory to provide a default, i.e. for a field that would otherwise
 * be optional, but still have that field be override by opts & use, without
 * accidentally creating an extra entity as a side-effect.
 *
 * I.e.:
 *
 * ```typescript
 * export function newAuthor(em: Entity, opts: FactoryOpts<Author>) {
 *   return newTestInstance(em, Author, {
 *     // publisher is not technically required, but make one
 *     publisher: maybeNew<Publisher>({}),
 *     ...opts,
 *   });
 * }
 * ```
 */
export function maybeNew<T extends Entity>(opts: FactoryOpts<T> = {}): FactoryEntityOpt<T> {
  // Return a marker that resolveFactoryOpt will look for
  return new MaybeNew(opts) as any;
}

class MaybeNew<T extends Entity> {
  constructor(public opts: FactoryOpts<T>) {}
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
  return tagId(meta, String(sameType.indexOf(entity) + 1));
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
type DefinedOr<T> = T | undefined | null;

type DeepPartialOpts<T extends Entity> = AllowRelationsOrPartials<OptsOf<T>>;

/** What a factory can accept for a given entity. */
export type FactoryEntityOpt<T extends Entity> = T | IdOf<T> | ActualFactoryOpts<T>;

type AllowRelationsOrPartials<T> = {
  [P in keyof T]?: T[P] extends DefinedOr<infer U>
    ? U extends Array<infer V>
      ? V extends Entity
        ? Array<FactoryEntityOpt<V>>
        : T[P]
      : U extends Entity
      ? FactoryEntityOpt<U>
      : T[P]
    : T[P];
};

// Map of constructor --> [default entity, explicitly passed/created internally]
type UseMap = Map<Function, [Entity, boolean]>;

// Do a one-time conversion of the user's `use` array into a map for internal use
function useMap(opts: FactoryOpts<any>): UseMap {
  const use: Entity | Entity[] | UseMap | undefined = opts.use;
  let map: UseMap;
  if (use instanceof Map) {
    // it's already a map
    map = use;
  } else {
    map = new Map();
    if (use instanceof Array) {
      // it's a top-level `newAuthor` with a user-passed `use: array`
      use.forEach((e) => map.set(e.constructor, [e, true]));
    } else if (use) {
      // it's a top-level `newAuthor` w/o a `use: entity` param
      map.set(use.constructor, [use, true]);
    }
    // Scan opts for entities to implicitly add to the map, i.e. if the user
    // calls `newAuthor(em, { book: b1 })`, we'll use `b1` for any other books we
    // might happen to create.
    const todo = [opts];
    while (todo.length > 0) {
      const opts = todo.pop();
      Object.values(opts || {}).forEach((opt) => {
        if (isEntity(opt) && !map.has(opt.constructor)) {
          map.set(opt.constructor, [opt, false]);
        } else if (opt instanceof Array) {
          todo.push(...opt);
        } else if (isPlainObject(opt)) {
          todo.push(opt);
        }
      });
    }
  }
  // Store our potentially-massaged map back into opts i.e. in case resolveFactoryOpt needs it.
  // Use as any b/c UseMap is our internal impl detail and not public.
  (opts as any).use = map;
  return map;
}
