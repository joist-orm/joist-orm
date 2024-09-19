import DataLoader, { BatchLoadFn, Options } from "dataloader";
import { Knex } from "knex";
import { getInstanceData } from "./BaseEntity";
import { setAsyncDefaults } from "./defaults";
import { getField, setField } from "./fields";
// We alias `Entity => EntityW` to denote "Entity wide" i.e. the non-narrowed Entity
import { Entity, Entity as EntityW, IdType, isEntity } from "./Entity";
import { FlushLock } from "./FlushLock";
import { JoinRows } from "./JoinRows";
import { ReactionsManager } from "./ReactionsManager";
import { JoinRowTodo, Todo, combineJoinRows, createTodos } from "./Todo";
import { ReactiveRule, constraintNameToValidationError } from "./config";
import { createOrUpdatePartial } from "./createOrUpdatePartial";
import { findByUniqueDataLoader } from "./dataloaders/findByUniqueDataLoader";
import { findCountDataLoader } from "./dataloaders/findCountDataLoader";
import { findDataLoader } from "./dataloaders/findDataLoader";
import { entityMatches, findOrCreateDataLoader } from "./dataloaders/findOrCreateDataLoader";
import { loadDataLoader } from "./dataloaders/loadDataLoader";
import { populateDataLoader } from "./dataloaders/populateDataLoader";
import { Driver } from "./drivers/Driver";
import {
  BaseEntity,
  Changes,
  CustomCollection,
  CustomReference,
  DeepPartialOrNull,
  EntityHook,
  EntityMetadata,
  EnumField,
  ExpressionFilter,
  FieldLogger,
  FilterWithAlias,
  GraphQLFilterWithAlias,
  InstanceData,
  Lens,
  ManyToManyCollection,
  OneToManyCollection,
  PartialOrNull,
  PolymorphicReferenceImpl,
  ReactionLogger,
  TimestampSerde,
  UniqueFilter,
  ValidationError,
  ValidationErrors,
  ValidationRule,
  ValidationRuleResult,
  asConcreteCstr,
  assertIdIsTagged,
  getBaseAndSelfMetas,
  getBaseMeta,
  getBaseSelfAndSubMetas,
  getConstructorFromTaggedId,
  getMetadata,
  getRelationEntries,
  getRelations,
  keyToTaggedId,
  loadLens,
  parseFindQuery,
  setOpts,
  tagId,
  toTaggedId,
} from "./index";
import { LoadHint, Loaded, NestedLoadHint, New, RelationsIn } from "./loadHints";
import { PreloadPlugin } from "./plugins/PreloadPlugin";
import { followReverseHint } from "./reactiveHints";
import { ManyToOneReferenceImpl, OneToOneReferenceImpl, ReactiveReferenceImpl } from "./relations";
import { AbstractRelationImpl } from "./relations/AbstractRelationImpl";
import { AsyncMethodPopulateSecret } from "./relations/hasAsyncMethod";
import { MaybePromise, assertNever, fail, getOrSet, partition, toArray } from "./utils";

// polyfill
(Symbol as any).asyncDispose ??= Symbol("Symbol.asyncDispose");

/**
 * The constructor for concrete entity types.
 *
 * Abstract entity types, like a base `Publisher` class that is marked `abstract`, cannot
 * implement this and instead only have the `AbsEntityConstructor` type.
 */
export interface EntityConstructor<T> {
  new (em: EntityManager<any, any>, opts: any): T;

  // Use any for now to pass the `.includes` test in `EntityConstructor.test.ts`. We could
  // probably do some sort of `tagOf(T)` look up, similar to filter types, which would return
  // either the string literal for a real `T`, or `any` if using `EntityConstructor<any>`.
  tagName: any;
  metadata: EntityMetadata;
  /** Returns the private `InstanceData` for the given entity. */
  // This isn't really necessary but prevents type errors with unions like `Author | Book`
  getInstanceData(entity: Entity): InstanceData;
}

/** Options for the auto-batchable `em.find` queries, i.e. limit & offset aren't allowed. */
export interface FindFilterOptions<T extends Entity> {
  conditions?: ExpressionFilter;
  orderBy?: OrderOf<T> | OrderOf<T>[];
  softDeletes?: "include" | "exclude";
}

/**
 * Options for the non-batchable `em.findPaginated` queries, i.e. limit & offset are allowed.
 *
 * We allow `offset` to be optional, b/c sometimes queries will just want to do a `limit`, but we
 * require `limit` to ensure the caller is using `findPaginated` for its intended purpose.
 */
export interface FindPaginatedFilterOptions<T extends Entity> extends FindFilterOptions<T> {
  limit: number | undefined;
  offset?: number;
}

export interface FindGqlPaginatedFilterOptions<T extends Entity> extends FindFilterOptions<T> {
  limit?: number | null;
  offset?: number | null;
}

/** Options for the `findCount`. */
export interface FindCountFilterOptions<T extends Entity> {
  conditions?: ExpressionFilter;
  softDeletes?: "include" | "exclude";
}

/**
 * Constructors for either concrete or abstract entity types.
 *
 * I.e. this is more like "MaybeAbstractEntityConstructor".
 */
export type MaybeAbstractEntityConstructor<T> = abstract new (em: EntityManager<any, any>, opts: any) => T;

/** Return the `FooOpts` type a given `Foo` entity constructor. */
export type OptsOf<T> = T extends { __orm: { optsType: infer O } } ? O : never;

export type FieldsOf<T> = T extends { __orm: { fieldsType: infer F } } ? F : never;

export type OptIdsOf<T> = T extends { __orm: { optIdsType: infer O } } ? O : never;

/** Return the `Foo` type for a given `Foo` entity constructor. */
export type EntityOf<C> = C extends new (em: EntityManager, opts: any) => infer T ? T : never;

/** Pulls the entity query type out of a given entity type T. */
export type FilterOf<T> = T extends { __orm: { filterType: infer Q } } ? Q : never;

/** Pulls the entity GraphQL query type out of a given entity type T. */
export type GraphQLFilterOf<T> = T extends { __orm: { gqlFilterType: infer Q } } ? Q : never;

/** Pulls the entity order type out of a given entity type T. */
export type OrderOf<T> = T extends { __orm: { orderType: infer Q } } ? Q : never;

type RelationsKeysOf<T> = {
  [K in keyof OptsOf<T>]: OptsOf<T>[K] extends Entity[] | undefined ? K : never;
}[keyof OptsOf<T>];

/** Return the Relation keys from `FooOpt` type, given a `Foo` entity */
export type RelationsOf<T extends Entity> = {
  [K in RelationsKeysOf<T>]: NonNullable<OptsOf<T>[K]>;
};

/**
 * Returns the opts of the entity's `newEntity` factory method, as exists in the actual file.
 *
 * This is because `FactoryOpts` is a set of defaults, but the user can customize it if they want.
 */
export type ActualFactoryOpts<T> = T extends { __orm: { factoryOptsType: infer Q } } ? Q : never;

/** Pulls the entity's id type out of a given entity type T. */
export type IdOf<T> = T extends { id: infer I } ? I : never;

export type TaggedId = string;

export function isId(value: any): value is IdOf<unknown> {
  return value && typeof value === "string";
}

export type EntityManagerHook = "beforeTransaction" | "afterTransaction";

type HookFn = (em: EntityManager, knex: Knex.Transaction) => MaybePromise<any>;

export type LoaderCache = Record<string, DataLoader<any, any>>;

export interface TimestampFields {
  updatedAt: string | undefined;
  createdAt: string | undefined;
  deletedAt: string | undefined;
}

export interface EntityManagerOpts {
  driver: Driver;
  preloadPlugin?: PreloadPlugin;
}

export interface FlushOptions {
  /** Skip all validations, including reactive validations, when flushing */
  skipValidation?: boolean;
}

/**
 * Describes the EntityManager read/write mode.
 *
 * - `read-only` -- any entity mutations or `em.flush` calls will fail fast
 * - `in-memory-writes` -- allows entity mutations and `em.flush` w/o a `COMMIT`
 * - `writes` -- allows entity mutations and `em.flush` will `COMMIT` writes
 */
export type EntityManagerMode = "read-only" | "in-memory-writes" | "writes";

/**
 * The EntityManager is the primary way nearly all code, i.e. anything that finds/creates/updates/deletes entities,
 * will interact with the database.
 *
 * It acts both an Identity Cache (preventing loading the same row twice into memory as separate entities, and then
 * having drift between the two instances) and as a Unit of Work (tracking all changes to entities and then batch
 * flushing only the entities that have changed).
 *
 * Note that the type parameters (C, I, and Entity) will be filled in by codegen with the values specific to your
 * application, so you can import your app-specific EntityManager like:
 *
 * ```ts
 * import { EntityManager } from "src/entities";
 * ```
 *
 * @param C The type of your application-specific app-wide/request-wide Context object that will be passed to hooks
 */
export class EntityManager<C = unknown, Entity extends EntityW = EntityW> {
  public readonly ctx: C;
  public driver: Driver;
  public currentTxnKnex: Knex | undefined;
  public entityLimit: number = defaultEntityLimit;
  readonly #entities: Entity[] = [];
  // Indexes the currently loaded entities by their tagged ids. This fixes a real-world
  // performance issue where `findExistingInstance` scanning `#entities` was an `O(n^2)`.
  readonly #entityIndex: Map<string, Entity> = new Map();
  #isValidating: boolean = false;
  readonly #pendingChildren: Map<string, Map<string, { adds: Entity[]; removes: Entity[] }>> = new Map();
  #preloadedRelations: Map<string, Map<string, Entity[]>> = new Map();
  /**
   * Tracks cascade deletes.
   *
   * We originally used a beforeDelete lifecycle hook to implement this, but tracking this
   * individually allows us to a) recursively cascade deletes even during the 1st iteration
   * of our `flush` loop, and b) cascade deletions before we recalc fields & run user hooks,
   * so that both see the most accurate state.
   */
  #pendingCascadeDeletes: Entity[] = [];
  #dataloaders: Record<string, LoaderCache> = {};
  readonly #joinRows: Record<string, JoinRows> = {};
  /** Stores any `source -> downstream` reactions to recalc during `em.flush`. */
  readonly #rm = new ReactionsManager(this);
  /** Ensures our `em.flush` method is not interrupted. */
  readonly #fl = new FlushLock();
  readonly #hooks: Record<EntityManagerHook, HookFn[]> = { beforeTransaction: [], afterTransaction: [] };
  readonly #preloader: PreloadPlugin | undefined;
  #fieldLogger: FieldLogger | undefined;
  private __api: EntityManagerInternalApi;
  mode: EntityManagerMode = "writes";

  constructor(em: EntityManager<C>);
  constructor(ctx: C, opts: EntityManagerOpts);
  constructor(ctx: C, driver: Driver);
  constructor(emOrCtx: EntityManager<C> | C, driverOrOpts?: EntityManagerOpts | Driver) {
    if (emOrCtx instanceof EntityManager) {
      const em = emOrCtx;
      this.driver = em.driver;
      this.#preloader = em.#preloader;
      this.#hooks = {
        beforeTransaction: [...em.#hooks.beforeTransaction],
        afterTransaction: [...em.#hooks.afterTransaction],
      };
      this.ctx = em.ctx;
    } else if (driverOrOpts && "executeFind" in driverOrOpts) {
      this.ctx = emOrCtx;
      this.driver = driverOrOpts;
      this.#preloader = undefined;
    } else {
      this.ctx = emOrCtx;
      this.driver = driverOrOpts!.driver;
      this.#preloader = driverOrOpts!.preloadPlugin;
    }

    // Expose some of our private fields as the EntityManagerInternalApi
    const em = this;
    this.__api = {
      preloader: this.#preloader,
      joinRows(m2m: ManyToManyCollection<any, any>): JoinRows {
        return getOrSet(em.#joinRows, m2m.joinTableName, () => new JoinRows(m2m, em.#rm));
      },
      pendingChildren: this.#pendingChildren,
      getPreloadedRelation<U>(taggedId: string, fieldName: string): U[] | undefined {
        return em.#preloadedRelations.get(taggedId)?.get(fieldName) as U[] | undefined;
      },
      setPreloadedRelation<U>(taggedId: string, fieldName: string, children: U[]): void {
        let map = em.#preloadedRelations.get(taggedId);
        if (!map) {
          map = new Map();
          em.#preloadedRelations.set(taggedId, map);
        }
        map.set(fieldName, children as any);
      },
      hooks: this.#hooks,
      rm: this.#rm,
      get isValidating() {
        return em.#isValidating;
      },
      checkWritesAllowed(): void {
        if (em.mode === "read-only") throw new ReadOnlyError();
        return em.#fl.checkWritesAllowed();
      },
      get fieldLogger() {
        return em.#fieldLogger;
      },
    };
  }

  /** Returns a read-only shallow copy of the currently-loaded entities. */
  get entities(): ReadonlyArray<Entity> {
    return [...this.#entities];
  }

  /** Looks up `id` in the list of already-loaded entities. */
  getEntity<T extends Entity & { id: string }>(id: IdOf<T>): T | undefined;
  getEntity(id: TaggedId): Entity | undefined;
  getEntity(id: TaggedId): Entity | undefined {
    assertIdIsTagged(id);
    return this.#entityIndex.get(id);
  }

  /**
   * Finds entities of `type` with the `where` filter, with auto-batching, so this method
   * will not cause N+1s if called in a loop.
   *
   * The `where` filter is one of Joist's "join literals", which can combine both joining into
   * related entities and simple column conditions in a single literal. All conditions are ANDed.
   * For more complex conditions, use the `find` overload that has a `conditions` option.
   *
   * This method is batch-friendly, i.e. if called in a loop, it will be automatically batched
   * to avoid N+1s. Because of this, it cannot be used with queries that want to use `LIMIT`
   * or `OFFSET`; for those, see `findPaginated`.
   */
  public async find<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
  ): Promise<T[]>;
  public async find<T extends EntityW, const H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options?: FindFilterOptions<T> & { populate?: H },
  ): Promise<Loaded<T, H>[]>;
  async find<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options?: FindFilterOptions<T> & { populate?: any },
  ): Promise<T[]> {
    const { populate, ...rest } = options || {};
    const settings = { where, ...rest };
    const result = await findDataLoader(this, type, settings, populate).load(settings);
    if (populate) {
      await this.populate(result, populate);
    }
    return result;
  }

  /**
   * Finds entities of `type` with the `where` filter, without auto-batching, so this method
   * may call N+1s if called in a loop.
   *
   * The `where` filter is one of Joist's "join literals", which can combine both joining into
   * related entities and simple column conditions in a single literal. All conditions are ANDed.
   * For more complex conditions, use the `find` overload that has a `conditions` option.
   *
   * This method is *NOT* batch-friendly, i.e. if called in a loop, it will cause N+1s. Because
   * of this, you should prefer using `find`, unless you explicitly pagination support.
   */
  public async findPaginated<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options: FindPaginatedFilterOptions<T>,
  ): Promise<T[]>;
  public async findPaginated<T extends EntityW, const H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options: FindPaginatedFilterOptions<T> & { populate: H },
  ): Promise<Loaded<T, H>[]>;
  async findPaginated<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options: FindPaginatedFilterOptions<T> & { populate?: any },
  ): Promise<T[]> {
    const { populate, limit, offset, ...rest } = options || {};
    const query = parseFindQuery(getMetadata(type), where, rest);
    const rows = await this.driver.executeFind(this, query, { limit, offset });
    // check row limit
    const result = this.hydrate(type, rows);
    if (populate) {
      await this.populate(result, populate);
    }
    return result;
  }

  /**
   * Works exactly like `find` but accepts "less than greatly typed" GraphQL filters.
   *
   * I.e. filtering by `null` on fields that are non-`nullable`.
   */
  public async findGql<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    where: GraphQLFilterWithAlias<T>,
  ): Promise<T[]>;
  public async findGql<T extends EntityW, const H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    where: GraphQLFilterWithAlias<T>,
    options?: FindFilterOptions<T> & { populate?: H },
  ): Promise<Loaded<T, H>[]>;
  async findGql<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    where: GraphQLFilterOf<T>,
    options?: FindFilterOptions<T> & { populate?: any },
  ): Promise<T[]> {
    return this.find(type, where as any, options);
  }

  /**
   * Works exactly like `findPaginated` but accepts "less than greatly typed" GraphQL filters.
   *
   * I.e. filtering by `null` on fields that are non-`nullable`.
   */
  public async findGqlPaginated<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    where: GraphQLFilterWithAlias<T>,
    options: FindGqlPaginatedFilterOptions<T>,
  ): Promise<T[]>;
  public async findGqlPaginated<T extends EntityW, const H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    where: GraphQLFilterWithAlias<T>,
    options: FindGqlPaginatedFilterOptions<T> & { populate: H },
  ): Promise<Loaded<T, H>[]>;
  async findGqlPaginated<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    where: GraphQLFilterWithAlias<T>,
    options: FindGqlPaginatedFilterOptions<T> & { populate?: any },
  ): Promise<T[]> {
    return this.findPaginated(type, where as any, options as any);
  }

  public async findOne<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
  ): Promise<T | undefined>;
  public async findOne<T extends EntityW, const H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options?: { populate?: H; softDeletes?: "include" | "exclude" },
  ): Promise<Loaded<T, H> | undefined>;
  async findOne<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options?: { populate?: any; softDeletes?: "include" | "exclude" },
  ): Promise<T | undefined> {
    const list = await this.find(type, where, options);
    if (list.length === 0) {
      return undefined;
    } else if (list.length === 1) {
      return list[0];
    } else {
      throw new TooManyError(`Found more than one: ${list.map((e) => e.toString()).join(", ")}`);
    }
  }

  /** Executes a given query filter and returns exactly one result, otherwise throws `NotFoundError` or `TooManyError`. */
  public async findOneOrFail<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
  ): Promise<T>;
  public async findOneOrFail<T extends EntityW, const H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options: { populate?: H; softDeletes?: "include" | "exclude" },
  ): Promise<Loaded<T, H>>;
  async findOneOrFail<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options?: { populate?: any; softDeletes?: "include" | "exclude" },
  ): Promise<T> {
    const list = await this.find(type, where, options);
    if (list.length === 0) {
      throw new NotFoundError(`Did not find ${type.name} for given query`);
    } else if (list.length > 1) {
      throw new TooManyError(`Found more than one: ${list.map((e) => e.toString()).join(", ")}`);
    }
    return list[0];
  }

  public async findByUnique<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    where: UniqueFilter<T>,
  ): Promise<T | undefined>;
  public async findByUnique<T extends EntityW, const H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    where: UniqueFilter<T>,
    options?: { populate?: H; softDeletes?: "include" | "exclude" },
  ): Promise<Loaded<T, H> | undefined>;
  async findByUnique<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    where: UniqueFilter<T>,
    options: { populate?: any; softDeletes?: "include" | "exclude" } = {},
  ): Promise<T | undefined> {
    const { populate, softDeletes = "exclude" } = options;
    const entries = Object.entries(where);
    if (entries.length !== 1) {
      throw new Error("findByUnique only accepts a single field");
    }
    const [fieldName, value] = entries[0];
    const field = getMetadata(type).allFields[fieldName];
    const row = await findByUniqueDataLoader(this, type, field, softDeletes).load(value);
    if (!row) {
      return undefined;
    } else {
      const [entity] = this.hydrate(type, [row]);
      if (populate) {
        await this.populate(entity, populate);
      }
      return entity;
    }
  }

  /**
   * Returns the count of entities that match the `where` clause.
   *
   * The `where` clause, and any options.conditions, matches the same syntax
   * as `em.find`.
   *
   * Note: this method is not currently auto-batched, so it will cause N+1s if called in a loop.
   */
  async findCount<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options: FindCountFilterOptions<T> = {},
  ): Promise<number> {
    const settings = { where, ...options };
    let count = await findCountDataLoader(this, type, settings).load(settings);

    // If the user is do "count all", we can adjust the number up/down based on
    // WIP creates/deletes. We can't do this if the WHERE clause is populated b/c
    // then we'd also have to eval each created/deleted entity against the WHERE
    // clause before knowing if it should adjust teh amount.
    const isSelectAll = Object.keys(where).length === 0;
    if (isSelectAll) {
      for (const entity of this.#entities) {
        if (entity instanceof type) {
          if (entity.isNewEntity) {
            count++;
          } else if (entity.isDeletedEntity) {
            count--;
          }
        }
      }
    }

    return count;
  }

  /**
   * Looks for entities that match `where`, both in the database and any just-created or just-changed entities.
   *
   * Because we evaluate this `where` clause in memory (against any WIP changes made to entities
   * that have not yet been `em.flush`ed to the database), the `where` clause is limited to a
   * flat set of fields immediately on the entity, i.e. primitives, enums, and many-to-ones,
   * without any nested, cross-table joins/conditions.
   *
   * @param type the entity type to find
   * @param where the fields to look up the existing entity by
   */
  async findWithNewOrChanged<T extends EntityW, F extends Partial<OptsOf<T>>>(
    type: EntityConstructor<T>,
    where: F,
  ): Promise<T[]>;
  async findWithNewOrChanged<T extends EntityW, F extends Partial<OptsOf<T>>, const H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    where: F,
    options?: { populate?: H; softDeletes?: "include" | "exclude" },
  ): Promise<Loaded<T, H>[]>;
  async findWithNewOrChanged<T extends EntityW, F extends Partial<OptsOf<T>>, const H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    where: F,
    options?: { populate?: H; softDeletes?: "include" | "exclude" },
  ): Promise<T[]> {
    const { softDeletes = "exclude", populate } = options ?? {};
    const persisted = await this.find(type, where as any, { softDeletes });
    const unchanged = persisted.filter((e) => !e.isNewEntity && !e.isDirtyEntity && !e.isDeletedEntity);
    const maybeNew = this.entities.filter(
      (e) => e instanceof type && (e.isNewEntity || e.isDirtyEntity) && entityMatches(e, where),
    );
    const found = [...unchanged, ...maybeNew];
    if (populate) {
      await this.populate(found, populate as any);
    }
    return found as unknown as T[];
  }

  /**
   * Conditionally finds or creates (or upserts) an Entity.
   *
   * The `where` param is used to find the existing/if any entity; if not found,
   * then one will be created.
   *
   * The `ifNew` param will be used, if no entity is found, for the `em.create` call;
   * it is typed such that it will require all opts necessary for the `em.create` to
   * be valid, _unless_ those opts are already included in either the `where` or
   * `upsert` params.
   *
   * The optional `upsert` param are fields to always set/update, regardless of whether
   * the entity is created or not.
   *
   * @param type the entity type to find/create
   * @param where the fields to look up the existing entity by
   * @param ifNew the fields to set if the entity is new
   * @param upsert the fields to update if the entity is either existing or new
   */
  async findOrCreate<
    T extends EntityW,
    F extends Partial<OptsOf<T>>,
    U extends Partial<OptsOf<T>> | {},
    N extends Omit<OptsOf<T>, keyof F | keyof U>,
  >(type: EntityConstructor<T>, where: F, ifNew: N, upsert?: U): Promise<T>;
  async findOrCreate<
    T extends EntityW,
    F extends Partial<OptsOf<T>>,
    U extends Partial<OptsOf<T>> | {},
    N extends Omit<OptsOf<T>, keyof F | keyof U>,
    const H extends LoadHint<T>,
  >(
    type: EntityConstructor<T>,
    where: F,
    ifNew: N,
    upsert?: U,
    options?: { populate?: H; softDeletes?: "include" | "exclude" },
  ): Promise<Loaded<T, H>>;
  async findOrCreate<
    T extends EntityW,
    F extends Partial<OptsOf<T>>,
    U extends Partial<OptsOf<T>> | {},
    N extends Omit<OptsOf<T>, keyof F | keyof U>,
    const H extends LoadHint<T>,
  >(
    type: EntityConstructor<T>,
    where: F,
    ifNew: N,
    upsert?: U,
    options?: { populate?: H; softDeletes?: "include" | "exclude" },
  ): Promise<T> {
    const { softDeletes = "exclude", populate } = options ?? {};
    const entity = await findOrCreateDataLoader(this, type, where, softDeletes).load({
      where,
      ifNew: ifNew as OptsOf<T>,
      upsert,
    });
    if (populate) {
      await this.populate(entity, populate);
    }
    return entity;
  }

  /** Creates a new `type` and marks it as loaded, i.e. we know its collections are all safe to access in memory. */
  public create<T extends EntityW, O extends OptsOf<T>>(type: EntityConstructor<T>, opts: O): New<T, O> {
    // The constructor will run setOpts which handles defaulting collections to the right state.
    return new type(this, opts) as New<T, O>;
  }

  /** Creates a new `type` but with `opts` that are nullable, to accept partial-update-style input. */
  public createPartial<T extends EntityW>(type: EntityConstructor<T>, opts: PartialOrNull<OptsOf<T>>): T {
    // We force some manual calls to setOpts to mimic `setUnsafe`'s behavior that `undefined` should
    // mean "ignore" (and we assume validation rules will catch it later) but still set
    // `calledFromConstructor` because this is _basically_ like calling `new`.
    const entity = new type(this, undefined!);
    // Could remove the `as OptsOf<T>` by adding a method overload on `partial: true`
    setOpts(entity, opts as OptsOf<T>, { partial: true, calledFromConstructor: true });
    return entity;
  }

  /** Creates a new `type` but with `opts` that are nullable, to accept partial-update-style input. */
  public createOrUpdatePartial<T extends EntityW>(type: EntityConstructor<T>, opts: DeepPartialOrNull<T>): Promise<T> {
    return createOrUpdatePartial(this, type, opts);
  }

  /**
   * Utility to clone an entity and its nested relations, as determined by a populate hint
   *
   * @param entity - Any entity
   * @param opts - Options to control the clone behaviour
   *   @param deep - Populate hint of the nested tree of objects to clone
   *   @param skipIf - Predicate for determining if a specific entity should be skipped (and any entities beneath it
   *   @param postClone - Function to be called for each original/clone entity for any post-processing needed
   * @returns The `Loaded` cloned entity or fails if the clone could not be made
   *
   * @example
   * // This will duplicate the author
   * const duplicatedAuthor = await em.clone(author)
   *
   * @example
   * // This will duplicate the author and all their related book entities
   * const duplicatedAuthorAndBooks = await em.clone(author, { deep: "books" })
   *
   * @example
   * // This will duplicate the author, all their books, and the images for those books
   * const duplicatedAuthorAndBooksAndImages = await em.clone(author, { deep: { books: "image" } })
   *
   * @example
   * // This will duplicate the author, and rename
   * const duplicatedAuthor = await em.clone(author, { postClone: (_original, clone) => clone.firstName = clone.firstName + " COPY" })
   *
   * @example
   * // This will duplicate the author, but skip any book where the title includes `sea`
   * const duplicatedAuthor = await em.clone(author, { skipIf: (original) => original.title?.includes("sea") })
   */
  public async clone<T extends EntityW, H extends LoadHint<T>>(
    entity: T,
    opts?: { deep?: H; skipIf?: (entity: Entity) => boolean; postClone?: (original: Entity, clone: Entity) => void },
  ): Promise<Loaded<T, H>>;

  /**
   * Utility to clone an entity and its nested relations, as determined by a populate hint.
   *
   * @param entities - Any homogeneous list of entities
   * @param opts - Options to control the clone behaviour
   *   @param deep - Populate hint of the nested tree of objects to clone
   *   @param skipIf - Predicate for determining if a specific entity should be skipped (and any entities beneath it
   *   @param postClone - Function to be called for each original/clone entity for any post-processing needed
   * @returns Array of `Loaded` cloned entities from the provided list or empty array if all are skipped
   *
   * @example
   * // This will duplicate the author's books
   * const duplicatedBooks = await em.clone(author.books.get)
   *
   * @example
   * // This will duplicate the author's books, all their books, and the images for those books
   * const duplicatedBooksAndImages = await em.clone(author.books.get, { deep: { books: "image" } })
   *
   * @example
   * // This will duplicate the author's books, and assign them to a different author
   * const duplicatedBooks = await em.clone(author.books.get, { postClone: (_original, clone) => clone.author.set(author2) })
   *
   * @example
   * // This will duplicate the author's books, but skip any book where the title includes `sea`
   * const duplicatedBooks = await em.clone(author.books.get, { skipIf: (original) => original.title.includes("sea") })
   */
  public async clone<T extends EntityW, H extends LoadHint<T>>(
    entities: readonly T[],
    opts?: { deep?: H; skipIf?: (entity: Entity) => boolean; postClone?: (original: Entity, clone: Entity) => void },
  ): Promise<Loaded<T, H>[]>;
  public async clone<T extends EntityW, H extends LoadHint<T>>(
    entityOrArray: T | readonly T[],
    opts?: { deep?: H; skipIf?: (entity: Entity) => boolean; postClone?: (original: Entity, clone: Entity) => void },
  ): Promise<Loaded<T, H> | Loaded<T, H>[]> {
    const { deep = {}, skipIf, postClone } = opts ?? {};
    // Keep a list that we can work against synchronously after doing the async find/crawl
    const todo: Entity[] = [];

    // 1. Find all entities w/o mutating them yets
    await crawl(todo, Array.isArray(entityOrArray) ? entityOrArray : [entityOrArray], deep, { skipIf: skipIf as any });

    // 2. Clone each found entity
    const clones = todo.map((entity) => {
      // Use meta.fields to see which fields are derived (i.e. createdAt, updatedAt, initials)
      // that only have getters, and so we shouldn't set (createdAt/updatedAt will be initialized
      // by `em.register`).
      const meta = getMetadata(entity);
      const copy = Object.fromEntries(
        Object.values(meta.allFields)
          .map((f) => {
            switch (f.kind) {
              case "primitive":
                if (!f.derived && !f.protected) {
                  return [f.fieldName, getField(entity, f.fieldName)];
                } else {
                  return undefined;
                }
              case "m2o":
              case "enum":
                if (f.derived) {
                  return undefined;
                } else {
                  return [f.fieldName, getField(entity, f.fieldName)];
                }
              case "poly":
                return [f.fieldName, getField(entity, f.fieldName)];
              case "primaryKey":
              case "o2m":
              case "m2m":
              case "o2o":
              case "lo2m":
                return undefined;
              default:
                assertNever(f);
            }
          })
          .filter(isDefined),
      );

      // Call `new` just like the user would do
      // The `asConcreteCstr` is safe b/c we got meta from a concrete/already-instantiated entity
      const clone = new (asConcreteCstr(meta.cstr))(this, copy);

      return [entity, clone] as const;
    });
    const entityToClone = new Map(clones);

    // 3. Now mutate the m2o relations. We focus on only m2o's because they "own" the field/column,
    // and will drive percolation to keep the other-side o2m & o2o updated.
    clones.forEach(([, clone]) => {
      getRelationEntries(clone).forEach(([fieldName, value]) => {
        if (
          value instanceof ManyToOneReferenceImpl ||
          value instanceof PolymorphicReferenceImpl ||
          value instanceof ReactiveReferenceImpl
        ) {
          // What's the existing entity? Have we cloned it?
          const existingIdOrEntity = getField(clone, fieldName);
          const existing = this.entities.find((e) => sameEntity(e, existingIdOrEntity));
          // If we didn't find a loaded entity for this value, assume that it a) itself is not being cloned,
          // and b) we don't need to bother telling it about the newly cloned entity
          if (existing) {
            ((clone as any)[fieldName] as any).set(entityToClone.get(existing) ?? existing);
          }
        }
      });
    });

    if (postClone) {
      await Promise.all(clones.map(([original, clone]) => postClone(original, clone)));
    }

    return Array.isArray(entityOrArray)
      ? entityOrArray
          .filter((original) => entityToClone.has(original))
          .map((original) => entityToClone.get(original) as unknown as Loaded<T, H>)
      : clones[0]
        ? (clones[0][1] as unknown as Loaded<T, H>)
        : fail("no entities were cloned given the provided options");
  }

  /** Returns an instance of `type` for the given `id`, resolving to an existing instance if in our Unit of Work. */
  public async load<T extends EntityW & { id: string }>(id: IdOf<T>): Promise<T>;
  public async load(id: TaggedId): Promise<Entity>;
  public async load<T extends EntityW>(type: MaybeAbstractEntityConstructor<T>, id: IdOf<T> | TaggedId): Promise<T>;
  public async load<T extends EntityW, const H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    id: IdOf<T> | TaggedId,
    populate: H,
  ): Promise<Loaded<T, H>>;
  async load<T extends EntityW>(
    typeOrId: MaybeAbstractEntityConstructor<T> | string,
    id?: IdType,
    hint?: any,
  ): Promise<T> {
    // Handle the `typeOrId` overload
    let type: MaybeAbstractEntityConstructor<T>;
    if (typeof typeOrId === "string") {
      // This must be a tagged id for the 1st overload to work
      type = getConstructorFromTaggedId(typeOrId);
      id = typeOrId;
    } else {
      type = typeOrId;
      id = id || fail(`Invalid ${typeOrId.name} id: ${id}`);
    }
    const meta = getMetadata(type);
    const tagged = toTaggedId(meta, id);
    const entity =
      this.findExistingInstance<T>(tagged) || (await loadDataLoader(this, meta).load({ entity: tagged, hint }));
    if (!entity) {
      throw new NotFoundError(`${tagged} was not found`);
    }
    if (hint) {
      await this.populate(entity, hint);
    }
    return entity as T;
  }

  /** Returns instances of `type` for the given `ids`, resolving to an existing instance if in our Unit of Work. */
  public async loadAll<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    ids: readonly string[],
  ): Promise<T[]>;
  public async loadAll<T extends EntityW, const H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    ids: readonly string[],
    populate: H,
  ): Promise<Loaded<T, H>[]>;
  async loadAll<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    _ids: readonly string[],
    hint?: any,
  ): Promise<T[]> {
    const meta = getMetadata(type);
    const ids = _ids.map((id) => tagId(meta, id));
    const entities = await Promise.all(
      ids.map((id) => {
        return this.findExistingInstance(id) || loadDataLoader(this, meta).load({ entity: id, hint });
      }),
    );
    const idsNotFound = ids.filter((_, i) => entities[i] === undefined);
    if (idsNotFound.length > 0) {
      throw new NotFoundError(`${idsNotFound.join(",")} were not found`);
    }
    if (hint) {
      await this.populate(entities as T[], hint);
    }
    return entities as T[];
  }

  /**
   * Returns instances of `type` for the given `ids`, resolving to an existing instance if in our Unit of Work. Ignores
   * IDs that are not found.
   */
  public async loadAllIfExists<T extends EntityW>(type: EntityConstructor<T>, ids: readonly string[]): Promise<T[]>;
  public async loadAllIfExists<T extends EntityW, const H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    ids: readonly string[],
    populate: H,
  ): Promise<Loaded<T, H>[]>;
  async loadAllIfExists<T extends EntityW>(
    type: EntityConstructor<T>,
    _ids: readonly string[],
    hint?: any,
  ): Promise<T[]> {
    const meta = getMetadata(type);
    const ids = _ids.map((id) => tagId(meta, id));
    const entities = (
      await Promise.all(
        ids.map((id) => {
          return this.findExistingInstance(id) || loadDataLoader(this, meta).load({ entity: id, hint });
        }),
      )
    ).filter(Boolean);
    if (hint) {
      await this.populate(entities as T[], hint);
    }
    return entities as T[];
  }

  /**
   * Loads entities found, when starting at `entities`, via the "path" given by the `fn` lens function.
   *
   * Results are unique, i.e. if doing `em.loadLens([b1, b2], b => b.author.publisher)` point to the
   * same `Publisher`, it will only be returned as a single value.
   */
  public async loadLens<T extends EntityW, U, V>(entities: T[], fn: (lens: Lens<T>) => Lens<U, V>): Promise<U[]>;
  public async loadLens<T extends EntityW, U extends EntityW, V, const H extends LoadHint<U>>(
    entities: T[],
    fn: (lens: Lens<T>) => Lens<U, V>,
    populate: H,
  ): Promise<Loaded<U, H>[]>;
  public async loadLens<T extends EntityW, U, V>(
    entities: T[],
    fn: (lens: Lens<T>) => Lens<U, V>,
    populate?: any,
  ): Promise<V> {
    const result = await loadLens(entities, fn);
    if (populate) {
      await this.populate(result as any as Entity[], populate);
    }
    return result;
  }

  /** Loads entities from a knex QueryBuilder. */
  public async loadFromQuery<T extends EntityW>(type: EntityConstructor<T>, query: Knex.QueryBuilder): Promise<T[]>;
  public async loadFromQuery<T extends EntityW, const H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    query: Knex.QueryBuilder,
    populate: H,
  ): Promise<Loaded<T, H>[]>;
  public async loadFromQuery<T extends EntityW>(
    type: EntityConstructor<T>,
    query: Knex.QueryBuilder,
    populate?: any,
  ): Promise<T[]> {
    // Enforce this em's entity limit if this query doesn't already have a limit present.
    // Knex doesn't have an api to inspect a query, so we have to go through its internal `_single` property
    if ((query as any)._single.limit === undefined) {
      query.limit(this.entityLimit);
    }
    const rows = await query;
    const entities = this.hydrate(type, rows);
    if (populate) {
      await this.populate(entities, populate);
    }
    return entities;
  }

  /** Loads entities from rows. */
  public async loadFromRows<T extends EntityW>(type: EntityConstructor<T>, rows: unknown[]): Promise<T[]>;
  public async loadFromRows<T extends EntityW, const H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    rows: unknown[],
    populate: H,
  ): Promise<Loaded<T, H>[]>;
  public async loadFromRows<T extends EntityW>(
    type: EntityConstructor<T>,
    rows: unknown[],
    populate?: any,
  ): Promise<T[]> {
    const entities = this.hydrate(type, rows);
    if (populate) {
      await this.populate(entities, populate);
    }
    return entities;
  }

  /** Given a hint `H` (a field, array of fields, or nested hash), pre-load that data into `entity` for sync access. */
  public async populate<T extends EntityW, const H extends LoadHint<T>, V = Loaded<T, H>>(
    entity: T,
    hint: H,
    fn?: (entity: Loaded<T, H>) => V,
  ): Promise<V>;
  public async populate<T extends EntityW, const H extends LoadHint<T>, V = Loaded<T, H>>(
    entity: T,
    opts: { hint: H; forceReload?: boolean },
    fn?: (entity: Loaded<T, H>) => V,
  ): Promise<V>;
  public async populate<T extends EntityW, const H extends LoadHint<T>>(
    entities: ReadonlyArray<T>,
    hint: H,
  ): Promise<Loaded<T, H>[]>;
  public async populate<T extends EntityW, const H extends LoadHint<T>>(
    entities: ReadonlyArray<T>,
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<T, H>[]>;
  async populate<T extends EntityW, H extends LoadHint<T>, V>(
    entityOrList: T | T[],
    hintOrOpts: { hint: H; forceReload?: boolean } | H,
    fn?: (entity: Loaded<T, H>) => V,
  ): Promise<Loaded<T, H> | Array<Loaded<T, H>> | V> {
    const { hint: hintOpt, ...opts } =
      typeof hintOrOpts === "object" && "hint" in hintOrOpts ? hintOrOpts : { hint: hintOrOpts };

    // Tell `AsyncMethodImpl.load` to not invoke its function
    (opts as any)[AsyncMethodPopulateSecret] = true;

    // I'm tempted to throw an error here, because at least internal callers should ideally pre-check
    // that `list > 0` and `Object.keys(hint).length > 0` before calling `populate`, just as an optimization.
    // But since it's a public API, we should just early exit.
    const list = toArray(entityOrList).filter((e) => {
      // Check `isDeletedAndFlushed` so that pending-delete entities are still populated,
      // because their hooks might do `getWithDeleted` calls and expect them to be loaded.
      return e !== undefined && !getInstanceData(e).isDeletedAndFlushed;
    });
    if (list.length === 0) {
      return !fn ? (entityOrList as any) : fn(entityOrList as any);
    }

    const meta = getMetadata(list[0]);

    if (this.#preloader) {
      // If we can preload, prevent promise deadlocking by one large-batch preload populate (which can't have
      // intra dependencies), then a 2nd small-batch non-preload populate.
      const [preload, non] = this.#preloader.partitionHint(meta, hintOpt);
      if (preload) {
        const loader = populateDataLoader(this, meta, preload, "preload", opts);
        await Promise.all(list.map((entity) => loader.load({ entity, hint: preload })));
      }
      if (non) {
        const loader = populateDataLoader(this, meta, non, "intermixed", opts);
        await Promise.all(list.map((entity) => loader.load({ entity, hint: non })));
      }
    } else {
      const loader = populateDataLoader(this, meta, hintOpt, "intermixed", opts);
      await Promise.all(list.map((entity) => loader.load({ entity, hint: hintOpt })));
    }

    return fn ? fn(entityOrList as any) : (entityOrList as any);
  }

  // For debugging EntityManager.populate.test.ts's "can be huge"
  // populates: Record<string, number> = {};

  /**
   * Executes `fn` with a transaction, and automatically calls `flush`/`commit` at the end.
   *
   * This ensures both any `.find` as well as `.flush` operations happen within the same
   * transaction, which is useful for enforcing cross-table/application-level invariants that
   * cannot be enforced with database-level constraints.
   */
  public async transaction<T>(fn: (txn: Knex.Transaction) => Promise<T>): Promise<T> {
    return this.driver.transaction(
      this,
      async (knex) => {
        const result = await fn(knex);
        // The lambda may have done some interstitial flushes (that would not
        // have committed the transaction), but go ahead and do a final one
        // in case they didn't explicitly call flush.
        await this.flush();
        return result;
      },
      // Application-enforced unique constraints (i.e. custom find + conditional insert) can be
      // serialization anomalies, so we use the highest isolation level b/c it prevents this.
      // See the EntityManager.txns.test.ts file.
      "serializable",
    );
  }

  /** Registers a newly-instantiated entity with our EntityManager; only called by entity constructors. */
  register(entity: Entity): void {
    if (entity.idTaggedMaybe) {
      if (this.findExistingInstance(entity.idTagged) !== undefined) {
        throw new Error(`Entity ${entity} has a duplicate instance already loaded`);
      }
      this.#entityIndex.set(entity.idTagged, entity);
    }

    this.#entities.push(entity);
    if (this.#entities.length >= this.entityLimit) {
      throw new Error(`More than ${this.entityLimit} entities have been instantiated`);
    }

    // Set a default createdAt/updatedAt that we'll keep if this is a new entity, or over-write if we're loaded an existing row
    if (entity.isNewEntity) {
      const baseMeta = getBaseMeta(getMetadata(entity));
      const { createdAt, updatedAt } = baseMeta.timestampFields;
      const { data } = getInstanceData(entity);
      const now = new Date();
      if (createdAt) {
        const serde = baseMeta.fields[createdAt].serde as TimestampSerde<unknown>;
        data[createdAt] = serde.mapFromDate(now);
      }
      if (updatedAt) {
        const serde = baseMeta.fields[updatedAt].serde as TimestampSerde<unknown>;
        data[updatedAt] = serde.mapFromDate(now);
      }
      // Set the discriminator for STI
      if (baseMeta.inheritanceType === "sti") {
        setStiDiscriminatorValue(baseMeta, entity);
      }
      this.#rm.queueAllDownstreamFields(entity, "created");
    }
  }

  /**
   * Marks an instance to be deleted.
   *
   * Any loaded collections that are currently "pointing to" this entity will be updated to
   * no longer include this entity, i.e. if you `em.delete(b1)`, then `author.books` will have
   * `b1` removed (if needed).
   *
   * This is done for all currently-loaded collections; i.e. technically unloaded collections
   * may still point to this entity. We defer unsetting these not-currently-loaded references
   * until `EntityManager.flush`, when we can make the async calls to load-and-unset them.
   */
  delete(entity: Entity): void {
    // Early return if already deleted.
    const alreadyMarked = getInstanceData(entity).markDeleted();
    if (!alreadyMarked) return;
    // Any derived fields that read this entity will need recalc-d
    this.#rm.queueAllDownstreamFields(entity, "deleted");
    // Synchronously unhook the entity if the relations are loaded
    getCascadeDeleteRelations(entity).forEach((r) => r.maybeCascadeDelete());
    // And queue the cascade deletes
    this.#pendingCascadeDeletes.push(entity);
  }

  async assignNewIds() {
    let pendingEntities = this.entities.filter((e) => e.isNewEntity && !e.isDeletedEntity && !e.idTaggedMaybe);
    await this.getLoader<Entity, Entity>("assign-new-ids", "global", async (entities) => {
      let todos = createTodos(entities);
      await this.driver.assignNewIds(this, todos);
      return entities;
    }).loadMany(pendingEntities);
  }

  /**
   * Flushes the SQL for any changed entities to the database.
   *
   * If this is run outside of an existing transaction, it will `BEGIN` and `COMMIT`
   * a new transaction on every `.flush()` call so that all of the `INSERT`s/etc.
   * happen atomically.
   *
   * If this is run within an existing transaction, i.e. `EntityManager.transaction`,
   * then it will only issue `INSERT`s/etc. and defer to the caller to `COMMIT`
   * the transaction.
   *
   * It returns entities that have changed (an entity is considered changed if it has been deleted, inserted, or updated)
   */
  async flush(flushOptions: FlushOptions = {}): Promise<Entity[]> {
    if (this.mode === "read-only") throw new ReadOnlyError();

    const { skipValidation = false } = flushOptions;

    this.#fl.startLock();

    await this.#fl.allowWrites(async () => {
      // Cascade deletes now that we're async (i.e. to keep `em.delete` synchronous).
      // Also do this before calling `recalcPendingDerivedValues` to avoid recalculating
      // fields on entities that will be deleted (and probably have unset/invalid FKs
      // that would NPE their logic anyway).
      await this.cascadeDeletes();
      // Recalc before we run hooks, so the hooks will see the latest calculated values.
      await this.#rm.recalcPendingDerivedValues("reactiveFields");
    });

    const createdThenDeleted: Set<Entity> = new Set();
    // We'll only invoke hooks once/entity (the 1st time that entity goes through runHooksOnPendingEntities)
    const hooksInvoked: Set<Entity> = new Set();
    // Make sure two ReactiveQueryFields don't ping-pong each other forever
    let hookLoops = 0;
    let now = getNow();
    this.#rm.clearSuppressedTypeErrors();
    const suppressedDefaultTypeErrors: Error[] = [];

    // Make a lambda that we can invoke multiple times, if we loop for ReactiveQueryFields
    const runHooksOnPendingEntities = async (): Promise<Entity[]> => {
      if (hookLoops++ >= 10) throw new Error("runHooksOnPendingEntities has ran 10 iterations, aborting");
      // Any dirty entities we find, even if we skipped firing their hooks on this loop
      const pendingFlush: Set<Entity> = new Set();
      // Subset of pendingFlush entities that we will run hooks on
      const pendingHooks: Set<Entity> = new Set();
      // Subset of pendingFlush entities that had hooks invoked in a prior `runHooksOnPendingEntities`
      const alreadyRanHooks = new Set<Entity>();

      findPendingFlushEntities(this.entities, hooksInvoked, pendingFlush, pendingHooks, alreadyRanHooks);

      // If we're re-looping for ReactiveQueryField, make sure to bump updatedAt
      // each time, so that for an INSERT-then-UPDATE the triggers don't think the
      // UPDATE forgot to self-bump updatedAt, and then "helpfully" bump it for us.
      if (alreadyRanHooks.size > 0) {
        maybeBumpUpdatedAt(createTodos([...alreadyRanHooks]), now);
      }

      // Run hooks in a series of loops until things "settle down"
      while (pendingHooks.size > 0) {
        await this.#fl.allowWrites(async () => {
          // Run our hooks
          let todos = createTodos([...pendingHooks]);
          await setAsyncDefaults(suppressedDefaultTypeErrors, this.ctx, todos);
          maybeBumpUpdatedAt(todos, now);
          await beforeCreate(this.ctx, todos);
          await beforeUpdate(this.ctx, todos);
          await beforeFlush(this.ctx, todos);

          // Call `setField` just to get the column marked as dirty if needed.
          // This can come after the hooks, b/c if the hooks read any of these
          // fields, they'd be via the synchronous getter and would not be stale.
          recalcSynchronousDerivedFields(todos);

          // The hooks could have deleted this-loop or prior-loop entities, so re-cascade again.
          await this.cascadeDeletes();
          // The hooks could have changed fields, so recalc again.
          await this.#rm.recalcPendingDerivedValues("reactiveFields");

          if (this.#rm.hasFieldsPendingAssignedIds) {
            await this.assignNewIds();
            await this.#rm.recalcRelationsPendingAssignedIds();
          }

          for (const e of pendingHooks) hooksInvoked.add(e);
          pendingHooks.clear();
          // See if the hooks mutated any new, not-yet-hooksInvoked entities
          findPendingFlushEntities(this.entities, hooksInvoked, pendingFlush, pendingHooks, alreadyRanHooks);
        });
      }
      // We might have invoked hooks that immediately deleted a new entity (weird but allowed);
      // if so, filter it out so that we don't flush it, but keep track for later fixing up
      // it's `#orm.deleted` field.
      return [...pendingFlush].filter((e) => {
        const createThenDelete = e.isDeletedEntity && e.isNewEntity;
        if (createThenDelete) createdThenDeleted.add(e);
        return !createThenDelete;
      });
    };

    const runValidation = async (entityTodos: Record<string, Todo>, joinRowTodos: any) => {
      try {
        this.#isValidating = true;
        // Run simple rules first b/c it includes not-null/required rules, so that then when we run
        // `validateReactiveRules` next, the lambdas won't see invalid entities.
        await validateSimpleRules(entityTodos);
        // After we've let any "author is not set" simple rules fail before prematurely throwing
        // the "of course that caused an NPE" `TypeError`s, if all the authors *were* valid/set,
        // and we still have TypeErrors, they were real, unrelated errors that the user should see.
        if (suppressedDefaultTypeErrors.length > 0) throw suppressedDefaultTypeErrors[0];
        await validateReactiveRules(entityTodos, joinRowTodos);
      } finally {
        this.#isValidating = false;
      }
      await afterValidation(this.ctx, entityTodos);
    };

    const allFlushedEntities: Set<Entity> = new Set();

    try {
      // Run hooks (in iterative loops if hooks mutate new entities) on pending entities
      let entitiesToFlush = await runHooksOnPendingEntities();
      for (const e of entitiesToFlush) allFlushedEntities.add(e);

      // Recreate todos now that we've run hooks and recalculated fields so know
      // the full set of entities that will be INSERT/UPDATE/DELETE-d in the database.
      let entityTodos = createTodos(entitiesToFlush);
      let joinRowTodos = combineJoinRows(this.#joinRows);
      if (!skipValidation) {
        await runValidation(entityTodos, joinRowTodos);
      }
      this.#rm.throwIfAnySuppressedTypeErrors();
      if (suppressedDefaultTypeErrors.length > 0) throw suppressedDefaultTypeErrors[0];

      if (Object.keys(entityTodos).length > 0 || Object.keys(joinRowTodos).length > 0) {
        // The driver will handle the right thing if we're already in an existing transaction.
        // We also purposefully don't pass an isolation level b/c if we're only doing
        // INSERTs and UPDATEs, then we don't really care about overlapping SELECT-then-INSERT
        // serialization anomalies. (Although should we? Maybe we should run the flush hooks
        // in this same transaction just as a matter of principle / safest default.)
        await this.driver.transaction(this, async () => {
          do {
            await this.driver.flushEntities(this, entityTodos);
            await this.driver.flushJoinTables(this, joinRowTodos);
            // Now that we've flushed, look for ReactiveQueries that need to be recalculated
            if (this.#rm.hasPendingReactiveQueries()) {
              // Reset all flushed entities to we only flush net-new changes
              for (const e of entitiesToFlush) {
                if (e.isNewEntity && !e.isDeletedEntity) this.#entityIndex.set(e.idTagged, e);
                getInstanceData(e).resetForRqfLoop();
              }
              // Actually do the recalc
              await this.#fl.allowWrites(async () => {
                await this.#rm.recalcPendingDerivedValues("reactiveQueries");
                // If any ReactiveFields depended on ReactiveQueryFields, go ahead and calc those now
                await this.#rm.recalcPendingDerivedValues("reactiveFields");
              });
              // Advance `now` so that our triggers don't think our UPDATEs are forgetting to self-bump
              // updated_at, and bump it themselves, which could cause a subsequent error.
              now = getNow();
              // See if any RQFs actually changed any entities. If they did, run the hooks on them.
              entitiesToFlush = await runHooksOnPendingEntities();
              for (const e of entitiesToFlush) allFlushedEntities.add(e);
              // Recreate `entityTodos` against the only-the-just-changed entities
              entityTodos = createTodos(entitiesToFlush);
              joinRowTodos = combineJoinRows(this.#joinRows);
              await runValidation(entityTodos, joinRowTodos);
              this.#rm.throwIfAnySuppressedTypeErrors();
            } else {
              // Exit the loop
              entityTodos = {};
            }
          } while (Object.keys(entityTodos).length > 0);
          // Run `beforeCommit once right before COMMIT
          await beforeCommit(this.ctx, allFlushedEntities);
          if (this.mode === "in-memory-writes") {
            throw new InMemoryRollbackError();
          }
        });

        // TODO: This is really "after flush" if we're being called from a transaction that
        // is going to make multiple `em.flush()` calls?
        await afterCommit(this.ctx, allFlushedEntities);

        // Update the `#orm` field to reflect the new state
        for (const e of allFlushedEntities) {
          if (e.isNewEntity && !e.isDeletedEntity) this.#entityIndex.set(e.idTagged, e);
          getInstanceData(e).resetAfterFlushed();
        }
        // Update the joinRows refs to reflect the new state
        for (const joinRow of Object.values(joinRowTodos)) {
          joinRow.resetAfterFlushed();
        }

        // Reset the find caches b/c data will have changed in the db
        this.#dataloaders = {};
        this.#rm.clear();
      }

      // Fixup the `deleted` field on entities that were created then immediately deleted
      for (const e of createdThenDeleted) getInstanceData(e).fixupCreatedThenDeleted();

      return [...allFlushedEntities];
    } catch (e) {
      if (e && typeof e === "object" && "constraint" in e && typeof e.constraint === "string") {
        const message = constraintNameToValidationError[e.constraint];
        if (message) {
          throw new ValidationErrors(message);
        }
      }
      if (e instanceof InMemoryRollbackError) return [...allFlushedEntities];
      throw e;
    } finally {
      this.#fl.releaseLock();
    }
  }

  /**
   * A very simple toJSON.
   *
   * This is not really meant to be useful, it's to prevent huge/circular output if
   * an EntityManager accidentally ends up getting logged to something like pino that
   * over-zealous toJSONs anything it touches.
   */
  public toJSON(): string {
    return `<EntityManager ${this.entities.length}>`;
  }

  /**
   * For all entities in the current `EntityManager`, load their latest data from the database.
   *
   * This is primarily useful in tests, i.e. having 1 `EntityManager` with some test data, running business
   * logic in a dedicated `EntityManager`, and then `refresh`-ing the test data `EntityManager` to assert
   * against the latest values.
   *
   * This works with primitive fields as well as references and collections.
   *
   * TODO Newly-found collection entries will not have prior load hints applied to this, unless using
   * `deepLoad` which should only be used by tests to avoid loading your entire database in memory.
   */
  async refresh(opts?: { deepLoad?: boolean }): Promise<void>;
  async refresh(entity: EntityW): Promise<void>;
  async refresh(entities: ReadonlyArray<EntityW>): Promise<void>;
  async refresh(param?: EntityW | ReadonlyArray<EntityW> | { deepLoad?: boolean }): Promise<void> {
    this.#dataloaders = {};
    this.#preloadedRelations = new Map();
    const deepLoad = param && "deepLoad" in param && param.deepLoad;
    let todo =
      param === undefined ? this.#entities : Array.isArray(param) ? param : isEntity(param) ? [param] : this.#entities;
    const done = new Set<Entity>();
    while (todo.length > 0) {
      const copy = [...todo];
      copy.forEach((e) => done.add(e));
      todo = [];

      // For any non-deleted entity with an id, get its latest data + relations from the database
      const entities = await Promise.all(
        copy
          .filter((e) => e.idTaggedMaybe && !e.isDeletedEntity)
          .map((entity) => {
            // Pass these as a hint to potentially preload them
            const hint = getRelationEntries(entity)
              .filter(([_, r]) => deepLoad || r.isLoaded)
              .map(([k]) => k);
            return loadDataLoader(this, getMetadata(entity), true).load({ entity: entity.idTagged, hint });
          }),
      );

      // Then refresh any loaded relations (the `loadDataLoader.load` only populates the
      // preloader cache, if in use, it doesn't actually get each relation into a loaded state.)
      const [custom, builtin] = partition(
        entities
          .filter((e) => e && !getInstanceData(e).isDeletedEntity)
          .flatMap((entity) => getRelations(entity!).filter((r) => deepLoad || r.isLoaded)),
        isCustomRelation,
      );
      // Call `.load` on builtin relations first, because if we hit an already-loaded custom relation
      // first, it will call `.get` internally, and might access built-in relations that we've not had a
      // chance to `.load()` yet.
      await Promise.all(
        builtin.map((r) => {
          // If the relation is already loaded, we need to go through .load({ forceReload }), otherwise
          // use preload to avoid the promise.
          if (r.isPreloaded && !r.isLoaded) {
            r.preload();
            return undefined;
          } else {
            return r.load({ forceReload: true });
          }
        }),
      );
      await Promise.all(custom.map((r) => r.load({ forceReload: true })));

      // If deep loading, get all entity/entities in the relation and push them on the list
      if (deepLoad) {
        todo.push(
          // We skip recursing into CustomCollections and CustomReferences and PersistedAsyncReferencesImpl for two reasons:
          // 1. It can be tricky to ensure `{ forceReload: true }` is passed all the way through their custom load
          // implementations, and so it's easy to have `.get` accidentally come across a not-yet-loaded collection, and
          // 2. Any custom load functions should use the underlying o2m/m2o/etc relations anyway, so if we crawl/refresh
          // those, then when the user calls `.get` on custom collections/references, they should be talking to always-loaded
          // relations, w/o us having to tackle the tricky bookkeeping problem passing `forceReload` all through their
          // custom load function + any other collections they call.
          ...builtin
            .filter((r) => "get" in r)
            .map((r) => (r as any).get)
            .flatMap((value) => (Array.isArray(value) ? value : [value]))
            .filter((value) => isEntity(value) && !done.has(value as Entity)),
        );
      }
    }
  }

  public get numberOfEntities(): number {
    return this.entities.length;
  }

  // Handles our Unit of Work-style look up / deduplication of entity instances.
  // Currently only public for the driver impls
  public findExistingInstance<T extends EntityW>(id: string): T | undefined {
    assertIdIsTagged(id);
    return this.#entityIndex.get(id) as T | undefined;
  }

  /**
   * Takes a result `row` from a custom query and maps the db values into a new-or-existing domain object for that row.
   *
   * The `overwriteExisting` controls whether `row`'s values should overwrite the existing fields on
   * an entity. By default this is true, as we assume the user calling this means they know the DB has
   * updated values that should be put into the entities. A few internal callers set this to false,
   * i.e. when we're loading collections and have db results that are potentially stale compared to
   * the WIP entity state.
   */
  public hydrate<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    rows: any[],
    options?: { overwriteExisting?: boolean },
  ): T[] {
    const maybeBaseMeta = getMetadata(type);

    let i = 0;
    const entities = new Array(rows.length);
    for (const row of rows) {
      const taggedId = keyToTaggedId(maybeBaseMeta, row["id"]) || fail("No id column was available");
      // See if this is already in our UoW
      let entity = this.findExistingInstance(taggedId) as T;
      if (!entity) {
        // Look for __class from the driver telling us which subtype to instantiate
        const meta = findConcreteMeta(maybeBaseMeta, row);
        // Pass id as a hint that we're in hydrate mode
        entity = new (asConcreteCstr(meta.cstr))(this, taggedId) as T;
        getInstanceData(entity).row = row;

        // This is a mini copy-paste of em.register that doesn't re-findExistingInstance
        this.#entityIndex.set(taggedId, entity as any);
        this.#entities.push(entity as any);
        if (this.#entities.length >= this.entityLimit) {
          throw new Error(`More than ${this.entityLimit} entities have been instantiated`);
        }
      } else if (options?.overwriteExisting === true) {
        // Usually if the entity already exists, we don't write over it, but in this case we assume that
        // `EntityManager.refresh` is telling us to explicitly load the latest data.
        // First swap out the old row with the new row
        getInstanceData(entity).row = row;
        // And then only refresh the data keys that have already been serde-d from rows
        // (this keeps us from deserializing data out of rows that we don't need).
        const { data, originalData } = getInstanceData(entity);
        const changedFields = (entity as any).changes.fields;
        for (const fieldName of Object.keys(data)) {
          const serde = getMetadata(entity).allFields[fieldName].serde ?? fail(`Missing serde for ${fieldName}`);
          serde.setOnEntity(data, row);
          // Make the field look not-dirty
          if (changedFields.includes(fieldName)) {
            delete originalData[fieldName];
          }
        }
      }
      entities[i++] = entity;
    }

    return entities;
  }

  /**
   * Mark an entity as needing to be flushed regardless of its state.
   *
   * This will:
   *
   * - Bump the entity's `updated_at` timestamp (if available),
   * - Run `beforeUpdate` and `beforeFlush` hooks.
   */
  public touch(entity: EntityW): void;
  public touch(entities: EntityW[]): void;
  public touch(entityOrEntities: EntityW | EntityW[]): void {
    for (const entity of toArray(entityOrEntities)) getInstanceData(entity).isTouched = true;
  }

  /**
   * Recalculates the reactive fields for an entity, and any downstream reactive fields that depend on them.
   *
   * You shouldn't need to call this unless the derived fields have drifted from the underlying data, which
   * should only happen if:
   *
   * - The underlying data was changed by a raw SQL query, or
   * - You've changed the field's business logic and want to update the database to the latest value.
   *
   * You can also trigger a recalc for specific fields by calling `.load()` on the property, i.e.
   * `author.numberOfBooks.load()`. This `recalc` method is just a helper method to call `load` for
   * all derived fields on the given entity/entities.
   */
  public recalc(entity: EntityW): Promise<void>;
  public recalc(entities: EntityW[]): Promise<void>;
  public async recalc(entityOrEntities: EntityW | EntityW[]): Promise<void> {
    // Look for async reactive fields
    const relations = toArray(entityOrEntities).flatMap((entity) =>
      Object.values(getMetadata(entity).allFields)
        .filter((f) => "derived" in f && f.derived === "async")
        .map((field) => (entity as any)[field.fieldName]),
    );
    // Use forceReload: true to tell ReactiveReferences to recalc against their full graph
    await Promise.all(relations.map((r: any) => r.load({ forceReload: true })));

    // And also sync reactive fields
    toArray(entityOrEntities).flatMap((entity) =>
      Object.values(getMetadata(entity).allFields)
        .filter((f) => "derived" in f && f.derived === "sync")
        .forEach((field) => {
          // This will be a noop if the value is the same
          setField(entity, field.fieldName, (entity as any)[field.fieldName]);
        }),
    );

    // `.load()` recalculated the immediate relations, go ahead and recalc any downstream fields.
    // We'll still defer ReactiveQueryFields to the em.flush loop.
    await this.#rm.recalcPendingDerivedValues("reactiveFields");
  }

  public beforeTransaction(fn: HookFn) {
    this.#hooks.beforeTransaction.push(fn);
  }

  public afterTransaction(fn: HookFn) {
    this.#hooks.afterTransaction.push(fn);
  }

  /**
   * Returns an EntityManager-scoped (i.e. request scoped) data loader.
   *
   * @param operation the operation being batched, i.e. `load` or `o2m-load`, to avoid clashing batch keys
   *   across fundamentally different operations
   * @param batchKey for a given operation, i.e. `load`, a batch key `Author` to batch all Author loads together
   * @param fn the batch load function, i.e. that will accept all `.load(...)`-d Author ids to load as a single db call
   * @param opts optional DataLoader options
   * @returns a DataLoader scoped to the `operation` + `batchKey` combination
   */
  public getLoader<K, V>(
    operation: string,
    batchKey: string,
    fn: BatchLoadFn<K, V>,
    opts?: Options<K, V>,
  ): DataLoader<K, V> {
    // If we wanted to, if not in a transaction, we could potentially do lookups against a global cache,
    // to achieve cross-request batching. Granted we'd need all DataLoaders to have caching disabled, see:
    // https://github.com/joist-orm/joist-orm/issues/629
    const loadersForKind = (this.#dataloaders[operation] ??= {});
    return getOrSet(loadersForKind, batchKey, () => new DataLoader(fn, opts));
  }

  public toString(): string {
    return "EntityManager";
  }

  /** Recursively cascades any pending deletions. */
  private async cascadeDeletes(): Promise<void> {
    let entities = this.#pendingCascadeDeletes;
    this.#pendingCascadeDeletes = [];
    const relationsToCleanup: AbstractRelationImpl<unknown, unknown>[] = [];
    // Loop if our deletes cascade to other deletes
    while (entities.length > 0) {
      // For cascade delete relations, cascade the delete...
      await Promise.all(
        entities.flatMap(getCascadeDeleteRelations).map((r) => r.load().then(() => r.maybeCascadeDelete())),
      );
      // Run the beforeDelete hook before we unhook the entity
      const todos = createTodos(entities);
      await beforeDelete(this.ctx, todos);
      // For all relations, unhook the entity from the other side
      relationsToCleanup.push(...entities.flatMap(getRelations));
      entities = this.#pendingCascadeDeletes;
      this.#pendingCascadeDeletes = [];
    }
    // For all relations, unhook the entity from the other side
    await Promise.all(relationsToCleanup.map((r) => r.cleanupOnEntityDeleted()));
  }

  setReactionLogging(logger: ReactionLogger): void;
  setReactionLogging(enabled: boolean): void;
  setReactionLogging(arg: boolean | ReactionLogger): void {
    this.#rm.setLogger(typeof arg === "boolean" ? (arg ? new ReactionLogger() : undefined) : arg);
  }

  setFieldLogging(logger: FieldLogger): void {
    this.#fieldLogger = logger;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.flush();
  }
}

/** Provides an internal API to the `EntityManager`. */
export interface EntityManagerInternalApi {
  joinRows: (m2m: ManyToManyCollection<any, any>) => JoinRows;

  /** Map of taggedId -> fieldName -> pending children. */
  pendingChildren: Map<string, Map<string, { adds: Entity[]; removes: Entity[] }>>;

  /** Map of taggedId -> fieldName -> join-loaded data. */
  getPreloadedRelation<U>(taggedId: string, fieldName: string): U[] | undefined;
  setPreloadedRelation<U>(taggedId: string, fieldName: string, children: U[]): void;

  hooks: Record<EntityManagerHook, HookFn[]>;
  rm: ReactionsManager;
  preloader: PreloadPlugin | undefined;
  isValidating: boolean;
  checkWritesAllowed: () => void;
  get fieldLogger(): FieldLogger | undefined;
}

export function getEmInternalApi(em: EntityManager): EntityManagerInternalApi {
  return (em as any)["__api"];
}

let defaultEntityLimit = 50_000;

export function getDefaultEntityLimit() {
  return defaultEntityLimit;
}

export function setDefaultEntityLimit(limit: number) {
  defaultEntityLimit = limit;
}

export function resetDefaultEntityLimit() {
  defaultEntityLimit = 50_000;
}

export function isKey(k: any): k is string {
  return typeof k === "string";
}

/** Compares `a` to `b`, where `b` might be an id. */
export function sameEntity(a: Entity | string | number | undefined, b: Entity | string | number | undefined): boolean {
  if (a === b) {
    return true;
  }
  if (a === undefined || b === undefined) {
    return a === undefined && b === undefined;
  }
  // If both are entities, return if they are the same reference
  if (isEntity(a) && isEntity(b)) {
    return a === b;
  }
  // Otherwise check by ID
  const aId = isEntity(a) ? a.idTaggedMaybe : a;
  const bId = isEntity(b) ? b.idTaggedMaybe : b;
  return aId === bId;
}

/** Thrown by `findOneOrFail`, 'load' & 'loadAll' if an entity is not found. */
export class NotFoundError extends Error {}

/** Thrown by `findOne` and `findOneOrFail` if more than one entity is found. */
export class TooManyError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * For the entities currently in `todos`, find any reactive validation rules that point
 * from the currently-changed entities back to each rule's originally-defined-in entity,
 * and ensure those entities are added to `todos`.
 */
async function validateReactiveRules(
  todos: Record<string, Todo>,
  joinRowTodos: Record<string, JoinRowTodo>,
): Promise<void> {
  // Use a map of rule -> Set<Entity> so that we only invoke a rule once per entity,
  // even if it was triggered by multiple changed fields.
  const fns: Map<ValidationRule<any>, Set<Entity>> = new Map();

  // From the given triggered entities, follow the entity's ReactiveRule back
  // to the reactive rules that need ran, and queue them in the `fn` map
  async function followAndQueue(triggered: Entity[], rule: ReactiveRule): Promise<void> {
    (await followReverseHint(triggered, rule.path))
      .filter((entity) => !entity.isDeletedEntity)
      .filter((e) => e instanceof rule.cstr)
      .forEach((entity) => {
        let entities = fns.get(rule.fn);
        if (!entities) {
          entities = new Set();
          fns.set(rule.fn, entities);
        }
        entities.add(entity);
      });
  }

  const p1 = Object.values(todos).flatMap((todo) => {
    const entities = [...todo.inserts, ...todo.updates, ...todo.deletes];
    // Find each statically-declared reactive rule for the given entity type
    const rules = getBaseSelfAndSubMetas(todo.metadata).flatMap((m) => m.config.__data.reactiveRules);
    return rules.map((rule) => {
      // Of all changed entities of this type, how many specifically trigger this rule?
      const triggered = entities.filter(
        (e) =>
          // If the rule is for a different subtype, skip it
          e instanceof rule.source &&
          (e.isNewEntity ||
            e.isDeletedEntity ||
            ((e as any).changes as Changes<any>).fields.some((f) => rule.fields.includes(f))),
      );
      // From these "triggered" entities, queue the "found"/owner entity to rerun this rule
      return followAndQueue(triggered, rule);
    });
  });

  const p2 = Object.values(joinRowTodos).flatMap((todo) => {
    // Cheat and use `Object.values` + `filter instanceof BaseEntity` to handle the variable keys
    const entities: Entity[] = [...todo.newRows, ...todo.deletedRows]
      .flatMap((jr) => Object.values(jr))
      .filter((e) => e instanceof BaseEntity) as any;
    // Do the first side
    const p1 = getBaseAndSelfMetas(todo.m2m.meta)
      .flatMap((m) => m.config.__data.reactiveRules)
      .filter((rule) => rule.fields.includes(todo.m2m.fieldName))
      .map((rule) => {
        const triggered = entities.filter((e) => e instanceof todo.m2m.meta.cstr);
        return followAndQueue(triggered, rule);
      });
    // And the second side
    const p2 = getBaseAndSelfMetas(todo.m2m.otherMeta)
      .flatMap((m) => m.config.__data.reactiveRules)
      .filter((rule) => rule.fields.includes(todo.m2m.otherFieldName))
      .map((rule) => {
        const triggered = entities.filter((e) => e instanceof todo.m2m.otherMeta.cstr);
        return followAndQueue(triggered, rule);
      });
    return [...p1, ...p2];
  });

  await Promise.all([...p1, ...p2]);

  // Now that we've found the fn+entities to run, run them and collect any errors
  const p3 = [...fns.entries()].flatMap(([fn, entities]) =>
    [...entities].map(async (entity) => coerceError(entity, await fn(entity))),
  );
  const errors = (await Promise.all(p3)).flat();
  if (errors.length > 0) {
    throw new ValidationErrors(errors);
  }
}

// Run *non-reactive* (those with `fields: undefined`) rules of explicitly mutated entities,
// because even for reactive validations on mutated entities, we defer to addReactiveValidations
// to mark only the rules that need to run.
async function validateSimpleRules(todos: Record<string, Todo>): Promise<void> {
  const p = Object.values(todos).flatMap(({ inserts, updates }) => {
    return [...inserts, ...updates]
      .filter((e) => !e.isDeletedEntity)
      .flatMap((entity) => {
        const rules = getBaseAndSelfMetas(getMetadata(entity)).flatMap((m) => m.config.__data.rules);
        return rules
          .filter((rule) => rule.hint === undefined)
          .flatMap(async ({ fn }) => coerceError(entity, await fn(entity)));
      });
  });
  const errors = (await Promise.all(p)).flat();
  if (errors.length > 0) {
    throw new ValidationErrors(errors);
  }
}

export function beforeTransaction(em: EntityManager, knex: Knex.Transaction): Promise<unknown> {
  return Promise.all(getEmInternalApi(em).hooks.beforeTransaction.map((fn) => fn(em, knex)));
}

export function afterTransaction(em: EntityManager, knex: Knex.Transaction): Promise<unknown> {
  return Promise.all(getEmInternalApi(em).hooks.afterTransaction.map((fn) => fn(em, knex)));
}

async function runHookOnTodos(
  ctx: unknown,
  hook: EntityHook,
  todos: Record<string, Todo>,
  keys: ("inserts" | "deletes" | "updates")[],
): Promise<void> {
  const entities = Object.values(todos).flatMap((todo) => {
    return keys.flatMap((k) => todo[k].filter((e) => k === "deletes" || !e.isDeletedEntity));
  });
  return runHook(ctx, hook, entities);
}

async function runHook(ctx: unknown, hook: EntityHook, entities: EntityW[]): Promise<void> {
  const p = entities.flatMap((entity) => {
    const hookFns = getBaseAndSelfMetas(getMetadata(entity)).flatMap((m) => m.config.__data.hooks[hook]);
    // Use an explicit `async` here to ensure all hooks are promises, i.e. so that a non-promise
    // hook blowing up doesn't orphan the others .
    return hookFns.map(async (fn) => fn(entity, ctx as any));
  });
  // Use `allSettled` so that even if 1 hook blows up, we don't orphan other hooks mid-flush
  const rejects = (await Promise.allSettled(p)).filter((r) => r.status === "rejected");
  // For now just throw the 1st rejection; this should be pretty rare
  if (rejects.length > 0 && rejects[0].status === "rejected") {
    throw rejects[0].reason;
  }
}

function beforeDelete(ctx: unknown, todos: Record<string, Todo>): Promise<unknown> {
  return runHookOnTodos(ctx, "beforeDelete", todos, ["deletes"]);
}

function beforeFlush(ctx: unknown, todos: Record<string, Todo>): Promise<unknown> {
  return runHookOnTodos(ctx, "beforeFlush", todos, ["inserts", "updates"]);
}

function beforeCreate(ctx: unknown, todos: Record<string, Todo>): Promise<unknown> {
  return runHookOnTodos(ctx, "beforeCreate", todos, ["inserts"]);
}

function beforeUpdate(ctx: unknown, todos: Record<string, Todo>): Promise<unknown> {
  return runHookOnTodos(ctx, "beforeUpdate", todos, ["updates"]);
}

function afterValidation(ctx: unknown, todos: Record<string, Todo>): Promise<unknown> {
  return runHookOnTodos(ctx, "afterValidation", todos, ["inserts", "updates"]);
}

function beforeCommit(ctx: unknown, entities: Set<EntityW>): Promise<unknown> {
  return runHook(ctx, "beforeCommit", [...entities]);
}

function afterCommit(ctx: unknown, entities: Set<EntityW>): Promise<unknown> {
  return runHook(ctx, "afterCommit", [...entities]);
}

function coerceError(entity: Entity, maybeError: ValidationRuleResult<any>): ValidationError[] {
  if (maybeError === undefined) {
    return [];
  } else if (typeof maybeError === "string") {
    return [{ entity, message: maybeError }];
  } else if (Array.isArray(maybeError)) {
    return maybeError.map((e) => {
      if (typeof e === "string") {
        return { entity, message: e };
      } else {
        return { entity, ...e };
      }
    });
  } else {
    return [{ entity, ...maybeError }];
  }
}

/** Evaluates each (non-async) derived field to see if it's value has changed. */
function recalcSynchronousDerivedFields(todos: Record<string, Todo>) {
  const entities = Object.values(todos)
    .flatMap((todo) => [...todo.inserts, ...todo.updates])
    .filter((e) => !e.isDeletedEntity);
  const derivedFieldsByMeta = new Map(
    [...new Set(entities.map(getMetadata))].map((m) => {
      return [
        m,
        Object.values(m.allFields)
          .filter((f) => (f.kind === "primitive" || f.kind === "enum") && f.derived === "sync")
          .map((f) => f.fieldName),
      ];
    }),
  );

  for (const entity of entities) {
    const derivedFields = derivedFieldsByMeta.get(getMetadata(entity)) || [];
    derivedFields.forEach((fieldName) => {
      // setField will intelligently mark/not mark the field as dirty.
      setField(entity, fieldName as any, (entity as any)[fieldName]);
    });
  }
}

/** Recursively crawls through `entity`, with the given populate `deep` hint, and adds anything found to `found`. */
async function crawl<T extends Entity>(
  found: Entity[],
  entities: readonly T[],
  deep: LoadHint<T>,
  opts?: { skipIf?: (entity: Entity) => boolean },
): Promise<void> {
  const { skipIf = () => false } = opts ?? {};
  const entitiesToClone = entities.filter((e) => !skipIf(e));
  found.push(...entitiesToClone);
  await Promise.all(
    entitiesToClone.flatMap((entity) =>
      (Object.entries(adaptHint(deep)) as [keyof RelationsIn<T> & string, LoadHint<any>][]).map(
        async ([relationName, nested]) => {
          const relation = entity[relationName];
          if (relation instanceof OneToManyCollection) {
            const relatedEntities: readonly Entity[] = await relation.load();
            await crawl(found, relatedEntities, nested, opts);
          } else if (relation instanceof OneToOneReferenceImpl) {
            const related: Entity | undefined = await relation.load();
            if (related) {
              await crawl(found, [related], nested, opts);
            }
          } else if (relation instanceof ManyToOneReferenceImpl) {
            const related: Entity | undefined = await relation.load();
            if (related) {
              await crawl(found, [related], nested, opts);
            }
          } else if (relation instanceof ReactiveReferenceImpl) {
            const relatedEntities: readonly Entity[] = await relation.load();
            await crawl(found, relatedEntities, nested, opts);
          } else {
            fail(`Uncloneable relation: ${relationName}`);
          }
        },
      ),
    ),
  );
}

/** Takes our flexible string or array or hash load hint and makes it always a hash. */
function adaptHint<T extends Entity>(hint: LoadHint<T> | undefined): NestedLoadHint<T> {
  if ((typeof hint as any) === "string") {
    return { [hint as any]: {} } as any;
  } else if (Array.isArray(hint)) {
    return Object.fromEntries(hint.map((relation) => [relation, {}]));
  } else if (hint) {
    return hint as NestedLoadHint<T>;
  } else {
    return {};
  }
}

export function isDefined<T extends any>(param: T | undefined | null): param is T {
  return param !== null && param !== undefined;
}

function getCascadeDeleteRelations(entity: Entity): AbstractRelationImpl<any, any>[] {
  return getBaseAndSelfMetas(getMetadata(entity)).flatMap((meta) => {
    return meta.config.__data.cascadeDeleteFields.map((fieldName) => (entity as any)[fieldName]);
  });
}

function isCustomRelation(r: AbstractRelationImpl<any, any>): boolean {
  return r instanceof CustomCollection || r instanceof CustomReference || r instanceof ReactiveReferenceImpl;
}

function maybeBumpUpdatedAt(todos: Record<string, Todo>, now: Date): void {
  for (const todo of Object.values(todos)) {
    const { updatedAt } = todo.metadata.timestampFields;
    if (updatedAt) {
      for (const e of todo.updates) {
        // We avoid going through `setField` because in unit tests, it might detect that our
        // bump's timestamp isn't actually different from the current value, and skip treating
        // it has changed. This is technically true, but this will break the oplock SQL generation,
        // so force the field to be dirty.
        const orm = getInstanceData(e);
        orm.originalData[updatedAt] = getField(e, updatedAt);
        const serde = todo.metadata.fields[updatedAt].serde as TimestampSerde<unknown>;
        orm.data[updatedAt] = serde.mapFromDate(now);
      }
    }
  }
}

let lastNow = new Date();

function getNow(): Date {
  let now = new Date();
  // If we detect time has not progressed (or went backwards), we're probably in test that
  // has frozen time, which can throw off our oplocks b/c if Joist issues multiple `UPDATE`s
  // with exactly the same `updated_at`, the `updated_at` SQL trigger fallback will think "the caller
  // didn't self-manage `updated_at`" and so bump it for them. Which is fine, but now
  // Joist doesn't know about the bumped time, and the 2nd `UPDATE` will fail.
  if (lastNow.getTime() === now.getTime() || now.getTime() < lastNow.getTime()) {
    now = new Date(lastNow.getTime() + 1);
  }
  lastNow = now;
  return now;
}

/** Given a `row` from the db, resolves the CTI/STI subtype, if applicable. */
function findConcreteMeta(maybeBaseMeta: EntityMetadata, row: any): EntityMetadata {
  // Common case of no CTI or STI inheritance
  if (!row.__class && maybeBaseMeta.inheritanceType !== "sti") {
    return maybeBaseMeta;
  }
  if (row.__class) {
    // Look for the CTI __class from the driver telling us which subtype to instantiate
    return maybeBaseMeta.subTypes.find((st) => st.type === row.__class) ?? maybeBaseMeta;
  } else if (maybeBaseMeta.inheritanceType === "sti") {
    // Look for the STI discriminator value
    const baseMeta = getBaseMeta(maybeBaseMeta);
    const field = baseMeta.fields[baseMeta.stiDiscriminatorField!];
    if (field.kind !== "enum") throw new Error("Discriminator field must be an enum");
    const columnName = field.serde.columns[0].columnName;
    const value = row[columnName];
    return baseMeta.subTypes.find((st) => st.stiDiscriminatorValue === value) ?? baseMeta;
  } else {
    throw new Error("Unknown inheritance type");
  }
}

/** Sets the `Animal.type` enum to the right subtype value. */
function setStiDiscriminatorValue(baseMeta: EntityMetadata, entity: Entity): void {
  const typeName = entity.constructor.name;
  const st = baseMeta.subTypes.find((st) => st.type === typeName);
  if (st) {
    const field = baseMeta.fields[baseMeta.stiDiscriminatorField!] as EnumField;
    const code = (field.enumDetailType.findById(st.stiDiscriminatorValue!) as any).code;
    (entity as any)[baseMeta.stiDiscriminatorField!] = code;
  } else {
    (entity as any)[baseMeta.stiDiscriminatorField!] = undefined;
  }
}

function findPendingFlushEntities<Entity extends EntityW>(
  entities: readonly Entity[],
  hooksInvoked: Set<Entity>,
  pendingFlush: Set<Entity>,
  pendingHooks: Set<Entity>,
  alreadyRanHooks: Set<Entity>,
): void {
  for (const e of entities) {
    if (getInstanceData(e).pendingOperation !== "none") {
      if (!hooksInvoked.has(e)) {
        pendingHooks.add(e);
      } else {
        alreadyRanHooks.add(e);
      }
      pendingFlush.add(e);
    }
  }
}

/** An error we throw to get knex to `ROLLBACK`, but then catch. */
class InMemoryRollbackError extends Error {}

/** An error thrown when `em.mode === "read-only"` but entities are mutated/flushed. */
export class ReadOnlyError extends Error {
  constructor() {
    super("EntityManager is read-only");
  }
}
