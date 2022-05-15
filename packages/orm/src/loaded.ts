import { Entity, OptsOf } from "./EntityManager";
import {
  AsyncProperty,
  Collection,
  LoadedCollection,
  LoadedProperty,
  LoadedReference,
  OneToOneReference,
  Reference,
  Relation,
} from "./relations";
import { LoadedOneToOneReference } from "./relations/OneToOneReference";
import { NullOrDefinedOr } from "./utils";

const deepLoad = Symbol();
type DeepLoadHint<T extends Entity> = NestedLoadHint<T> & { [deepLoad]: true };

/** Marks a given `T[P]` field as the loaded/synchronous version of the collection. */
type MarkLoaded<T extends Entity, P, H = {}> = P extends OneToOneReference<T, infer U>
  ? LoadedOneToOneReference<T, Loaded<U, H>>
  : P extends Reference<T, infer U, infer N>
  ? LoadedReference<T, Loaded<U, H>, N>
  : P extends Collection<T, infer U>
  ? LoadedCollection<T, Loaded<U, H>>
  : P extends AsyncProperty<T, infer V>
  ? LoadedProperty<T, V>
  : unknown;

/** A version of MarkLoaded the uses `DeepLoadHint` for tests. */
type MarkDeepLoaded<T extends Entity, P> = P extends OneToOneReference<T, infer U>
  ? LoadedOneToOneReference<T, Loaded<U, DeepLoadHint<U>>>
  : P extends Reference<T, infer U, infer N>
  ? LoadedReference<T, Loaded<U, DeepLoadHint<U>>, N>
  : P extends Collection<T, infer U>
  ? LoadedCollection<T, Loaded<U, DeepLoadHint<U>>>
  : P extends AsyncProperty<T, infer V>
  ? LoadedProperty<T, V>
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

/** Detects whether an entity is newly created, and so we can treat all of the relations as loaded. */
export function isNew<T extends Entity>(e: T): e is New<T> {
  return e.idTagged === undefined;
}

/** Given an entity `T` that is being populated with hints `H`, marks the `H` attributes as populated. */
export type Loaded<T extends Entity, H extends LoadHint<T>> = T & {
  [K in keyof T]: H extends DeepLoadHint<T>
    ? MarkDeepLoaded<T, T[K]>
    : H extends NestedLoadHint<T>
    ? LoadedIfInNestedHint<T, K, H>
    : H extends ReadonlyArray<infer U>
    ? LoadedIfInKeyHint<T, K, U>
    : LoadedIfInKeyHint<T, K, H>;
};

// We can use unknown here because everything non-loaded is pulled in from `T &`
type LoadedIfInNestedHint<T extends Entity, K extends keyof T, H> = K extends keyof H
  ? MarkLoaded<T, T[K], H[K]>
  : unknown;

type LoadedIfInKeyHint<T extends Entity, K extends keyof T, H> = K extends H ? MarkLoaded<T, T[K]> : unknown;

/** From any `Relations` field in `T`, i.e. for loader hints. */
export type RelationsIn<T extends Entity> = SubType<T, Relation<any, any>>;

export type Loadable<T extends Entity> = SubType<T, AsyncProperty<any, any> | Relation<any, any>>;

// https://medium.com/dailyjs/typescript-create-a-condition-based-subset-types-9d902cea5b8c
type SubType<T, C> = Pick<T, { [K in keyof T]: T[K] extends C ? K : never }[keyof T]>;

// We accept load hints as a string, or a string[], or a hash of { key: nested };
export type LoadHint<T extends Entity> =
  | keyof Loadable<T>
  | ReadonlyArray<keyof Loadable<T>>
  // If `T` has no loadable keys, this will be `{}`, and because `"foo" extends {}`, this
  // essentially breaks type-checking of string-based load hints. However, if we try to
  // check `if NestedLoadHint === {} ? never`, then passing in `{}` as a terminal load
  // hint breaks.
  | NestedLoadHint<T>;

export type NestedLoadHint<T extends Entity> = {
  [K in keyof Loadable<T>]?: T[K] extends Relation<any, infer U>
    ? LoadHint<U>
    : T[K] extends AsyncProperty<any, any>
    ? {}
    : never;
};

/** recursively checks if the relations from a load hint are loaded on an entity */
export function isLoaded<T extends Entity, H extends LoadHint<T>>(entity: T, hint: H): entity is Loaded<T, H> {
  if (typeof hint === "string") {
    return (entity as any)[hint].isLoaded;
  } else if (Array.isArray(hint)) {
    return (hint as string[]).every((key) => (entity as any)[key].isLoaded);
  } else if (typeof hint === "object") {
    return Object.entries(hint as object).every(([key, nestedHint]) => {
      const relation = (entity as any)[key];
      if (relation.isLoaded) {
        const result = relation.get;
        return Array.isArray(result)
          ? result.every((entity) => isLoaded(entity, nestedHint))
          : isLoaded(result, nestedHint);
      } else {
        return false;
      }
    });
  } else {
    throw new Error(`Unexpected hint ${hint}`);
  }
}

export function ensureLoaded<T extends Entity, H extends LoadHint<T>, R>(entity: T, hint: H): Promise<Loaded<T, H>> {
  return isLoaded(entity, hint) ? entity : (entity as any).populate(hint);
}

export function ensureLoadedThen<T extends Entity, H extends LoadHint<T>, R>(
  entity: T,
  hint: H,
  fn: (loaded: Loaded<T, H>) => R,
): R | Promise<R> {
  return isLoaded(entity, hint) ? fn(entity) : (entity as any).populate(hint).then(fn);
}
