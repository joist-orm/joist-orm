import { Entity } from "./Entity";
import { EntityManager } from "./EntityManager";

/**
 * Provides a container for entities to attach their application-specific types.
 */
export interface TypeMap {}

/** Return the `FooOpts` type a given `Foo` entity constructor. */
export type OptsOf<T> = TypeMapEntry<T, "optsType">;

/** Returns a key like `"Author"` or `"SmallPublisher"` for looking up types in the `TypeMap`. */
type TypeMapKey<T> = T extends { __typeMapKeys: { 1: infer K } }
  ? K
  : T extends { __typeMapKeys: { 0: infer K } }
    ? K
    : never;

export type TypeMapEntry<T, U extends string> =
  TypeMapKey<T> extends infer K ? (K extends keyof TypeMap ? TypeMap[K][U] : unknown) : unknown;

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
