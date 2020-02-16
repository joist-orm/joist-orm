import { Entity } from "./EntityManager";

export * from "./EntityManager";
export { OneToManyCollection } from "./collections/OneToManyCollection";
export { ManyToOneReference } from "./collections/ManyToOneReference";
export { ManyToManyCollection } from "./collections/ManyToManyCollection";

const F = Symbol();
const G = Symbol();
const H = Symbol();

/** A relationship from `T` to `U`, could be any of many-to-one, one-to-many, or many-to-many. */
export interface Relation<T extends Entity, U extends Entity> {
  // Make our Relation somewhat non-structural, otherwise since it's a marker interface,
  // types like `number` or `string` will match it. This also seems to nudge the type
  // inference inside of `LoadHint` to go beyond "this generic T of Entity has id and __orm"
  // to "no really this generic T has fields firstName, title, etc.".
  // See https://stackoverflow.com/questions/53448100/generic-type-of-extended-interface-not-inferred
  [F]?: T;
  [G]?: U;
}

/**
 * A many-to-one / foreign key from `T` to `U`, i.e. book to author.
 *
 * The `N` generic is for whether the field is optional (i.e. the foreign key column is
 * nullable). If it is optional, `N` will be `undefined`, which makes the return types
 * `U | undefined`. If it is not optional, `N` will be `never`, making the return types
 * `U | never` which becomes just `U`.
 */
export interface Reference<T extends Entity, U extends Entity, N extends never | undefined> extends Relation<T, U> {
  load(): Promise<U | N>;

  set(other: U | N): void;

  [H]?: N;
}

/** Adds a known-safe `get` accessor. */
export interface LoadedReference<T extends Entity, U extends Entity, N extends never | undefined>
  extends Reference<T, U, N> {
  get: U | N;
}

/** A collection of `U` within `T`, either one-to-many or many-to-many. */
export interface Collection<T extends Entity, U extends Entity> extends Relation<T, U> {
  load(): Promise<ReadonlyArray<U>>;

  add(other: U): void;

  remove(other: U): void;
}

/** Adds a known-safe `get` accessor. */
export interface LoadedCollection<T extends Entity, U extends Entity> extends Collection<T, U> {
  get: ReadonlyArray<U>;
}
