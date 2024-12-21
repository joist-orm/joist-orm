import { isPlainObject } from "joist-utils";
import { Entity, isEntity } from "./Entity";
import { EntityConstructor, EntityManager, IdOf, isId, MaybeAbstractEntityConstructor } from "./EntityManager";
import {
  EntityMetadata,
  getBaseAndSelfMetas,
  getBaseSelfAndSubMetas,
  getMetadata,
  isManyToOneField,
  isOneToOneField,
  ManyToManyField,
  ManyToOneField,
  OneToManyField,
  OneToOneField,
  PolymorphicField,
  PrimitiveField,
} from "./EntityMetadata";
import { hasDefaultValue, setAsyncDefaultsSynchronously } from "./defaults";
import { DeepNew, New } from "./index";
import { tagId } from "./keys";
import { FactoryLogger } from "./logging/FactoryLogger";
import { maybeRequireTemporal } from "./temporal";
import { ActualFactoryOpts, OptsOf } from "./typeMap";
import { assertNever } from "./utils";

let logger: FactoryLogger | undefined = undefined;

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
export type FactoryOpts<T extends Entity> = DeepPartialOpts<T> & {
  use?: Entity | Entity[];
  useFactoryDefaults?: boolean | "none";
  useExistingCheck?: boolean;
  useLogging?: boolean;
};

// Chosen b/c it's a monday https://www.timeanddate.com/calendar/monthly.html?year=2018&month=1&country=1
const jan1 = new Date(2018, 0, 1);
export const testDate = jan1;
const Temporal = maybeRequireTemporal()?.Temporal;
export const testPlainDate = Temporal?.PlainDate.from("2018-01-01");
export const testPlainDateTime = testPlainDate?.toPlainDateTime("00:00:00");
export const testZonedDateTime = testPlainDate?.toZonedDateTime("UTC");

const knownUseKeys = ["use", "useLogging", "useExistingCheck", "useFactoryDefaults"];

/**
 * Creates a test instance of `T`.
 *
 * If the factory code passes factoryOpts.useExisting, they can "intercept" the `em.create`
 * to try and resolve "already created" / singleton instances. The `useExisting` callback is
 * useful b/c the `opts` will be the "resolved-to-entity" opts, and not the raw "maybe object
 * literal, maybe object instance" opts that tests pass into the factory.
 */
export function newTestInstance<T extends Entity>(
  em: EntityManager,
  cstr: EntityConstructor<T>,
  /** The test's test-specific override opts. */
  testOpts: FactoryOpts<T> = {},
  /** The factory file's default opts. */
  factoryOpts: FactoryOpts<T> & {
    useExisting?: (opts: OptsOf<T>, existing: DeepNew<T>) => boolean;
  } = {},
): DeepNew<T> {
  // The first factory that is asked to debug, without one in place, will create+unset the logger.
  let ownsTheLogger = !logger && testOpts.useLogging;
  if (ownsTheLogger) logger = new FactoryLogger();

  logger?.logCreating(cstr);
  logger?.indent();

  const meta = getMetadata(cstr);
  const opts = mergeOpts(meta, testOpts, factoryOpts);
  const use = getOrCreateUseMap(opts);

  const selfFields: string[] = [];

  // Create just the primitive and m2o fields 1st, so we can create a minimal/valid
  // instance of the entity. We'll do the o2m/other fields as a second pass.
  const initialOpts = Object.values(meta.allFields)
    .map((field) => {
      const { fieldName } = field;

      // Don't fill in required fields if told not to
      const ignoreAllDefaults = "useFactoryDefaults" in opts && opts.useFactoryDefaults === "none";
      // If the field has a default value, don't force fill it, even if passed `author: undefined`
      const required = field.required && !ignoreAllDefaults && !hasDefaultValue(meta, fieldName);

      // Use the opts value if they passed one in
      if (fieldName in opts && (opts as any)[fieldName] !== defaultValueMarker) {
        const optValue = (opts as any)[fieldName];
        // We don't explicitly support null (callers should pass undefined), but we accept it
        // because the factory might have done `const { author, ... } = opts` and is accidentally
        // passing an `author: undefined` without meaning too.
        const shouldRespectUndefined = !required;
        if (optValue === null || (optValue === undefined && shouldRespectUndefined)) {
          return [];
        }
        switch (field.kind) {
          case "m2o":
          case "poly":
            return [fieldName, resolveFactoryOpt(em, opts, field, optValue, undefined)];
          case "o2o":
          case "o2m":
          case "m2m":
            // We do these in the 2nd pass after `entity` exists (see additionalOpts)
            return [];
          case "lo2m":
            // If a child is passing themselves into a parent that is a large collection, just ignore it
            return [];
          case "primitive":
          case "enum":
          case "primaryKey":
            // Look for strings that want to use the test index
            if (typeof optValue === "string" && optValue.includes(testIndexString)) {
              const actualIndex = getTestIndex(em, meta.cstr);
              const value = optValue.replace(testIndexString, String(actualIndex));
              return [fieldName, value];
            } else if (typeof optValue === "number" && optValue === testIndex) {
              const actualIndex = getTestIndex(em, meta.cstr);
              return [fieldName, actualIndex];
            }
            // Otherwise just use the user's opt value as-is
            return [fieldName, optValue];
          default:
            return assertNever(field);
        }
      }

      if (
        field.kind === "primitive" &&
        (required || (opts as any)[fieldName] === defaultValueMarker) &&
        !field.derived &&
        !field.protected
      ) {
        return [fieldName, defaultValueForField(em, cstr, field)];
      } else if (field.kind === "m2o" && !field.derived) {
        // If neither the user nor the factory (i.e. for an explicit "fan out" case) set this field,
        // then look in `use` and for an "obvious" there-is-only-one default (even for optional fields)
        const [existing, loggerKey] = getObviousDefault(em, field.otherMetadata(), use);
        // If this is a m2o pointing to an o2o, i.e. that as a unique constraint, make sure the
        // existing entity we found isn't already claimed
        const isUniqueAndAlreadyUsed =
          existing &&
          isOneToOneField(field.otherMetadata().allFields[field.otherFieldName]) &&
          (existing as any)[field.otherFieldName].isLoaded &&
          (existing as any)[field.otherFieldName].isSet;
        if (existing && !isUniqueAndAlreadyUsed && !ignoreAllDefaults) {
          logger?.[loggerKey](fieldName, existing);
          return [fieldName, existing];
        }
        // Otherwise, only make a new entity only if the field is required
        if (required) {
          // ...unless this is a self-referential key, in which case avoid infinite looping.
          if (field.otherMetadata() === meta) {
            selfFields.push(fieldName);
            return [];
          } else {
            return [fieldName, resolveFactoryOpt(em, opts, field, undefined, undefined)];
          }
        }
      } else if (field.kind === "enum" && required && !field.derived) {
        return [fieldName, field.enumDetailType.getValues()[0]];
      } else if (field.kind === "poly" && required) {
        return [fieldName, resolveFactoryOpt(em, opts, field, undefined, undefined)];
      }
      return [];
    })
    .filter((t) => t.length > 0);

  const createOpts = Object.fromEntries(initialOpts);

  if (factoryOpts.useExisting && testOpts.useExistingCheck !== false) {
    const existing = em.entities
      .filter((e) => e instanceof meta.cstr)
      .find((e) => factoryOpts.useExisting!(createOpts as OptsOf<T>, e as DeepNew<T>));
    if (existing) {
      logger?.logFoundExisting(existing);
      logger?.dedent();
      if (ownsTheLogger) logger = undefined;
      return existing as DeepNew<T>;
    }
  }

  const entity = em.create(cstr, createOpts) as New<T>;

  // If the type we just made doesn't exist in `use` yet, remember it. This works better than
  // looking at the values in `fullOpts`, because instead of waiting until the end of the
  // `build fullOpts` loop, we're also invoking `newTestInstance` as we go through the loop itself,
  // creating each test instance within nested/recursive `newTestInstance` calls.
  if (!use.has(entity.constructor) || use.get(entity.constructor)![1] === "diffBranch") {
    addToUseMap(use, entity, "sameBranch");
  } else {
    // The `addToUseMap` does its own 'created & added to scope'
    logger?.logCreated(entity);
  }

  // Now that we've got the entity, do a 2nd pass for o2m/m2m where we pass
  // `{ parent: entity }` down to children (i.e. to replace our original
  // null marker approach).
  const additionalOpts = Object.entries(opts).map(([fieldName, optValue]) => {
    const field = meta.allFields[fieldName];
    // Look for `use` / etc
    if (knownUseKeys.includes(fieldName)) return [];
    if (!field) {
      throw new Error(`Unknown field ${fieldName}`);
    }
    if (optValue === null || optValue === undefined) return [];
    if (field.kind === "o2m") {
      // If this is a list of children, i.e. book.authors, handle partials to newTestInstance'd
      return [
        fieldName,
        (optValue as Array<any>).map((opt) => {
          // console.log(`${field.fieldName}`, i);
          return resolveFactoryOpt(em, withBranchMap(opts), field, opt, entity);
        }),
      ];
    } else if (field.kind == "m2m") {
      return [
        fieldName,
        (optValue as Array<any>).map((opt) => resolveFactoryOpt(em, withBranchMap(opts), field, opt, [entity] as any)),
      ];
    } else if (field.kind === "o2o") {
      const otherField = field.otherMetadata().allFields[field.otherFieldName];
      const isReactiveReference = "derived" in otherField && otherField.derived === "async";
      if (isReactiveReference) return [];
      // If this is an o2o, i.e. author.image, just pass the optValue (i.e. it won't be a list)
      return [fieldName, resolveFactoryOpt(em, opts, field, optValue as any, entity)];
    } else {
      return []; // Assume createOpts handled this
    }
  });

  for (const fieldName of selfFields) {
    additionalOpts.push([fieldName, entity]);
  }

  entity.set(Object.fromEntries(additionalOpts.filter((t) => t.length > 0)));

  // em.create applied synchronous defaults automatically; since we're a factory with likely
  // deeply-loaded instances, go ahead and synchronously invoke the async defaults, at least
  // the ones that just use load hints + a synchronous lambda.
  // (...would be nice to log these in the setFactoryLogging output)
  setAsyncDefaultsSynchronously(em.ctx, entity);

  // Set it back to undefined
  logger?.dedent();
  if (ownsTheLogger) logger = undefined;

  return entity as DeepNew<T>;
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
  field: OneToManyField | ManyToOneField | OneToOneField | ManyToManyField | PolymorphicField,
  opt: FactoryEntityOpt<any> | undefined,
  maybeEntity: T | undefined,
): T | IdOf<T> {
  const use = getOrCreateUseMap(opts);
  const { meta, otherFieldName } = metaFromFieldAndOpt(field, opt);
  // const meta = field.kind === "poly" ? field.components[0].otherMetadata() : field.otherMetadata();
  // const otherFieldName = field.kind === "poly" ? field.components[0].otherFieldName : field.otherFieldName;
  if (isEntity(opt)) {
    logger?.logFoundOpt(field.fieldName, opt);
    return opt as T;
  } else if (isId(opt)) {
    // Try finding the entity in the UoW, otherwise fallback on just setting it as the id (which we support that now)
    const found = (em.entities.find((e) => e.idTaggedMaybe === opt || getTestId(em, e) === opt) as T) || opt;
    logger?.logFoundOpt(field.fieldName, found);
    return found;
  } else if (opt && !isPlainObject(opt) && !(opt instanceof MaybeNew)) {
    // If opt isn't a POJO, assume this is a completely-custom factory
    logger?.logNotFoundAndCreating(field.fieldName, meta);
    return meta.factory(em, opt);
  } else {
    // Look for an obvious default
    if (opt === undefined || opt instanceof MaybeNew) {
      if (field.kind !== "poly") {
        const [existing, loggerKey] = getObviousDefault(em, meta, use);
        if (existing) {
          logger?.[loggerKey](field.fieldName, existing);
          return existing as T;
        }
        // Otherwise fall though to making a new entity via the factory
      } else {
        // We have a polymorphic maybeNew to sort through
        const [existing, loggerKey] = (opt instanceof MaybeNew
          ? opt.polyRefPreferredOrder
          : field.components.map((c) => c.otherMetadata().cstr)
        )
          .map((cstr) => getObviousDefault(em, getMetadata(cstr), use))
          .find((existing) => !!existing[0]) || [undefined, undefined];
        if (existing) {
          logger?.[loggerKey](field.fieldName, existing);
          return existing as T;
        }
      }
    }
    // If this is image.author (m2o) but the other-side is an o2o, pass null instead of []
    maybeEntity ??= (meta.allFields[otherFieldName].kind === "o2o" ? null : []) as any;
    logger?.logNotFoundAndCreating(field.fieldName, meta);
    return meta.factory(em, {
      // Because of the `!isPlainObject` above, opt will either be undefined or an object here
      ...applyUse((opt as any) || {}, use, meta),
      ...(opt instanceof MaybeNew && opt.opts),
      [otherFieldName]: maybeEntity,
    });
  }
}

/** Determines the metadata and otherFieldName to use in resolveFactoryOpt to account for polymorphic fields */
function metaFromFieldAndOpt<T extends Entity>(
  field: OneToManyField | ManyToOneField | OneToOneField | ManyToManyField | PolymorphicField,
  opt: FactoryEntityOpt<T> | undefined,
): { meta: EntityMetadata; otherFieldName: string } {
  if (field.kind !== "poly") {
    // If it isn't a poly field, then the field itself can tell us everything we need to know
    return { meta: field.otherMetadata(), otherFieldName: field.otherFieldName };
  }
  const componentToUse =
    // Otherwise, we check if the `opt` specifies a particular component to use, and if not fall back to the first one
    field.components.find(
      (component) =>
        opt instanceof MaybeNew &&
        getBaseSelfAndSubMetas(component.otherMetadata())
          .map((m) => m.cstr)
          .includes(opt.polyRefPreferredOrder[0]),
    ) ?? field.components[0];
  return { meta: componentToUse.otherMetadata(), otherFieldName: componentToUse.otherFieldName };
}

/** We look for `use`-cached entities, which are either those we created, or had "if-only-one" defaults. */
function getObviousDefault<T extends Entity>(
  em: EntityManager,
  metadata: EntityMetadata,
  use: UseMap,
): [T, "logFoundInUseMap" | "logFoundSingleEntity"] | [undefined, undefined] {
  if (use.has(metadata.cstr)) {
    return [use.get(metadata.cstr)![0] as T, "logFoundInUseMap"];
  }
  // If there is a single existing instance of this type, assume the caller is fine with that.
  // ...in theory seeding our `use` map with the only-one entities was supposed to prevent the
  // need for doing this (the entities would already be in the use map that we just checked),
  // but that approach doesn't catch created-as-side-effect entities.
  const existing = em.entities.filter((e) => e instanceof metadata.cstr);
  if (existing.length === 1) {
    return [existing[0] as T, "logFoundSingleEntity"];
  }
  return [undefined, undefined];
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
function applyUse(optsMaybeNew: object, use: UseMap, metadata: EntityMetadata): object {
  const opts = optsMaybeNew instanceof MaybeNew ? optsMaybeNew.opts : optsMaybeNew;
  // Find any unset fields
  Object.values(metadata.fields)
    .filter((f) => !(f.fieldName in opts))
    .forEach((f) => {
      // And set them to the current `use` entity for their type, if it exists
      if ((isManyToOneField(f) || isOneToOneField(f)) && use.has(f.otherMetadata().cstr)) {
        const def = use.get(f.otherMetadata().cstr)!;
        // Only pass explicit/user-defined `use` entities, so that factories can "fan out" if they want,
        // and not see other factory-created entities look like user-specific values.
        if (def[1] === "useOpt") {
          (opts as any)[f.fieldName] = def[0];
        }
      }
    });
  // Make a copy so that we don't leak `use` onto opts that tests might later use in assertions.
  return { ...opts, use };
}

/**
 * A marker value for later replacement with the test instance's "unique-ish" index.
 *
 * This is meant to just be a helpful identifier in fields like entity names/descriptions for
 * debugging purposes.
 */
export const testIndex: number = -1_111_111_222;

const testIndexString = String(testIndex);

const defaultValueMarker: any = {};
const branchValueSym = Symbol("branchValue");

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
 * A marker value to never set a field, even if it's required.
 *
 * The factories treat `{ author: undefined }` as "still set the author", because of how easy
 * it is for destructuring/restructuring opts to implicitly set `undefined` values.
 *
 * If you want to force a field to not be set, you can use `{ author: noValue() }`.
 */
export function noValue<T>(): T {
  return null as T;
}

/**
 * A marker value to accept values only if explicitly created-or-passed within the current,
 * unique "branch" of a factory call.
 *
 * This is useful for "diamond-shape" entity models like:
 *
 * ```
 *  ParentGroup <-- ParentItem
 *      |              |
 *   ChildGroup  <-- ChildItem
 * ```
 *
 * Where it's important that the `ChildItem -> ParentItem -> ParentGroup` path matches
 * the `ChildItem -> ChildGroup -> ParentGroup` path.
 *
 * This can be hard to achieve in normal factory behavior, i.e. for a call like:
 *
 * ```ts
 * const c = newChild(em, {
 *   groups: [
 *     { childItems: [{}, {}] },
 *     { childItems: [{}, {}] },
 *   ],
 * });
 * ```
 *
 * The first `ChildGroup` will create a new `ParentGroup` that is used by everything, which
 * is not our intent, as both `ChildGroup`s, and all four `ParentItem`s, will live in a single
 * `ParentGroup`.
 *
 * An initial idea is to pass `parentGroup: {}` in the factories, because that turns off "reusing
 * existing instances", but for this problem the `{}` approach is "too good" at creating new
 * instances, b/c the above diamond pattern will be disconnected.
 *
 * So `branchValue` provides a middle ground, where _usually_ it will be a new entity, unless
 * it was explicitly created within the same "branch" of a factory call.
 */
export function maybeBranchValue<T>(opts?: ActualFactoryOpts<T>): T {
  // opts get mutated, so we have to return a new value
  return { [branchValueSym]: true, ...(opts ? opts : undefined) } as any;
}

/**
 * Allows a factory to declare that an optional relation should be filled in with an
 * "obvious default", or a new entity if one doesn't exist.
 *
 * This "obvious default or new entity" is what Joist already does for _required_ relations,
 * and so `maybeNew` lets the factory tell Joist to apply the same behavior to an optional
 * field.
 *
 * I.e.:
 *
 * ```typescript
 * export function newAuthor(em: Entity, opts: FactoryOpts<Author>) {
 *   return newTestInstance(em, Author, {
 *     // this always make a new publisher, unless explicitly overridden by the test,
 *     // i.e. when each author really needs "their own" publisher.
 *     publisher: {},
 *     // this will make a new publisher but first looks for "good defaults" in the
 *     // test, i.e. an already-created publisher. This is the default behavior of
 *     // required fields ("look for a good default"), and `maybeNew` lets you tell
 *     // Joist to invoke that same "maybe new" behavior for an optional field.
 *     publisher: maybeNew<Publisher>({}),
 *     ...opts,
 *   });
 * }
 * ```
 */
export function maybeNew<T extends Entity>(opts?: ActualFactoryOpts<T>): FactoryEntityOpt<T> {
  // Return a marker that resolveFactoryOpt will look for
  return new MaybeNew<T>((opts || {}) as any) as any;
}

/**
 * Similar to `maybeNew` in behaviour/use but with enhancements to support polymorphic fields:
 * 1) Allows you to specify which entity type to create, if it is found a new one is needed
 * 2) Allows you to prioritize which existing entities to select
 *
 * For example below, we are specifying that an Author should be created if needed (and optionally it's default opts
 * in the `ifNewOpts` field), and also that the priority order for choosing existing entities is Author, Book, and then Publisher.
 * Note since BookReview is excluded from `existingSearchOrder`, an existing BookReview will never be chosen.
 *
 * ```typescript
 * export function newComment(em: EntityManager, opts: FactoryOpts<Comment> = {}): New<Comment> {
 *   return newTestInstance(em, Comment, {
 *     parent: maybeNewPoly<CommentParent, Author>(
 *       Author, {
 *         ifNewOpts: { firstName: "optional"},
 *         existingSearchOrder: [Author, Book, Publisher]
 *       }),
 *     ...opts,
 *   });
 * }
 * ```
 */
export function maybeNewPoly<T extends Entity, NewT extends T = T>(
  ifNewCstr: EntityConstructor<NewT>,
  opts?: {
    ifNewOpts?: ActualFactoryOpts<NewT>;
    existingSearchOrder?: MaybeAbstractEntityConstructor<T>[];
  },
): FactoryEntityOpt<NewT> {
  // Return a marker that resolveFactoryOpt will look for
  return new MaybeNew<T>((opts?.ifNewOpts || {}) as any, opts?.existingSearchOrder ?? [ifNewCstr]) as any;
}

class MaybeNew<T extends Entity> {
  constructor(
    public opts: FactoryOpts<T>,
    public polyRefPreferredOrder: MaybeAbstractEntityConstructor<T>[] = [],
  ) {}
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
export function getTestIndex<T extends Entity>(em: EntityManager, type: MaybeAbstractEntityConstructor<T>): number {
  const existing = em.entities.filter((e) => e instanceof type);
  return existing.length + 1;
}

/** Fakes a probably-right id for un-persisted entities. Solely used for quick lookups in tests/factories. */
function getTestId<T extends Entity>(em: EntityManager, entity: T): string {
  const meta = getMetadata(entity);
  const sameType = em.entities.filter((e) => e instanceof meta.cstr);
  return tagId(meta, String(sameType.indexOf(entity) + 1));
}

// We keep a local copy of `global.Date`, in case a faking library
// like @sinonjs/fake-timers is used and rewrites `global.Date` to
// their own `ClockDate`, which would make our `===` check below fail.
const globalDate = global.Date;

function defaultValueForField(em: EntityManager, cstr: EntityConstructor<any>, field: PrimitiveField): unknown {
  if (field.type === "string") {
    if (field.fieldName === "name") {
      return `${cstr.name} ${getTestIndex(em, cstr)}`;
    }
    return field.fieldName;
  } else if (field.type === "number") {
    return 0;
  } else if (field.type === "bigint") {
    return 0n;
  } else if (field.type === globalDate) {
    return testDate;
  } else if (field.type === "boolean") {
    return false;
  } else if (Temporal) {
    if (field.type === Temporal.PlainDate) {
      return testPlainDate;
    } else if (field.type === Temporal.PlainDateTime) {
      return testPlainDateTime;
    } else if (field.type === Temporal.ZonedDateTime) {
      return testZonedDateTime;
    }
  }

  return null;
}

// Utility type to destructure T out of T | undefined
type DefinedOr<T> = T | undefined | null;

type DeepPartialOpts<T extends Entity> = AllowRelationsOrPartials<OptsOf<T>>;

/** What a factory can accept for a given entity. */
export type FactoryEntityOpt<T extends Entity> =
  | T
  // The ability to use an id, like `newAuthor(em, { publisher: "p:1" })` is not necessarily
  // on purpose, but the AuthorOpts already have `publisher: Publisher | PublisherId` in them,
  // so `newTestInstance` has to handle this typing anyway, unless we explicitly go out of our
  // way to remove the `PublisherId` from the Opts type.
  | IdOf<T>
  | (ActualFactoryOpts<T> & { useFactoryDefaults?: boolean | "none" });

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

// Map of constructor --> [
//   default entity,
//     | "testOpts" === explicitly passed into the top-level `newFactory` that creates the UseMap
//     | "useOpt" === explicitly passed in as a `use` flag
//     | "diffBranch" == created internally within the current factory call, but a different branch of children
//     | "sameBranch" === created internally within the current factory call, in the current branch of entities
// ]
export type UseMapSource = "testOpts" | "useOpt" | "sameBranch" | "diffBranch";
type UseMapValue = [Entity, UseMapSource];
type UseMap = Map<Function, UseMapValue>;

// Do a one-time conversion of the user's `use` array into a map for internal use, which we'll
// then re-use across all `newTestInstance` calls within a given `new<Entity>` call.
function getOrCreateUseMap(opts: FactoryOpts<any>): UseMap {
  const use: Entity | Entity[] | UseMap | undefined = opts.use;
  let map: UseMap;

  if (use instanceof Map) {
    // it's already a map
    map = use;
  } else {
    map = new Map();
    if (use instanceof Array) {
      // it's a top-level `newAuthor` with a user-passed `use: array`
      use.forEach((e) => addToUseMap(map, e, "useOpt"));
    } else if (use) {
      // it's a top-level `newAuthor` w/o a `use: entity` param
      addToUseMap(map, use, "useOpt");
    }
    // Scan opts for entities to add to the map, i.e. if the user calls `newAuthor(em, { book: b1 })`,
    // we'll use `b1` for any other books we might happen to create.
    const todo = [opts];
    while (todo.length > 0) {
      const opts = todo.pop();
      for (const opt of Object.values(opts || {})) {
        if (isEntity(opt) && !map.has(opt.constructor)) {
          addToUseMap(map, opt, "testOpts");
        } else if (opt instanceof Array) {
          // Push the array as-is, because it will be `Object.value`-d on the next iteration
          todo.push(opt);
        } else if (isPlainObject(opt)) {
          todo.push(opt);
        }
      }
    }
  }
  // Store our potentially-massaged map back into opts i.e. in case resolveFactoryOpt needs it.
  // Use as any b/c UseMap is our internal impl detail and not public.
  (opts as any).use = map;
  return map;
}

// If e is a subtype like SmallPublisher, register it for the base Publisher as well
function addToUseMap(map: UseMap, e: Entity, source: UseMapSource) {
  logger?.logAddToUseMap(e, source);
  const meta = getMetadata(e);
  if (meta.baseType || meta.subTypes.length) {
    getBaseAndSelfMetas(meta).forEach((m) => {
      // console.log(`Putting ${e.toString()} into ${objectId(map)} as ${source}`);
      map.set(m.cstr, [e, source]);
    });
  } else {
    // console.log(`Putting ${e.toString()} into ${objectId(map)} as ${source}`);
    map.set(meta.cstr, [e, source]);
  }
}

/** Merge the factory's opts and the test's opts so that `{ age: 40 }` and `{ firstName: "b1" }` get merged. */
function mergeOpts(meta: EntityMetadata, testOpts: Record<string, any>, factoryOpts: Record<string, any>): object {
  // Merge the factory's opts and the test's opts so that `{ age: 40 }` and `{ firstName: "b1" }` get merged
  if (testOpts.useFactoryDefaults === false || testOpts.useFactoryDefaults === "none") {
    return testOpts;
  }

  const opts: any = { ...testOpts };
  Object.entries(factoryOpts).forEach(([key, factoryValue]) => {
    // Skip special opts
    if (key === "useExisting") return;
    const testValue = testOpts[key];
    if (testOpts[key] === undefined) {
      // If the test doesn't define an opt, we have nothing to merge...unless
      // they literally passed `foo: undefined`, in which case they win.
      if (!(key in testOpts)) {
        opts[key] = factoryValue;
      }
    } else if (isPlainObject(factoryValue) && isPlainObject(testValue)) {
      // Should this deep merge? Probably?
      opts[key] = mergeOpts(meta, testValue, factoryValue);
    } else if (factoryValue instanceof MaybeNew && isPlainObject(testValue)) {
      opts[key] = mergeOpts(meta, testValue, factoryValue.opts);
    } else if (factoryValue instanceof MaybeNew && testValue instanceof MaybeNew) {
      opts[key] = new MaybeNew<any>(
        mergeOpts(meta, testValue.opts, factoryValue.opts),
        testValue.polyRefPreferredOrder ?? factoryValue.polyRefPreferredOrder,
      );
    }
    // This seemed like a good idea
    if (opts[key]?.[branchValueSym]) {
      const field = meta.allFields[key];
      if (field.kind === "m2o") {
        const use = testOpts.use as UseMap;
        const inTree = use?.get(field.otherMetadata().cstr);
        if (inTree && (inTree[1] === "sameBranch" || inTree[1] === "testOpts")) {
          // console.log(`Putting ${field.fieldName} to`, inTree[0]);
          opts[key] = inTree[0];
        }
      } else {
        throw new Error(`branchValue is not implemented for ${field.kind}`);
      }
      delete opts[key]?.[branchValueSym];
    }
  });
  return opts;
}

// As we branch out to children, going down the tree, give each branch its own playground of entities
function withBranchMap(opts: object): object {
  const oldMap = (opts as any).use;
  const newMap = new CopyMap(oldMap);
  return { ...opts, use: newMap };
}

/** Writes new entities into our branch's map (this map), as well as the root we came from. */
class CopyMap extends Map<Function, UseMapValue> {
  constructor(private readonly root: UseMap) {
    super(root);
  }
  set(k: Function, v: UseMapValue): this {
    // Purposefully downgrade this to source=diffBranch so that it will not be used by `branchValue()`
    // calls that override `{}`, but can still be used to in-fan, i.e. if making multiple books by
    // default they get the same author.
    // ...also use `root?` because the `super(root)` will call `set` while copying the other map
    // but our `this.root` has not been set yet; which is fine, we want to ignore those anyway.
    this.root?.set(k, [v[0], "diffBranch"]);
    return super.set(k, v);
  }
}

// const objectId = (() => {
//   let currentId = 0;
//   const map = new WeakMap();
//   return (object: object): number => {
//     if (!map.has(object)) {
//       map.set(object, ++currentId);
//     }
//     return map.get(object)!;
//   };
// })();
/** Enables factory logging for all factories. */
export function setFactoryLogging(enabled: boolean): void {
  logger = enabled ? new FactoryLogger() : undefined;
}
