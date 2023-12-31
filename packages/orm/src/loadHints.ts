import { Entity } from "./Entity";
import { OptsOf } from "./EntityManager";
import { NormalizeHint } from "./normalizeHints";
import {
  AsyncMethod,
  AsyncProperty,
  Collection,
  LoadedCollection,
  LoadedMethod,
  LoadedProperty,
  LoadedReference,
  OneToOneReference,
  Reference,
  Relation,
} from "./relations";
import { LoadedOneToOneReference } from "./relations/OneToOneReference";
import { MaybePromise, NullOrDefinedOr, fail } from "./utils";

const deepLoad = Symbol();
type DeepLoadHint<T extends Entity> = NestedLoadHint<T> & { [deepLoad]: true };

// Use any to correctly handle subtype/base type load hints.
//
// If a load hint is typed as `LoadHint<SmallPublisher, "authors">`, but the property
// is actually `Publisher.authors`, if we do `P extends LoadedCollection<SmallPublisher, ...>`
// the `SmallPublisher !== Publisher`, so the `authors` property doesn't match, and then
// we drop the rest of the nested load hint.
//
// But if we check `P extends LoadedCollection<any, ...>` it works.
type MaybeBaseType = any;

/** Marks a given `T[K]` field as the loaded/synchronous version of the collection. */
export type MarkLoaded<T extends Entity, P, UH = {}> = P extends OneToOneReference<MaybeBaseType, infer U>
  ? LoadedOneToOneReference<T, Loaded<U, UH>>
  : P extends Reference<MaybeBaseType, infer U, infer N>
    ? LoadedReference<T, Loaded<U, UH>, N>
    : P extends Collection<MaybeBaseType, infer U>
      ? LoadedCollection<T, Loaded<U, UH>>
      : P extends AsyncProperty<MaybeBaseType, infer V>
        ? // prettier-ignore
          [V] extends [(infer U extends Entity) | undefined]
    ? LoadedProperty<T, Loaded<U, UH> | Exclude<V, U>>
    : V extends readonly (infer U extends Entity)[]
    ? LoadedProperty<T, Loaded<U, UH>[]>
    : LoadedProperty<T, V>
        : P extends AsyncMethod<T, infer A, infer V>
          ? LoadedMethod<T, A, V>
          : unknown;

/** A version of MarkLoaded the uses `DeepLoadHint` for tests. */
type MarkDeepLoaded<T extends Entity, P> = P extends OneToOneReference<MaybeBaseType, infer U>
  ? LoadedOneToOneReference<T, Loaded<U, DeepLoadHint<U>>>
  : P extends Reference<MaybeBaseType, infer U, infer N>
    ? LoadedReference<T, Loaded<U, DeepLoadHint<U>>, N>
    : P extends Collection<MaybeBaseType, infer U>
      ? LoadedCollection<T, Loaded<U, DeepLoadHint<U>>>
      : P extends AsyncProperty<MaybeBaseType, infer V>
        ? // prettier-ignore
          [V] extends [(infer U extends Entity) | undefined]
    ? LoadedProperty<T, Loaded<U, DeepLoadHint<U>> | Exclude<V, U>>
    : V extends readonly (infer U extends Entity)[]
    ? LoadedProperty<T, Loaded<U, DeepLoadHint<U>>[]>
    : LoadedProperty<T, V>
        : P extends AsyncMethod<T, infer A, infer V>
          ? LoadedMethod<T, A, V>
          : unknown;

/**
 * A helper type for `New` that marks every `Reference` and `LoadedCollection` in `T` as loaded.
 *
 * We also look in opts `O` for the "`U`" type, i.e. the next level up/down in the graph,
 * because the call site's opts may be using an also-marked loaded parent/child as an opt,
 * so this will infer the type of that parent/child and use that for the `U` type.
 *
 * This means things like `entity.parent.get.grandParent.get` will work on the resulting
 * type.
 *
 * Note that this is also purposefully broken out of `New` because of some weirdness
 * around type narrowing that wasn't working when inlined into `New`.
 */
type MaybeUseOptsType<T extends Entity, O, K extends keyof T & keyof O> = O[K] extends NullOrDefinedOr<infer OK>
  ? OK extends Entity
    ? T[K] extends OneToOneReference<T, infer U>
      ? LoadedOneToOneReference<T, U>
      : T[K] extends Reference<T, infer U, infer N>
        ? LoadedReference<T, OK, N>
        : never
    : OK extends Array<infer OU>
      ? OU extends Entity
        ? T[K] extends Collection<T, infer U>
          ? LoadedCollection<T, OU>
          : never
        : T[K]
      : T[K]
  : never;

/**
 * Marks all references/collections of `T` as loaded, i.e. for newly instantiated entities where
 * we know there are no already-existing rows with fk's to this new entity in the database.
 *
 * `O` is the generic from the call site so that if the caller passes `{ author: SomeLoadedAuthor }`,
 * we'll prefer that type, as it might have more nested load hints that we can't otherwise assume.
 */
export type New<T extends Entity, O extends OptsOf<T> = OptsOf<T>> = T & {
  // K will be `keyof T` and `keyof O` for codegen'd relations, but custom relations
  // line `hasOneThrough` and `hasOneDerived` will not pass `keyof O` and so use the
  // `: MarkLoaded`.
  //
  // Note that the safest thing is to probably make this `: unknown` instead so that
  // custom relations are not marked loaded, b/c they will very likely require a `.load`
  // to work. However, we have some tests that currently expect `author.image.get` to work
  // on a new author, so keeping the `MarkLoaded` behavior for now.
  [K in keyof T]: K extends keyof O ? MaybeUseOptsType<T, O, K> : MarkLoaded<T, T[K]>;
};

/**
 * Marks all references/collections of `T` as deeply loaded, which is only useful for
 * tests where we can have "the whole object graph" in-memory.
 */
export type DeepNew<T extends Entity> = Loaded<T, DeepLoadHint<T>>;

/** Detects whether an entity is newly created, and so we can treat all the relations as loaded. */
export function isNew<T extends Entity>(e: T): e is New<T> {
  return e.isNewEntity;
}

/**
 * All the loadable fields, i.e. relations or lazy-loaded/async properties, in an entity.
 *
 * We use a mapped type (instead of a code-generated type) so that we can pick up custom
 * fields that have be added to the entity classes, i.e. `Author.numberOfBooks2` async
 * properties.
 */
export type Loadable<T extends Entity> = {
  -readonly [K in keyof T as LoadableValue<T[K]> extends never ? never : K]: LoadableValue<T[K]>;
};

/**
 * Given an entity field/value, return the loadable entity.
 *
 * I.e. `Author.books` as a Reference or Collection, return `Book`.
 *
 * Note that we usually return entities, but for AsyncProperties it could be
 * a calculated primitive value like number or string.
 */
export type LoadableValue<V> = V extends Reference<any, infer U, any>
  ? U
  : V extends Collection<any, infer U>
    ? U
    : V extends AsyncMethod<any, any, infer V>
      ? V
      : V extends AsyncProperty<any, infer P>
        ? // If the AsyncProperty returns `Comment | undefined`, then we want to return `Comment`
          // prettier-ignore
          P extends (infer U extends Entity) | undefined ? U : P
        : never;

/**
 *  A load hint of a single key, multiple keys, or nested keys and sub-hints.
 *
 * Load hints are different from reactive hints in that load hints include only references,
 * collections, and async properties to preload (like `Book.author` or `Author.books`), and
 * do not include any primitive fields (like `Author.firstName`).
 */
export type LoadHint<T extends Entity> =
  | (keyof Loadable<T> & string)
  | ReadonlyArray<keyof Loadable<T> & string>
  | NestedLoadHint<T>;

export type NestedLoadHint<T extends Entity> = {
  // Don't filter out entity-loadable keys, because we need to support `{ numberOfBooks2: {} }`
  [K in keyof Loadable<T>]?: Loadable<T>[K] extends infer U extends Entity ? LoadHint<U> : {};
};

/** Given an entity `T` that is being populated with hints `H`, marks the `H` attributes as populated. */
export type Loaded<T extends Entity, H> = T & {
  [K in keyof T & keyof NormalizeHint<T, H>]: H extends DeepLoadHint<T>
    ? MarkDeepLoaded<T, T[K]>
    : MarkLoaded<T, T[K], NormalizeHint<T, H>[K]>;
};

/** Recursively checks if the relations from a load hint are loaded on an entity. */
export function isLoaded<T extends Entity, H extends LoadHint<T>>(entity: T, hint: H): entity is Loaded<T, H> {
  if (typeof hint === "string") {
    return (entity as any)[hint].isLoaded;
  } else if (Array.isArray(hint)) {
    return (hint as string[]).every((key) => (entity as any)[key].isLoaded);
  } else if (typeof hint === "object") {
    return Object.entries(hint as object).every(([key, nestedHint]) => {
      const relation = (entity as any)[key];
      if (typeof relation.load !== "function") return true;
      if (relation.isLoaded) {
        const result = relation.get;
        return Array.isArray(result)
          ? result.every((entity) => isLoaded(entity, nestedHint))
          : result
            ? isLoaded(result, nestedHint)
            : true;
      } else {
        return false;
      }
    });
  } else {
    throw new Error(`Unexpected hint ${hint}`);
  }
}

export function maybePopulateThen<T extends Entity, H extends LoadHint<T>, R>(
  entity: T,
  hint: H,
  fn: (loaded: Loaded<T, H>) => R,
): MaybePromise<R> {
  return isLoaded(entity, hint) ? fn(entity) : (entity as any).populate(hint).then(fn);
}

export function assertLoaded<T extends Entity, H extends LoadHint<T>, L extends Loaded<T, H>>(
  entity: T,
  hint: H,
): asserts entity is L {
  if (!isLoaded(entity, hint)) fail(`${entity.id} is not loaded for ${JSON.stringify(hint)}`);
}

export function ensureLoaded<T extends Entity, H extends LoadHint<T>, L extends Loaded<T, H>>(entity: T, hint: H): L {
  assertLoaded<T, H, L>(entity, hint);
  return entity;
}

/** From any `Relations` field in `T`, i.e. for loader hints. */
export type RelationsIn<T extends Entity> = SubType<T, Relation<any, any>>;

/** From any `Relations` field in `T`, i.e. for loader hints. */
export type AsyncMethodsIn<T extends Entity> = SubType<T, AsyncMethod<any, any, any>>;

// https://medium.com/dailyjs/typescript-create-a-condition-based-subset-types-9d902cea5b8c
type SubType<T, C> = Pick<T, { [K in keyof T]: T[K] extends C ? K : never }[keyof T]>;
