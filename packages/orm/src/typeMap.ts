import { Entity } from "./Entity";
import { EntityManager } from "./EntityManager";

/**
 * Provides a container for entities to attach their application-specific types.
 *
 * Downstream applications inject their types into this map, so we can look them up
 * via types like `OptsOf<Author>` or `FilterOf<Author>`, by including a `declare module`
 * snippet in each entity's `...Codegen` file.
 *
 * ```ts
 * declare module "joist-orm" {
 *   interface TypeMap {
 *     Author: { optsType: AuthorOpts; fieldsType: AuthorFields; filterType: AuthorFilter };
 *   }
 * }
 * ```
 *
 * Inspired by Tanstack Router, which uses a similar `declare module` approach.
 */
export interface TypeMap {}

/**
 * Returns a key like `"Author"` or `"SmallPublisher"` for looking up types in the `TypeMap`.
 *
 * This is currently hard-coded to look for two levels of inheritance: we probe for the subtype
 * key (1) first, and then fallback on the base type key (0) that all entities will have.
 */
type TypeMapKey<T> = T extends { __type: { 1: infer K } } ? K : T extends { __type: { 0: infer K } } ? K : never;

/** A helper type to look up `U` in the `TypeMap` for a given entity type `T`. */
export type TypeMapEntry<T, U extends string> =
  TypeMapKey<T> extends infer K ? (K extends keyof TypeMap ? TypeMap[K][U] : unknown) : unknown;

/** Return the `FooOpts` type for the given `Foo` entity. */
export type OptsOf<T> = TypeMapEntry<T, "optsType">;

/** Return the `FooFields` type for the given `Foo` entity. */
export type FieldsOf<T> = TypeMapEntry<T, "fieldsType">;

export type OptIdsOf<T> = TypeMapEntry<T, "optIdsType">;

/** Pulls the entity query type out of a given entity type T. */
export type FilterOf<T> = TypeMapEntry<T, "filterType">;

/** Pulls the entity GraphQL query type out of a given entity type T. */
export type GraphQLFilterOf<T> = TypeMapEntry<T, "gqlFilterType">;

/** Pulls the entity order type out of a given entity type T. */
export type OrderOf<T> = TypeMapEntry<T, "orderType">;

/**
 * Returns the opts of the entity's `newEntity` factory method, as exists in the actual file.
 *
 * This is because `FactoryOpts` is a set of defaults, but the user can customize it if they want.
 */
export type ActualFactoryOpts<T> = TypeMapEntry<T, "factoryOptsType">;

/** Return the `Foo` type for a given `Foo` entity constructor. */
export type EntityOf<C> = C extends new (em: EntityManager, opts: any) => infer T ? T : never;

type RelationsKeysOf<T> = {
  [K in keyof OptsOf<T>]: OptsOf<T>[K] extends Entity[] | undefined ? K : never;
}[keyof OptsOf<T>];

/** Return the Relation keys from `FooOpt` type, given a `Foo` entity */
export type RelationsOf<T extends Entity> = {
  [K in RelationsKeysOf<T>]: NonNullable<OptsOf<T>[K]>;
};
