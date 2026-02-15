import DataLoader, { BatchLoadFn, Options } from "dataloader";
import { getInstanceData } from "./BaseEntity";
import { setAsyncDefaults, setSyncDefaults } from "./defaults";
import { getField, setField } from "./fields";
import { IndexManager } from "./IndexManager";
// We alias `Entity => EntityW` to denote "Entity wide" i.e. the non-narrowed Entity
import { getReactiveRules } from "./caches";
import { constraintNameToValidationError, ReactiveRule } from "./config";
import { getConstructorFromTag, getMetadataForType } from "./configure";
import { findByUniqueDataLoader, findByUniqueOperation } from "./dataloaders/findByUniqueDataLoader";
import { findCountDataLoader, findCountOperation } from "./dataloaders/findCountDataLoader";
import { findDataLoader, findOperation } from "./dataloaders/findDataLoader";
import { findIdsDataLoader, findIdsOperation } from "./dataloaders/findIdsDataLoader";
import { entityMatches, findOrCreateDataLoader } from "./dataloaders/findOrCreateDataLoader";
import { lensOperation } from "./dataloaders/lensDataLoader";
import { loadDataLoader, loadOperation } from "./dataloaders/loadDataLoader";
import { manyToManyLoadOperation } from "./dataloaders/manyToManyDataLoader";
import { manyToManyFindOperation } from "./dataloaders/manyToManyFindDataLoader";
import { oneToManyLoadOperation } from "./dataloaders/oneToManyDataLoader";
import { oneToManyFindOperation } from "./dataloaders/oneToManyFindDataLoader";
import { oneToOneLoadOperation } from "./dataloaders/oneToOneDataLoader";
import { populateDataLoader, populateOperation } from "./dataloaders/populateDataLoader";
import { recursiveChildrenOperation } from "./dataloaders/recursiveChildrenDataLoader";
import { recursiveParentsOperation } from "./dataloaders/recursiveParentsDataLoader";
import { Driver } from "./drivers";
import { Entity, Entity as EntityW, IdType, isEntity } from "./Entity";
import { FlushLock } from "./FlushLock";
import {
  asConcreteCstr,
  assertLoaded,
  Column,
  CustomCollection,
  CustomReference,
  deepNormalizeHint,
  DeepPartialOrNull,
  EntityHook,
  EntityMetadata,
  EnumField,
  ExpressionFilter,
  Field,
  FieldLogger,
  FieldLoggerWatch,
  FilterWithAlias,
  getBaseAndSelfMetas,
  getBaseMeta,
  getConstructorFromTaggedId,
  getMetadata,
  getRelationEntries,
  getRelations,
  GraphQLFilterOf,
  GraphQLFilterWithAlias,
  InstanceData,
  isLoadedReference,
  keyToTaggedId,
  Lens,
  loadLens,
  OneToManyCollection,
  ParsedFindQuery,
  parseFindQuery,
  PartialOrNull,
  Plugin,
  PolymorphicReferenceImpl,
  ReactionLogger,
  ReactiveHint,
  Reference,
  setOpts,
  tagId,
  TimestampSerde,
  toTaggedId,
  UniqueFilter,
  ValidationError,
  ValidationErrors,
  ValidationRule,
  ValidationRuleResult,
} from "./index";
import { IsLoadedCache } from "./IsLoadedCache";
import { JoinRows, ManyToManyLike } from "./JoinRows";
import { Loaded, LoadHint, NestedLoadHint, New, RelationsIn } from "./loadHints";
import { WriteFn } from "./logging/FactoryLogger";
import { newEntity } from "./newEntity";
import { resetFactoryCreated } from "./newTestInstance";
import { PluginManager } from "./PluginManager";
import { PreloadPlugin } from "./plugins/PreloadPlugin";
import { ReactionsManager } from "./ReactionsManager";
import { followReverseHint } from "./reactiveHints";
import { ManyToOneReferenceImpl, OneToOneReferenceImpl, ReactiveReferenceImpl } from "./relations";
import { AbstractRelationImpl } from "./relations/AbstractRelationImpl";
import { Collection } from "./relations/Collection";
import { AsyncMethodPopulateSecret } from "./relations/hasAsyncMethod";
import { combineJoinRows, createTodos, JoinRowTodo, Todo } from "./Todo";
import { runInTrustedContext } from "./trusted";
import { OptsOf, OrderOf } from "./typeMap";
import { upsert } from "./upsert";
import { assertNever, fail, failIfAnyRejected, getOrSet, groupBy, MaybePromise, partition, toArray } from "./utils";

// polyfill
(Symbol as any).asyncDispose ??= Symbol("Symbol.asyncDispose");

/**
 * The constructor for concrete entity types.
 *
 * Abstract entity types, like a base `Publisher` class that is marked `abstract`, cannot
 * implement this and instead only have the `AbsEntityConstructor` type.
 */
export interface EntityConstructor<T> {
  /** The pseudo-public constructor for entities; only the `EntityManager` should actually instantiate entities. */
  new (em: EntityManager<any, any, any>): T;

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
export type MaybeAbstractEntityConstructor<T> = abstract new (em: EntityManager<any, any, any>, opts: any) => T;

/** Pulls the entity's id type out of a given entity type T. */
export type IdOf<T> = T extends { id: infer I } ? I : never;

export type TaggedId = string;

export function isId(value: any): value is IdOf<unknown> {
  return value && typeof value === "string";
}

export type EntityManagerHook = "beforeBegin" | "afterBegin" | "beforeCommit" | "afterCommit";

type HookFn<TX> = (em: EntityManager, txn: TX) => MaybePromise<any>;

export type LoaderCache = Record<string, DataLoader<any, any>>;

export interface TimestampFields {
  updatedAt: string | undefined;
  createdAt: string | undefined;
  deletedAt: string | undefined;
}

export type EntityManagerOpts<TX = unknown> = (
  | { driver: Driver<TX>; em?: undefined }
  | { driver?: undefined; em: EntityManager<any, any, any> }
) & { preloadPlugin?: PreloadPlugin };

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

export type FindOperation =
  | typeof findOperation
  | "findPaginated"
  | typeof findByUniqueOperation
  | typeof findCountOperation
  | typeof findIdsOperation
  | typeof lensOperation
  | typeof loadOperation
  | typeof manyToManyLoadOperation
  | typeof manyToManyFindOperation
  | typeof oneToManyLoadOperation
  | typeof oneToManyFindOperation
  | typeof oneToOneLoadOperation
  | typeof populateOperation
  | typeof recursiveChildrenOperation
  | typeof recursiveParentsOperation;
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
 * @typeParam C - the application-specific context (typically the request-level context)
 * @typeParam Entity - the application's based entity type (i.e. with number ids or string ids)
 * @typeParamTX - the application's Transaction type, i.e. `Knex`
 */
export class EntityManager<C = unknown, Entity extends EntityW = EntityW, TX extends unknown = unknown> {
  public readonly ctx: C;
  public driver: Driver<TX>;
  /** When we're flushing, the connection/transaction. */
  public txn: TX | undefined;
  public entityLimit: number = defaultEntityLimit;
  readonly #entitiesArray: Entity[] = [];
  // Indexes the currently loaded entities by their tagged ids and `toTaggedString` ids (i.e. `a#`). This fixes
  // real-world performance issues where `findExistingInstance` scanning `#entities` was an `O(n^2)`.
  readonly #entitiesById: Map<string, Entity> = new Map();
  readonly #entitiesByTag: Map<string, Entity[]> = new Map();
  // Provides field-based indexing for entity types with >1000 entities to optimize findWithNewOrChanged
  readonly #indexManager = new IndexManager();
  #isValidating: boolean = false;
  readonly #pendingPercolate: Map<string, Map<string, { adds: Entity[]; removes: Entity[] }>> = new Map();
  #preloadedRelations: Map<string, Map<string, Entity[]>> = new Map();
  /**
   * Tracks cascade deletes.
   *
   * We originally used a beforeDelete lifecycle hook to implement this, but tracking this
   * individually allows us to a) recursively cascade deletes even during the 1st iteration
   * of our `flush` loop, and b) cascade deletions before we recalc fields & run user hooks,
   * so that both see the most accurate state.
   */
  #pendingDeletes: Entity[] = [];
  #dataloaders: Record<string, LoaderCache> = {};
  readonly #joinRows: Record<string, JoinRows> = {};
  /** Stores any `source -> downstream` reactions to recalc during `em.flush`. */
  readonly #rm = new ReactionsManager(this);
  /** Ensures our `em.flush` method is not interrupted. */
  readonly #fl = new FlushLock();
  readonly #hooks: Record<EntityManagerHook, HookFn<any>[]> = {
    beforeBegin: [],
    afterBegin: [],
    beforeCommit: [],
    afterCommit: [],
  };
  readonly #preloader: PreloadPlugin | undefined;
  #fieldLogger: FieldLogger | undefined;
  #isLoadedCache = new IsLoadedCache();
  #merging: Set<EntityW> | undefined;
  /** Track `a#1`, `a#2`, etc indexes for `em.create`-d entities. */
  #createCounter: Map<string, number> | undefined = undefined;
  private __api: EntityManagerInternalApi;
  #isRefreshing = false;
  mode: EntityManagerMode = "writes";

  constructor(ctx: C, opts: EntityManagerOpts<TX>);
  constructor(ctx: C, driver: Driver<TX>);
  constructor(ctx: C, driverOrOpts: EntityManagerOpts<TX> | Driver<TX>) {
    const opts = (
      driverOrOpts.constructor === Object ? driverOrOpts : { driver: driverOrOpts }
    ) as EntityManagerOpts<TX>;
    this.ctx = ctx;
    this.driver = opts.driver ?? opts.em!.driver;
    this.#preloader = opts.preloadPlugin ?? (opts.em ? opts.em.#preloader : this.driver.defaultPlugins.preloadPlugin);

    const pluginManager = new PluginManager(this);

    if (opts.em) {
      this.#hooks = {
        beforeBegin: [...opts.em.#hooks.beforeBegin],
        afterBegin: [...opts.em.#hooks.afterBegin],
        beforeCommit: [...opts.em.#hooks.beforeCommit],
        afterCommit: [...opts.em.#hooks.afterCommit],
      };
      opts.em.__api.pluginManager.cloneTo(pluginManager);
    }

    // Expose some of our private fields as the EntityManagerInternalApi
    const em = this;

    this.__api = {
      preloader: this.#preloader,
      pendingPercolate: this.#pendingPercolate,
      mutatedCollections: new Set(),
      pendingLoads: new Set(),
      hooks: this.#hooks,
      rm: this.#rm,
      indexManager: this.#indexManager,
      isLoadedCache: this.#isLoadedCache,
      pluginManager,

      isMerging(entity: EntityW): boolean {
        return em.#merging?.has(entity) ?? false;
      },

      joinRows(m2m: ManyToManyLike): JoinRows {
        return getOrSet(em.#joinRows, m2m.joinTableName, () => new JoinRows(m2m, em.#rm));
      },

      /** Returns `a:1.books` if it's in our preload cache. */
      getPreloadedRelation<U>(taggedId: string, fieldName: string): U[] | undefined {
        return em.#preloadedRelations.get(taggedId)?.get(fieldName) as U[] | undefined;
      },

      /** Stores `a:1.books` in our preload cache. */
      setPreloadedRelation<U>(taggedId: string, fieldName: string, children: U[]): void {
        let map = em.#preloadedRelations.get(taggedId);
        if (!map) {
          map = new Map();
          em.#preloadedRelations.set(taggedId, map);
        }
        map.set(fieldName, children as any);
      },

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

      clearDataloaders() {
        em.#dataloaders = {};
      },

      clearPreloadedRelations() {
        em.#preloadedRelations = new Map();
      },

      setIsRefreshing(isRefreshing: boolean) {
        em.#isRefreshing = isRefreshing;
      },
    };
  }

  /** Returns a read-only shallow copy of the currently-loaded entities. */
  get entities(): ReadonlyArray<Entity> {
    return [...this.#entitiesArray];
  }

  /** Returns a read-only list of the currently-loaded entities of `type`. */
  getEntities<T extends Entity>(type: MaybeAbstractEntityConstructor<T>): ReadonlyArray<T> {
    const meta = getMetadata(type);
    const entities = this.#entitiesByTag.get(meta.tagName) ?? [];
    // If we're a subtype, `entities` might have base/other subtypes
    return (meta.baseType ? entities.filter((e) => e instanceof type) : entities) as T[];
  }

  /** Looks up `id` in the list of already-loaded entities. */
  getEntity<T extends Entity & { id: string }>(id: IdOf<T>): T | undefined;
  getEntity(id: TaggedId): Entity | undefined;
  getEntity(id: TaggedId): Entity | undefined {
    // Skip this both for performance + we allow toTaggedString-style `a#1` ids
    // assertIdIsTagged(id);
    return this.#entitiesById.get(id);
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
    const result = await findDataLoader(this, type, settings, populate)
      .load(settings)
      .catch(function find(err) {
        throw appendStack(err, new Error());
      });
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
    const meta = getMetadata(type);
    const query = parseFindQuery(meta, where, rest);
    const rows = await this.executeFind(meta, "findPaginated", query, { limit, offset });
    // check row limit
    const result = this.hydrate(type, rows);
    if (populate) {
      await this.populate(result, populate);
    }
    return result;
  }

  private async executeFind(
    meta: EntityMetadata,
    operation: FindOperation,
    parsed: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ) {
    const { pluginManager } = getEmInternalApi(this);
    pluginManager.beforeFind(meta, operation, parsed, settings);
    const rows = await this.driver.executeFind(this, parsed, settings);
    pluginManager.afterFind(meta, operation, rows);
    return rows;
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
    options?: FindFilterOptions<T> & { populate?: H },
  ): Promise<Loaded<T, H> | undefined>;
  async findOne<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options?: FindFilterOptions<T> & { populate?: any },
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
    options: FindFilterOptions<T> & { populate?: H },
  ): Promise<Loaded<T, H>>;
  async findOneOrFail<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options?: FindFilterOptions<T> & { populate?: any },
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
    const row = await findByUniqueDataLoader(this, type, field, softDeletes)
      .load(value)
      .catch(function findByUnique(err) {
        throw appendStack(err, new Error());
      });
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
    let count = await findCountDataLoader(this, type, settings)
      .load(settings)
      .catch(function findCount(err) {
        throw appendStack(err, new Error());
      });
    // If the user is do "count all", we can adjust the number up/down based on
    // WIP creates/deletes. We can't do this if the WHERE clause is populated b/c
    // then we'd also have to eval each created/deleted entity against the WHERE
    // clause before knowing if it should adjust teh amount.
    const isSelectAll = Object.keys(where).length === 0;
    if (isSelectAll) {
      const tagged = this.#entitiesByTag.get(getMetadata(type).tagName) ?? [];
      for (const entity of tagged) {
        // Still do an `instanceof` to handle subtypes
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
   * Returns the IDs of entities that match the `where` clause.
   *
   * The `where` clause, and any options.conditions, matches the same syntax
   * as `em.find`.
   */
  async findIds<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options: FindCountFilterOptions<T> = {},
  ): Promise<string[]> {
    const settings = { where, ...options };
    return findIdsDataLoader(this, type, settings)
      .load(settings)
      .catch(function findIds(err) {
        throw appendStack(err, new Error());
      });
  }

  /**
   * Looks for entities that match `where`, both in the database and any just-created or just-changed entities.
   *
   * Because we evaluate this `where` clause in memory (against any WIP changes made to entities
   * that have not yet been `em.flush`ed to the database), the `where` clause is limited to fields
   * immediately available on the entity, i.e. primitives, enums, and many-to-ones, without any
   * nested, cross-table joins/conditions.
   *
   * For `m2o` fields, `undefined` will be pruned, just like `em.find`s. I.e. `{ publisher: undefined }` will
   * be pruned and not filter on `publisher` at all, where as `{ publisher: null }` will filter for `publisher`
   * is unset.
   *
   * @param type the entity type to find
   * @param where the fields to look up the existing entity by
   */
  async findWithNewOrChanged<T extends Entity, F extends Partial<OptsOf<T>>>(
    type: EntityConstructor<T>,
    where: F,
  ): Promise<T[]>;
  async findWithNewOrChanged<T extends Entity, F extends Partial<OptsOf<T>>, const H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    where: F,
    options?: { populate?: H; softDeletes?: "include" | "exclude" },
  ): Promise<Loaded<T, H>[]>;
  async findWithNewOrChanged<T extends Entity, F extends Partial<OptsOf<T>>, const H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    where: F,
    options?: { populate?: H; softDeletes?: "include" | "exclude" },
  ): Promise<T[]> {
    const { softDeletes = "exclude", populate } = options ?? {};
    // Make a copy of `where` because `em.find` will re-write new entities to `-1`, that our `entityMatches` could still match
    // ...and also prune `undefined` here, since `em.find` will do it anyway, but `entityMatches` does not.
    const copy: any = Object.fromEntries(Object.entries(where).filter(([, v]) => v !== undefined));
    const persisted = await this.find(type, copy, { softDeletes });
    const unchanged = persisted.filter((e) => !e.isNewEntity && !e.isDirtyEntity && !e.isDeletedEntity);
    const maybeNew = this.filterEntities<T>(type, where).filter(
      (e) => (e.isNewEntity || e.isDirtyEntity) && !e.isDeletedEntity,
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
    const entity = await findOrCreateDataLoader(this, type, where, softDeletes)
      .load({ ifNew: ifNew as OptsOf<T>, upsert })
      .catch(function findOrCreate(err) {
        throw appendStack(err, new Error());
      });
    if (populate) {
      await this.populate(entity, populate);
    }
    return entity;
  }

  /** Creates a new `type` and marks it as loaded, i.e. we know its collections are all safe to access in memory. */
  public create<T extends EntityW, O extends OptsOf<T>>(type: EntityConstructor<T>, opts: O): New<T, O> {
    return this.#doCreate(type, opts, false) as New<T, O>;
  }

  /**
   * Creates a new `type` but with `opts` that are nullable, to accept partial-update-style input.
   *
   * Note that `createPartial` doesn't support the full upsert behavior, i.e. this method:
   *
   * - always creates,
   * - does not support relation markers like `op`, `delete`, and `remove`,
   * - does not accept deep input, but
   * - fields set to `undefined` will be skipped instead of unset
   *
   * See `upsert` for the upsert/deep upsert behavior.
   */
  public createPartial<T extends EntityW>(type: EntityConstructor<T>, opts: PartialOrNull<OptsOf<T>>): T {
    return this.#doCreate(type, opts, true);
  }

  /**
   * Create or updates `type` based on partial-update-style `input`.
   *
   * This supports upsert behavior, i.e.:
   *
   * - findOrCreate the primary entity being updated (based on the `id` key being provided),
   * - upsert relation markers like `op`, `delete`, and `remove` are supported,
   * - deep input is supported, i.e. `{ firstName: "Bob", books: [{ title: "b1" } ] }`, and
   * - fields set to `undefined` will be skipped instead of unset
   */
  public upsert<T extends EntityW>(type: EntityConstructor<T>, input: DeepPartialOrNull<T>): Promise<T> {
    return upsert(this, type, input);
  }

  /**
   * Utility to clone an entity and its nested relations, as determined by a populate hint
   *
   * @param entity - Any entity
   * @param opts - Options to control the clone behaviour
   *   @param deep - Populate hint of the nested tree of objects to clone
   *   @param skip - Keys that will be skipped in the clone
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
  public async clone<T extends Entity, H extends LoadHint<T>, const K = ReactiveHint<T>>(
    entity: T,
    opts?: {
      deep?: H;
      skip?: K;
      skipIf?: (entity: Entity) => boolean;
      postClone?: (original: Entity, clone: Entity) => void;
    },
  ): Promise<Loaded<T, H>>;

  /**
   * Utility to clone an entity and its nested relations, as determined by a populate hint.
   *
   * @param entities - Any homogeneous list of entities
   * @param opts - Options to control the clone behaviour
   *   @param deep - Populate hint of the nested tree of objects to clone
   *   @param skip - Keys that will be skipped in the clone
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
  public async clone<T extends Entity, H extends LoadHint<T>, const K = ReactiveHint<T>>(
    entities: readonly T[],
    opts?: {
      deep?: H;
      skip?: K;
      skipIf?: (entity: Entity) => boolean;
      postClone?: (original: Entity, clone: Entity) => void;
    },
  ): Promise<Loaded<T, H>[]>;

  public async clone<T extends Entity, H extends LoadHint<T>>(
    entityOrArray: T | readonly T[],
    opts?: {
      deep?: H;
      skip?: object;
      skipIf?: (entity: Entity) => boolean;
      postClone?: (original: Entity, clone: Entity) => void;
    },
  ): Promise<Loaded<T, H> | Loaded<T, H>[]> {
    const { deep = {}, skipIf, skip = {}, postClone } = opts ?? {};
    // Keep a list that we can work against synchronously after doing the async find/crawl
    const todo = new Set<Entity>();
    const skipMap = new WeakMap<Entity, string[]>();

    // 1. Find all entities w/o mutating them yet
    await crawl(todo, skipMap, Array.isArray(entityOrArray) ? entityOrArray : [entityOrArray], deep, {
      skipIf: skipIf as any,
      skip,
    });

    // 2. Clone each found entity
    const clones = [...todo].map((entity) => {
      const skip = skipMap.get(entity) ?? [];
      // Use meta.fields to see which fields are derived (i.e. createdAt, updatedAt, initials)
      // that only have getters, and so we shouldn't set (createdAt/updatedAt will be initialized
      // by `em.register`).
      const meta = getMetadata(entity);
      const copy = Object.fromEntries(
        Object.values(meta.allFields)
          .map((f) => {
            if (skip.includes(f.fieldName)) return undefined;
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
      const clone = this.create(asConcreteCstr(meta.cstr), copy);

      return [entity, clone] as const;
    });
    const entityToClone: Map<EntityW, EntityW> = new Map(clones);

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
          // Use O(1) lookup via #entitiesById Map instead of O(N) .find() scan
          const existing = isEntity(existingIdOrEntity) ? existingIdOrEntity : this.getEntity(existingIdOrEntity);
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

  /**
   * Merges multiple source entities into a target entity by updating all references that point
   * to the source entities to instead point to the target entity.
   *
   * This method loads all relations from the source entities, updates any entity that
   * references a source entity to reference the target entity instead, and then automatically
   * deletes the source entities.
   *
   * @param target - The entity that will become the target of all merged references
   * @param sources - Array of entities whose references will be redirected to the target
   * @param opts - Options to control merge behavior
   *   @param autoDelete - Whether to automatically delete source entities (default: true)
   * @returns Promise that resolves when all references have been updated and sources deleted
   *
   * @example
   * // Merge duplicate authors - all books pointing to author2 will now point to author1
   * // author2 will be automatically deleted
   * await em.merge(author1, [author2]);
   *
   * @example
   * // Merge multiple duplicate publishers into one
   * // publisher2 and publisher3 will be automatically deleted
   * await em.merge(publisher1, [publisher2, publisher3]);
   *
   * @example
   * // Merge without auto-deleting sources (for custom cleanup logic)
   * await em.merge(author1, [author2], { autoDelete: false });
   * // Custom logic here...
   * em.delete(author2);
   */
  public async merge<T extends Entity>(target: T, sources: T[], opts?: { autoDelete?: boolean }): Promise<Entity[]> {
    const autoDelete = opts?.autoDelete ?? true;
    if (sources.length === 0) return [];

    this.#merging ??= new Set();
    // Allow cannotBeUpdated to see that anyone pointed to the new target is allowed to change
    this.#merging.add(target);

    // Make sure source and target are the same type (Before we call `populate` below which will fail on invalid load hints)
    const targetMeta = getMetadata(target);
    for (const source of sources) {
      const sourceMeta = getMetadata(source);
      if (sourceMeta.type !== targetMeta.type) {
        throw new Error(`Cannot merge entities of different types: ${targetMeta.type} and ${sourceMeta.type}`);
      }
    }

    const fields = Object.values(targetMeta.allFields)
      .filter((field) => ["o2m", "m2o", "m2m", "o2o"].includes(field.kind))
      .map((field) => field.fieldName);
    await this.populate(sources, fields as any as LoadHint<T>);

    const changedEntities: Entity[] = [];
    for (const source of sources) {
      // Find all reverse relations (things that point to this entity)
      for (const field of Object.values(targetMeta.allFields)) {
        const { kind } = field;
        if (kind === "o2m") {
          for (const other of (source as any)[field.fieldName].get) {
            this.#merging.add(other); // Tell ReactionsManager to react to normally-read-only fields
            (other as any)[field.otherFieldName].set(target);
            changedEntities.push(other);
          }
        } else if (kind === "o2o") {
          const otherField = field.otherMetadata().allFields[field.otherFieldName];
          if (otherField.kind === "m2o" && otherField.derived) continue;
          const other = (source as any)[field.fieldName].get;
          if (other) {
            this.#merging.add(other); // Tell ReactionsManager to react to normally-read-only fields
            (other as any)[field.otherFieldName].set(target);
            changedEntities.push(other);
          }
        } else if (kind === "m2m") {
          for (const other of (source as any)[field.fieldName].get) {
            this.#merging.add(other); // Tell ReactionsManager to react to normally-read-only fields
            const collection = (other as any)[field.otherFieldName];
            collection.remove(source);
            collection.add(target);
            changedEntities.push(other);
          }
        } else if (
          kind === "primitive" ||
          kind === "primaryKey" ||
          kind === "enum" ||
          kind === "poly" ||
          kind === "m2o" ||
          kind === "lo2m"
        ) {
          // These field types don't need merge handling - they're either:
          // - primitive values that don't create references (primitive, enum)
          // - primary keys that shouldn't be merged
          // - forward references that we handle from the reverse side (m2o)
          // - large collections that are handled separately (lo2m)
        } else {
          assertNever(kind);
        }
      }
    }

    // Auto-delete source entities if requested
    if (autoDelete) {
      for (const source of sources) this.delete(source);
    }

    return changedEntities;
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
      this.findExistingInstance<T>(tagged) ||
      (await loadDataLoader(this, meta)
        .load({ entity: tagged, hint })
        .catch(function load(err) {
          throw appendStack(err, new Error());
        }));
    if (!entity) {
      throw new NotFoundError(`${tagged} was not found`);
    }
    if (hint) {
      await this.populate(entity, hint);
    }
    if (meta.inheritanceType === "sti" && !(entity instanceof type)) {
      throw new Error(`${entity} is ${entity.constructor.name} but should be ${type.name}`);
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
        return (
          this.findExistingInstance(id) ||
          loadDataLoader(this, meta)
            .load({ entity: id, hint })
            .catch(function loadAll(err) {
              throw appendStack(err, new Error());
            })
        );
      }),
    );
    const idsNotFound = ids.filter((_, i) => entities[i] === undefined);
    if (idsNotFound.length > 0) {
      throw new NotFoundError(`${idsNotFound.join(",")} were not found`);
    }
    if (hint) {
      await this.populate(entities as T[], hint);
    }
    if (meta.inheritanceType === "sti" && meta.baseType) {
      const wrongType = entities.filter((e) => !(e instanceof meta.cstr));
      if (wrongType.length > 0) {
        throw new Error(`${wrongType.join(", ")} were not of type ${meta.cstr.name}`);
      }
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
          return (
            this.findExistingInstance(id) ||
            loadDataLoader(this, meta)
              .load({ entity: id, hint })
              .catch(function loadAllIfExists(err) {
                throw appendStack(err, new Error());
              })
          );
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
  public async loadLens<T extends EntityW, U, V>(
    entities: readonly T[],
    fn: (lens: Lens<T>) => Lens<U, V>,
  ): Promise<U[]>;
  public async loadLens<T extends EntityW, U extends EntityW, V, const H extends LoadHint<U>>(
    entities: readonly T[],
    fn: (lens: Lens<T>) => Lens<U, V>,
    populate: H,
  ): Promise<Loaded<U, H>[]>;
  public async loadLens<T extends EntityW, U, V>(
    entities: readonly T[],
    fn: (lens: Lens<T>) => Lens<U, V>,
    populate?: any,
  ): Promise<V> {
    const result = await loadLens(entities, fn);
    if (populate) {
      await this.populate(result as any as Entity[], populate);
    }
    return result;
  }

  /**
   * Loads entities from database rows that were queried directly using a query builder.
   *
   * This overload is synchronous since there is no population/querying to do.
   */
  public loadFromQuery<T extends EntityW>(type: MaybeAbstractEntityConstructor<T>, rows: readonly unknown[]): T[];
  /**
   * Loads entities from database rows from a Knex-ish query builder that needs an `await`.
   *
   * This overload is async because it triggers the `rows` query.
   */
  public loadFromQuery<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    rows: PromiseLike<readonly unknown[]>,
  ): Promise<T[]>;
  /**
   * Loads & populates entities from database rows that were queried directly using a query builder.
   */
  public loadFromQuery<T extends EntityW, const H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    rows: readonly unknown[],
    populate: H,
  ): Promise<Loaded<T, H>[]>;
  /**
   * Loads & populates entities from database rows from a Knex-ish query builder that needs an `await`.
   */
  public loadFromQuery<T extends EntityW, const H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    rows: PromiseLike<readonly unknown[]>,
    populate: H,
  ): Promise<Loaded<T, H>[]>;
  public loadFromQuery<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
    rows: readonly unknown[] | PromiseLike<readonly unknown[]>,
    populate?: any,
  ): PromiseLike<T[]> | T[] {
    if (Array.isArray(rows)) {
      const entities = this.hydrate(type, rows);
      if (populate) return this.populate(entities, populate);
      return entities;
    } else {
      return (rows as Promise<unknown[]>).then((rows) => {
        const entities = this.hydrate(type, rows);
        if (populate) return this.populate(entities, populate);
        return entities;
      });
    }
  }

  /** Loads entities from rows. */
  public async loadFromRows<T extends EntityW>(type: MaybeAbstractEntityConstructor<T>, rows: unknown[]): Promise<T[]>;
  public async loadFromRows<T extends EntityW, const H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    rows: unknown[],
    populate: H,
  ): Promise<Loaded<T, H>[]>;
  public async loadFromRows<T extends EntityW>(
    type: MaybeAbstractEntityConstructor<T>,
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
        await Promise.all(
          list.map((entity) =>
            loader.load({ entity, hint: preload }).catch(function populate(err: any) {
              throw appendStack(err, new Error());
            }),
          ),
        );
      }
      if (non) {
        const loader = populateDataLoader(this, meta, non, "intermixed", opts);
        await Promise.all(
          list.map((entity) =>
            loader.load({ entity, hint: non }).catch(function populate(err: any) {
              throw appendStack(err, new Error());
            }),
          ),
        );
      }
    } else {
      const loader = populateDataLoader(this, meta, hintOpt, "intermixed", opts);
      await Promise.all(
        list.map((entity) =>
          loader.load({ entity, hint: hintOpt }).catch(function populate(err: any) {
            throw appendStack(err, new Error());
          }),
        ),
      );
    }

    return fn ? fn(entityOrList as any) : (entityOrList as any);
  }

  // For debugging EntityManager.populate.test.ts's "can be huge"
  // populates: Record<string, number> = {};

  /**
   * Executes `fn` with a transaction, and automatically calls `flush`/`commit` at the end.
   *
   * This ensures both any `.find` and `.flush` operations happen within the same
   * transaction, which is useful for enforcing cross-table/application-level invariants that
   * cannot be enforced with database-level constraints.
   */
  public async transaction<T>(fn: (txn: TX) => Promise<T>): Promise<T> {
    return this.driver.transaction(this, async (txn) => {
      const result = await fn(txn);
      // The lambda may have done some interstitial flushes (that would not
      // have committed the transaction), but go ahead and do a final one
      // in case they didn't explicitly call flush.
      await this.flush();
      return result;
    });
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
  delete(entity: Entity): void;
  /**
   * Marks entities to be deleted.
   *
   * Any loaded collections that are currently "pointing to" this entity will be updated to
   * no longer include this entity, i.e. if you `em.delete(b1)`, then `author.books` will have
   * `b1` removed (if needed).
   *
   * This is done for all currently-loaded collections; i.e. technically unloaded collections
   * may still point to this entity. We defer unsetting these not-currently-loaded references
   * until `EntityManager.flush`, when we can make the async calls to load-and-unset them.
   */
  delete(entities: Entity[]): void;
  delete(entityOrArray: Entity | Entity[]): void {
    for (const entity of toArray(entityOrArray)) {
      // Early return if already deleted.
      const alreadyMarked = getInstanceData(entity).markDeleted(entity);
      if (!alreadyMarked) continue;
      // Any derived fields that read this entity will need recalc-d
      this.#rm.queueAllDownstreamFields(entity, "deleted");
      // Synchronously unhook the entity if the relations are loaded
      getCascadeDeleteRelations(entity).forEach((r) => r.maybeCascadeDelete());
      // And queue the cascade deletes
      this.#pendingDeletes.push(entity);
    }
  }

  async assignNewIds() {
    let pendingEntities = this.entities.filter((e) => e.isNewEntity && !e.isDeletedEntity && !e.idTaggedMaybe);
    await this.getLoader<Entity, Entity>("assign-new-ids", "global", async (entities) => {
      let todos = createTodos(entities);
      await this.driver.assignNewIds(this, todos);
      for (const e of entities) this.#entitiesById.set(e.idTagged, e);
      return entities;
    })
      .loadMany(pendingEntities)
      .catch(function assignNewIds(err) {
        throw appendStack(err, new Error());
      });
  }

  /**
   * Immediately assigns async defaults to `entities`.
   *
   * Normally async defaults wait until `em.flush` to run, because their async nature requires
   * an `await` / `Promise` to be evaluated, and `em.create` is synchronous.
   *
   * This `assignDefaults` methods like you move that up, and immediately invoke
   * any default logic against the `entities`.
   */
  async setDefaults(entities: Entity[]): Promise<void> {
    return runInTrustedContext(async () => {
      const suppressedTypeErrors: Error[] = [];
      const entitiesByType = groupBy(
        entities.filter((e) => e.isNewEntity),
        (e) => getMetadata(e),
      );
      await setAsyncDefaults(suppressedTypeErrors, this.ctx, entitiesByType);
    });
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
    return runInTrustedContext(() => this.#flush(flushOptions));
  }

  async #flush(flushOptions: FlushOptions = {}): Promise<Entity[]> {
    if (this.mode === "read-only") throw new ReadOnlyError();

    const { skipValidation = false } = flushOptions;

    this.#fl.startLock();

    await this.#fl.allowWrites(async () => {
      // Cascade deletes now that we're async (i.e. to keep `em.delete` synchronous).
      // Also do this before calling `recalcPendingReactables` to avoid recalculating
      // fields on entities that will be deleted (and probably have unset/invalid FKs
      // that would NPE their logic anyway).
      await this.flushDeletes();
      // Recalc before we run hooks, so the hooks will see the latest calculated values.
      await this.#rm.recalcPendingReactables("reactables");
    });

    const createdThenDeleted: Set<Entity> = new Set();
    // We'll only invoke hooks once/entity (the 1st time that entity goes through runHooksOnPendingEntities)
    const hooksInvoked: Set<Entity> = new Set();
    // Make sure two ReactiveQueryFields don't ping-pong each other forever
    let hookLoops = 0;
    let now = getNow();
    const suppressedDefaultTypeErrors: Error[] = [];

    // Make a lambda that we can invoke multiple times, if we loop for ReactiveQueryFields
    const runHooksOnPendingEntities = async (): Promise<Entity[]> => {
      if (hookLoops++ >= 10) throw new Error("runHooksOnPendingEntities has ran 10 iterations, aborting");

      // Resolve any pending o2m/m2m sets (set() called before load — need to load from DB to diff)
      const pendingLoads = [...getEmInternalApi(this).pendingLoads];
      if (pendingLoads.length > 0) {
        getEmInternalApi(this).pendingLoads.clear();
        await Promise.all(pendingLoads.map((collection) => collection.load()));
      }

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
          let todos = createTodos([...pendingHooks]);

          await setAsyncDefaults(suppressedDefaultTypeErrors, this.ctx, Todo.groupInsertsByTypeAndSubType(todos));
          maybeBumpUpdatedAt(todos, now);

          // Run our hooks
          for (const group of maybeSetupHookOrdering(todos)) {
            await beforeCreate(this.ctx, group);
            await beforeUpdate(this.ctx, group);
            await beforeFlush(this.ctx, group);
          }

          // Call `setField` just to get the column marked as dirty if needed.
          // This can come after the hooks, b/c if the hooks read any of these
          // fields, they'd be via the synchronous getter and would not be stale.
          recalcSynchronousDerivedFields(todos);

          // The hooks could have deleted this-loop or prior-loop entities, so re-cascade again.
          await this.flushDeletes();
          // The hooks could have changed fields, so recalc again.
          await this.#rm.recalcPendingReactables("reactables");
          // We may have reactables that failed earlier, but will succeed now that hooks have been run and cascade
          // deletes have been processed
          if (this.#rm.hasPendingTypeErrors) {
            await this.#rm.recalcPendingTypeErrors();
            // We need to re-run reactables again if we dirtied something while retrying type errors
            if (this.#rm.needsRecalc("reactables")) await this.#rm.recalcPendingReactables("reactables");
          }

          for (const e of pendingHooks) hooksInvoked.add(e);
          pendingHooks.clear();
          // See if the hooks mutated any new, not-yet-hooksInvoked entities
          findPendingFlushEntities(this.entities, hooksInvoked, pendingFlush, pendingHooks, alreadyRanHooks);
          // The final run of recalcPendingReactables could have left us with pending type errors and no entities in
          // pendingHooks.  If so, we need to re-run recalcPendingTypeErrors to get those errors to transition into
          // suppressed errors so that we will fail after simpleValidation.
          if (pendingHooks.size === 0 && this.#rm.hasPendingTypeErrors) await this.#rm.recalcPendingTypeErrors();
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
        // `validateReactiveRules` next, the app's lambdas won't see fundamentally invalid entities & NPE.
        await validateSimpleRules(entityTodos);
        // After we've let any "author is not set" simple rules fail before prematurely throwing
        // the "of course that caused an NPE" `TypeError`s, if all the authors *were* valid/set,
        // and we still have TypeErrors (from derived valeus), they were real, unrelated errors
        // that the user should see.
        if (suppressedDefaultTypeErrors.length > 0) throw suppressedDefaultTypeErrors[0];
        await validateReactiveRules(this, this.#rm.logger, entityTodos, joinRowTodos);
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

      const { pluginManager } = getEmInternalApi(this);
      if (Object.keys(entityTodos).length > 0 || Object.keys(joinRowTodos).length > 0) {
        // The driver will handle the right thing if we're already in an existing transaction.
        await this.driver.transaction(this, async () => {
          do {
            if (Object.keys(entityTodos).length > 0 || Object.keys(joinRowTodos)) {
              await this.driver.flush(this, entityTodos, joinRowTodos);
            }
            // Now that we've flushed, we can let plugins know what we've done.
            pluginManager.afterWrite(entityTodos, joinRowTodos);
            // And we can look for ReactiveQueries that need to be recalculated
            if (this.#rm.hasPendingReactiveQueries()) {
              // Reset all flushed entities to we only flush net-new changes
              for (const e of entitiesToFlush) {
                if (e.isNewEntity && !e.isDeletedEntity) this.#entitiesById.set(e.idTagged, e);
                getInstanceData(e).resetForRqfLoop();
              }
              // Actually do the recalc
              await this.#fl.allowWrites(async () => {
                await this.#rm.recalcPendingReactables("reactiveQueries");
                // If any ReactiveFields depended on ReactiveQueryFields, go ahead and calc those now
                await this.#rm.recalcPendingReactables("reactables");
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
          if (e.isNewEntity && !e.isDeletedEntity) this.#entitiesById.set(e.idTagged, e);
          getInstanceData(e).resetAfterFlushed();
        }
        // Update the joinRows refs to reflect the new state
        for (const joinRow of Object.values(joinRowTodos)) {
          joinRow.resetAfterFlushed();
        }
        const { mutatedCollections } = getEmInternalApi(this);
        for (const o2m of mutatedCollections.values()) {
          o2m.resetAddedRemoved();
        }
        mutatedCollections.clear();

        // Reset the find caches b/c data will have changed in the db
        this.#dataloaders = {};
        this.#rm.clear();
      }

      // Fixup the `deleted` field on entities that were created then immediately deleted
      for (const e of createdThenDeleted) getInstanceData(e).fixupCreatedThenDeleted();
      this.#merging?.clear();

      return [...allFlushedEntities];
    } catch (e) {
      if (e && typeof e === "object" && "constraint" in e && typeof e.constraint === "string") {
        // node-pg errors use `constraint` to indicate the constraint name
        const message = constraintNameToValidationError[e.constraint];
        if (message) {
          throw new ValidationErrors(message);
        }
      }
      if (e instanceof InMemoryRollbackError) return [...allFlushedEntities];
      throw e;
    } finally {
      this.#rm.clearSuppressedTypeErrors();
      this.#fl.releaseLock();
      resetFactoryCreated();
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
    this.#isRefreshing = true;
    this.#dataloaders = {};
    this.#preloadedRelations = new Map();
    const deepLoad = param && "deepLoad" in param && param.deepLoad;
    let todo =
      param === undefined
        ? this.#entitiesArray
        : Array.isArray(param)
          ? param
          : isEntity(param)
            ? [param]
            : this.#entitiesArray;
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
            return loadDataLoader(this, getMetadata(entity), true)
              .load({ entity: entity.idTagged, hint })
              .catch(function refresh(err) {
                throw appendStack(err, new Error());
              });
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
    this.#isRefreshing = false;
  }

  public get numberOfEntities(): number {
    return this.entities.length;
  }

  // Handles our Unit of Work-style look up / deduplication of entity instances.
  // Currently only public for the driver impls
  public findExistingInstance<T extends EntityW>(id: string): T | undefined {
    return this.#entitiesById.get(id) as T | undefined;
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
    rows: readonly any[],
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
        entity = newEntity(this, asConcreteCstr(meta.cstr), false) as T;
        getInstanceData(entity).row = row;
        this.#doRegister(entity as any, taggedId);
      } else if (options?.overwriteExisting === true) {
        // Usually if the entity already exists, we don't write over it, but in this case we assume that
        // `EntityManager.refresh` is telling us to explicitly load the latest data.
        // First swap out the old row with the new row
        getInstanceData(entity).row = row;
        // And then only refresh the data keys that have already been serde-d from rows
        // (this keeps us from deserializing data out of rows that we don't need).
        const { data, originalData } = getInstanceData(entity);
        const changedFields = (entity as any).changes.fieldsWithoutRelations;
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
   * Recalculates the reactive fields for an entity, and any downstream reactive fields or reactions that depend on them.
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

    // `.load()` recalculated the immediate relations, go ahead and recalc any downstream reactables.
    // We'll still defer ReactiveQueryFields to the em.flush loop.
    await this.#rm.recalcPendingReactables("reactables");
  }

  public beforeBegin(fn: HookFn<TX>) {
    this.#hooks.beforeBegin.push(fn);
  }

  public afterBegin(fn: HookFn<TX>) {
    this.#hooks.afterBegin.push(fn);
  }

  public beforeCommit(fn: HookFn<TX>) {
    this.#hooks.beforeCommit.push(fn);
  }

  public afterCommit(fn: HookFn<TX>) {
    this.#hooks.afterCommit.push(fn);
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
  private async flushDeletes(): Promise<void> {
    let entities = this.#pendingDeletes;
    if (entities.length === 0) return;
    this.#pendingDeletes = [];
    let relationsToCleanup: AbstractRelationImpl<unknown, unknown>[] = [];
    // Loop if our deletes cascade to other deletes
    while (entities.length > 0) {
      // For cascade delete relations, cascade the delete...
      const p = entities.flatMap(getCascadeDeleteRelations).map((r) => r.load().then(() => r.maybeCascadeDelete()));
      await Promise.all(p);
      // Run the beforeDelete hook before we unhook the entity
      const todos = createTodos(entities);
      await beforeDelete(this.ctx, todos);
      // For all relations, unhook the entity from the other side
      // (...we're using `concat` because `.push(...reallyBigArray)` with ~100k relations can blow the stack size
      relationsToCleanup = relationsToCleanup.concat(entities.flatMap(getRelations));
      entities = this.#pendingDeletes;
      this.#pendingDeletes = [];
    }
    // For all relations, unhook the entity from the other side
    await Promise.all(relationsToCleanup.map((r) => r.cleanupOnEntityDeleted()));
  }

  setReactionLogging(logger: ReactionLogger): void;
  setReactionLogging(enabled: boolean): void;
  setReactionLogging(arg: boolean | ReactionLogger): void {
    this.#rm.setLogger(typeof arg === "boolean" ? (arg ? new ReactionLogger() : undefined) : arg);
  }

  /** Accepts `Author` or `Author.firstName,lastName` or `Author.lastName!`. */
  setFieldLogging(spec: string): void;
  /** Accepts `["Author.firstName,lastName", "Book.title"]`. */
  setFieldLogging(spec: string[]): void;
  /** Sets this EntityManager's field logger. */
  setFieldLogging(logger: FieldLogger): void;
  /** Enables/disables field logging for all fields. */
  setFieldLogging(enabled: boolean): void;
  setFieldLogging(arg: FieldLogger | string | string[] | boolean): void {
    if (arg instanceof FieldLogger) {
      this.#fieldLogger = arg;
      return;
    }
    const writeFn = getDefaultWriteFn(this.ctx);
    if (typeof arg === "boolean") {
      this.#fieldLogger = arg ? new FieldLogger([], writeFn) : undefined;
    } else if (typeof arg === "string" || Array.isArray(arg)) {
      const specs = Array.isArray(arg) ? arg : [arg];
      const watching: FieldLoggerWatch[] = specs.map((spec) => {
        // Regex to match Author.firstName,lastName! pattern
        const regex = /^([^.!]+)(?:\.([^!]*))?(!)?$/;
        const [_, entity, fields, breakpoint] = spec.match(regex) ?? fail(`Unsupported spec ${spec}`);
        const fieldNames = fields?.split(",");
        // Ensure entity is valid, to avoid failing silently
        const meta = getMetadataForType(entity);
        // Ensure the field names are valid, to avoid failing silently
        fieldNames?.forEach((field) => {
          // We could probably check the `kind`, b/c things like o2o/o2m are not supported atm
          if (!meta.allFields[field]) {
            throw new Error(`Field ${field} not found on ${entity}`);
          }
        });
        return { entity, fieldNames, breakpoint: !!breakpoint };
      });
      this.#fieldLogger = new FieldLogger(watching, writeFn);
    } else {
      throw new Error("Unsupported override for setFieldLogging");
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.flush();
  }

  /** Returns entities matching the filter using indexed search when available. */
  filterEntities<T extends Entity>(cstr: EntityConstructor<T>, where: Partial<OptsOf<T>>): T[] {
    const meta = getMetadata(cstr);
    const entities = (this.#entitiesByTag.get(meta.tagName) as T[]) ?? [];
    // Don't bother filtering if there's no where clause (particularly b/c IndexManager.findMatching
    // really expects there to be at least 1 condition)
    if (Object.entries(where).length === 0) {
      return entities.filter((e) => e instanceof cstr && !e.isDeletedEntity);
    }
    if (this.#indexManager.shouldIndexType(entities.length)) {
      this.#indexManager.enableIndexingForType(meta, entities);
      return (
        this.#indexManager
          .findMatching(meta, where)
          // Still filter by `instanceof cstr` to handle subtyping
          .filter((e) => e instanceof cstr && !e.isDeletedEntity)
      );
    } else {
      return (
        entities
          // Still filter by `instanceof cstr` to handle subtyping
          .filter((e) => e instanceof cstr && !e.isDeletedEntity && entityMatches(e, where)) as T[]
      );
    }
  }

  /**
   * Creates a new EntityManager that shares the same entities as the current one but allows independent changes.
   *
   * This is useful for scenarios where you want to:
   *
   * - Preload data for use as a cache
   * - Make speculative changes that may or may not be committed
   * - Escape a transaction scope
   *
   * The fork will:
   *
   * - Copy all currently loaded entities to the new EntityManager
   * - Copy any loaded relation data to keep `.isLoaded` / `.get` state consistent
   * - Copy and update references to the EntityManager and its entities in the context, which is itself shallowly copied
   *
   * The fork will NOT:
   *
   * - Copy any pending changes (must call .flush() first)
   * - Share any changes made in either EntityManager with the other
   *
   * @param opts options to control the fork behavior
   *  - allowPendingChanges - allows the em being forked to have pending changes and forces the resulting em to have
   *  `mode` set to "in-memory-writes".  Changes to entities in the original em will be copied to the resulting em.
   *  Optional. default: false
   *
   * @throws {Error} If called on an EntityManager with pending changes
   * @returns A new EntityManager with copied entity state
   */
  fork(opts: { allowPendingChanges?: boolean } = {}): EntityManager<C, Entity, TX> {
    const { allowPendingChanges = false } = opts;
    const oldEm = this;
    // copy the context so that it's distinct between the two ems, and so we can update any references from the old em
    // to the new one later
    const ctx = { ...oldEm.ctx } as Record<string, any>;
    const newEm = new EntityManager<C, Entity, TX>(ctx as C, { em: oldEm });
    if (allowPendingChanges) newEm.mode = "in-memory-writes";
    // hydrate (ie, create) each entity from the oldEm in the newEm
    for (const [tag, entities] of oldEm.#entitiesByTag.entries()) {
      // tags are always defined by the base constructor, so we use that as hydrate expects the base class as its argument
      const baseCstr = getConstructorFromTag(tag);
      let rows = new Array<any>(entities.length);
      let i = 0;
      for (const entity of entities) {
        const instanceData = (entity as any).__data as InstanceData;
        if (!allowPendingChanges && instanceData.pendingOperation !== "none") {
          fail("Cannot fork an EntityManager with pending changes");
        } else if (instanceData.isNewEntity) {
          // Create blank entities in newEm for each unpersisted entity from oldEm.  They will be populated later in the
          // allowPendingChanges step as they should not be present otherwise.
          // (I'd thought we should copy over `InstanceData.createId`, but since we're iterating over `oldEm.#entitiesByTag`
          // in stable as-created order, the `newEm.create` will assign the same/incrementing `createId`s as in oldEm.)
          newEm.create(entity.constructor as EntityConstructor<Entity>, {} as any);
        } else {
          // We copy the raw row data for each entity to avoid any potential conflict. Then we ensure the correct concrete
          // __class key is set for hydrate to use, if necessary (ie, cti), to actually instantiate the entity.
          rows[i] = createRowFromEntityData(entity);
          i++;
        }
      }
      if (rows.length !== i) rows = rows.slice(0, i);
      newEm.hydrate(baseCstr, rows);
    }

    function mapEntity(oldEntity: Entity): Entity {
      if (oldEntity.isNewEntity) {
        return newEm.#entitiesById.get(oldEntity.toTaggedString())!;
      } else {
        return newEm.#entitiesById.get(oldEntity.idTagged)!;
      }
    }

    function mapEntities<U extends Entity>(v: U[] | undefined): U[] | undefined {
      if (v === undefined) return undefined;
      const result = new Array<U>(v.length);
      for (let i = 0; i < v.length; i++) result[i] = mapEntity(v[i]) as U;
      return result;
    }

    // If we are allowing pending changes, then we need to copy any changes across to newEm
    if (allowPendingChanges) {
      for (const oldEntity of oldEm.entities) {
        const oldInstanceData = (oldEntity as any).__data as InstanceData;
        if (!(oldInstanceData.isNewEntity || oldInstanceData.isDirtyEntity)) continue;
        const { originalData: oldOriginalData, data: oldData } = oldInstanceData;
        const newEntity = mapEntity(oldEntity);
        const { originalData: newOriginalData, data: newData } = (newEntity as any).__data as InstanceData;
        // for new entities, anything in `data` is changed and should be copied across. for existing entities, we
        // only care about changed fields, which are enumerated by originalData
        const maybeEntity = (value: any) => (isEntity(value) ? mapEntity(value as Entity) : value);
        const fields = Object.keys(oldEntity.isNewEntity ? oldData : oldOriginalData);
        for (const field of fields) {
          // copy over originalData so .changes is consistent across ems
          if (field in oldOriginalData) newOriginalData[field] = maybeEntity(oldOriginalData[field]);
          newData[field] = maybeEntity(oldData[field]);
        }
      }
    }

    // import every loaded concrete (ie, not custom) relation into the new em
    for (const oldEntity of oldEm.entities) {
      const newEntity = mapEntity(oldEntity);
      if (oldEntity.isDeletedEntity) {
        // If the old entity was deleted, that should be persisted in the new em
        ((newEntity as any).__data as InstanceData).markDeleted(newEntity);
        // deleted entities will fail if you try to `get` their relations, so skip them since they should be cleared
        // out regardless
        continue;
      }

      const { relations } = (oldEntity as any).__data as InstanceData;
      for (const [field, relation] of Object.entries(relations)) {
        // With lazyRelation, custom relations are inserted into the `relations` map. Custom relations don't
        // store any data, so we can ignore them by checking if the relation implements `import`
        // TODO: add `import` to recursiveCollection
        if (!("import" in relation)) continue;
        if (oldEntity.isNewEntity) {
          // every relation should be loaded on a new entity, so calling get should be safe
          const oldValue = relation.get;
          if (oldValue === undefined) continue;
          if (Array.isArray(oldValue) && oldValue.length === 0) continue;
          const newValue = Array.isArray(oldValue) ? mapEntities(oldValue) : mapEntity(oldValue);
          // we may have already copied over the instance data, in which case `setFromOpts` would detect this as
          // the same entity that's already set in data and early exit, so delete ourselves from data first
          delete ((newEntity as any).__data as InstanceData).data[field];
          (newEntity as any)[field].setFromOpts(newValue);
        } else {
          const isLoaded = "_isLoaded" in relation ? relation._isLoaded : relation.isLoaded;
          if (isLoaded) (newEntity as any)[field].import(relation, mapEntity, mapEntities);
        }
      }
    }
    // Inspect the top level keys in the context and replace any references from oldEm with newEm (ie, ctx.em === newEm)
    // while also replacing any entities from oldEm with their version in newEm (eg, if the user is stored in the
    // context, then `ctx.user.em === newEm`).
    for (const [key, value] of Object.entries(ctx)) {
      if (isEntity(value) && value.em === oldEm) {
        ctx[key] = mapEntity(value as Entity);
      } else if (value === oldEm) {
        ctx[key] = newEm;
      }
    }
    return newEm;
  }

  /**
   * Copies an entity from one EntityManager to another, ensuring all relations specified in the hint are
   * also copied.
   *
   * This method is primarily used when you need to move entities between different EntityManager instances
   * while preserving their loaded state and relationships. This is useful for scenarios like:
   *
   * - Moving entities between transaction boundaries
   * - Creating test fixtures that reference entities from a different EntityManager
   * - Sharing entities between different parts of your application
   *
   * The migration process:
   * 1. If the entity already exists in this EntityManager, returns it
   * 2. Otherwise, creates a new instance with the same data
   * 3. Recursively migrates any loaded relations specified in the hint
   *
   * @param source - The entity to migrate from another EntityManager
   * @param hint - The load hint specifying which relations to migrate
   * @returns The migrated entity with all specified relations loaded
   */
  importEntity<T extends Entity>(original: T): T;
  importEntity<T extends Entity, H extends LoadHint<T>, L extends Loaded<T, H>>(original: L, hint: H): L;
  importEntity<T extends Entity, H extends LoadHint<T>, L extends Loaded<T, H>>(
    source: L,
    hint?: H,
    normalizedHint?: H,
  ): L {
    if (source.isNewEntity) fail("cannot import new entities");
    if (source.isDeletedEntity) fail("cannot import deleted entities");
    if (source.isDirtyEntity) fail("cannot import dirty entities");

    hint ??= {} as H;
    if (!normalizedHint) {
      assertLoaded(source, hint);
      normalizedHint = deepNormalizeHint(hint) as H;
    }

    if (source.em === this) return source as any;

    const meta = getMetadata(source);

    let result = this.#entitiesById.get(source.idTagged) as T | undefined;

    if (!result) {
      const meta = getMetadata(source);
      const row = createRowFromEntityData(source);
      result = this.hydrate(getBaseMeta(meta).cstr, [row])[0]!;
    }

    for (const [fieldName, subHint] of Object.entries(normalizedHint)) {
      const field = meta.allFields[fieldName];
      const relationOrProp = (result as any)[fieldName];
      if (!field) {
        let loadHint: H =
          (relationOrProp as any).loadHint ?? fail(`${source}.${fieldName} cannot be imported as it has no loadHint`);
        this.importEntity<T, H, L>(source, loadHint);
      } else if ("import" in relationOrProp) {
        // Tell our version of the entity (result) to accept/copy the relation state of the source
        relationOrProp.import(
          (source as any)[fieldName],
          (e: Entity) => (this.importEntity as any)(e, subHint, subHint) as Entity,
          (entities: Entity[]) => {
            if (entities === undefined) return undefined;
            const result = new Array(entities.length);
            for (let i = 0; i < entities.length; i++) {
              result[i] = (this.importEntity as any)(entities[i], subHint, subHint) as Entity;
            }
            return result;
          },
        );
      }
    }

    return result as any;
  }

  addPlugin(plugin: Plugin): void {
    getEmInternalApi(this).pluginManager.addPlugin(plugin);
  }

  getPlugins(): readonly Plugin[] {
    return getEmInternalApi(this).pluginManager.plugins;
  }

  get isRefreshing() {
    return this.#isRefreshing;
  }

  get isFlushing() {
    return this.#fl.isFlushing;
  }

  /** Creates a new `type` and marks it as loaded, i.e. we know its collections are all safe to access in memory. */
  #doCreate<T extends EntityW>(type: EntityConstructor<T>, opts: any, partial: boolean): T {
    const entity = newEntity(this, type, true);

    // Assign the next `a#1`, `a#2`, etc. id
    const meta = getMetadata(type);
    const counter = (this.#createCounter ??= new Map<string, number>());
    const i = (counter.get(meta.tagName) ?? 0) + 1;
    counter.set(meta.tagName, i);
    getInstanceData(entity).createId = String(i);

    // Check opts.id for an explicitly-set id
    this.#doRegister(entity as any, opts.id);

    // Set a default createdAt/updatedAt
    const baseMeta = getBaseMeta(getMetadata(entity));
    if (baseMeta.timestampFields) {
      this.#assignTimestamps(entity, baseMeta);
    }

    // Set the discriminator for STI
    if (baseMeta.inheritanceType === "sti") {
      setStiDiscriminatorValue(baseMeta, entity);
    }

    // api will be undefined during getFakeInstance
    const api = getEmInternalApi(this);
    api?.fieldLogger?.logCreate(entity);

    setOpts(entity, opts, { partial, calledFromConstructor: true });

    // Apply any synchronous defaults, after the opts have been applied
    if (!(this as any).fakeInstance) {
      setSyncDefaults(entity);
    }

    this.#rm.queueAllDownstreamFields(entity, "created");

    return entity;
  }

  #assignTimestamps(entity: EntityW, baseMeta: EntityMetadata): void {
    const { createdAt, updatedAt } = baseMeta.timestampFields ?? {};
    const { data } = getInstanceData(entity);
    const now = new Date();
    if (createdAt) {
      const serde = baseMeta.fields[createdAt].serde as TimestampSerde<unknown>;
      data[createdAt] = serde.mapFromNow(now);
    }
    if (updatedAt) {
      const serde = baseMeta.fields[updatedAt].serde as TimestampSerde<unknown>;
      data[updatedAt] = serde.mapFromNow(now);
    }
  }

  /** Registers a newly-instantiated entity with our EntityManager; only called by #doCreate and hydrate. */
  #doRegister(entity: Entity, id?: string): void {
    // Keep our indexes up to date...
    const maybeId = id ?? entity.idTaggedMaybe;
    if (maybeId) {
      if (this.findExistingInstance(maybeId) !== undefined) {
        throw new Error(`Entity ${entity} has a duplicate instance already loaded`);
      }
      this.#entitiesById.set(maybeId, entity);
    } else {
      // Also register by the `a#1` style tagged string for new entities
      this.#entitiesById.set(entity.toTaggedString(), entity);
    }
    this.#entitiesArray.push(entity);

    const meta = getMetadata(entity);
    const set = this.#entitiesByTag.get(meta.tagName) ?? [];
    if (set.length === 0) this.#entitiesByTag.set(meta.tagName, set);
    set.push(entity);
    if (this.#entitiesArray.length >= this.entityLimit) {
      const topTypes = [...this.#entitiesByTag.entries()]
        .map(([tag, entities]) => ({ tag, count: entities.length }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map(({ tag, count }) => `${tag}=${count}`)
        .join(", ");
      throw new Error(`More than ${this.entityLimit} entities have been instantiated (top entities: ${topTypes})`);
    }

    // If indexing is enabled for this type, add it...
    this.#indexManager.maybeIndexEntity(entity);
  }
}

/** Provides an internal API to the `EntityManager`. */
export interface EntityManagerInternalApi {
  joinRows: (m2m: ManyToManyLike) => JoinRows;

  /** Map of taggedId -> fieldName -> pending children, i.e. when `a1.books` later loads, add/remove b1. */
  pendingPercolate: Map<string, Map<string, { adds: Entity[]; removes: Entity[] }>>;

  /** List of mutated o2m collections to reset added/removed post-flush. */
  mutatedCollections: Set<OneToManyCollection<any, any>>;

  /** O2M/M2M collections with pending set() calls that need resolution before flush. */
  pendingLoads: Set<Collection<any, any>>;

  /** Map of taggedId -> fieldName -> join-loaded data. */
  getPreloadedRelation<U>(taggedId: string, fieldName: string): U[] | undefined;
  setPreloadedRelation<U>(taggedId: string, fieldName: string, children: U[]): void;

  hooks: Record<EntityManagerHook, HookFn<any>[]>;
  rm: ReactionsManager;
  indexManager: IndexManager;
  preloader: PreloadPlugin | undefined;
  isValidating: boolean;
  checkWritesAllowed: () => void;
  isMerging: (entity: Entity) => boolean;
  get fieldLogger(): FieldLogger | undefined;
  get isLoadedCache(): IsLoadedCache;
  pluginManager: PluginManager;
  clearDataloaders(): void;
  clearPreloadedRelations(): void;
  setIsRefreshing(isRefreshing: boolean): void;
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
  // Throw in null handling for findWithNewOrChanged ambivalence
  if (a === undefined || b === undefined || a === null || b === null) {
    return (a === undefined || a === null) && (b === undefined || b === null);
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

/** Compares the value `a` to `b`, with handling of new entities w/o ids assigned yet. */
export function sameReference<T extends Entity>(a: Reference<any, T, any>, b: Reference<any, T, any>): boolean {
  return sameEntity(isLoadedReference(a) ? a.get : a.idTaggedMaybe, isLoadedReference(b) ? b.get : b.idTaggedMaybe);
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
  em: EntityManager,
  logger: ReactionLogger | undefined,
  todos: Record<string, Todo>,
  joinRowTodos: Record<string, JoinRowTodo>,
): Promise<void> {
  logger?.logStartingValidate(em, todos);

  // Use a map of rule -> Set<Entity> so that we only invoke a rule once per entity,
  // even if it was triggered by multiple changed fields.
  const fns: Map<ValidationRule<any>, Set<Entity>> = new Map();

  // From the given triggered entities, follow the entity's ReactiveRule back
  // to the reactive rules that need ran, and queue them in the `fn` map
  async function followAndQueue(triggered: Entity[], rule: ReactiveRule): Promise<void> {
    if (triggered.length === 0) return;
    const found = (await followReverseHint(rule.name, triggered, rule.path))
      .filter((entity) => !entity.isDeletedEntity)
      .filter((e) => e instanceof rule.cstr);
    let entities = fns.get(rule.fn);
    if (!entities) {
      entities = new Set();
      fns.set(rule.fn, entities);
    }
    logger?.logWalked(triggered, rule, found, "validate");
    found.forEach((entity) => {
      entities.add(entity);
    });
  }

  const p1 = Object.values(todos).flatMap((todo) => {
    const entities = [...todo.inserts, ...todo.updates, ...todo.deletes];
    // Find each statically-declared reactive rule for the given entity type
    const rules = getReactiveRules(todo.metadata);
    return rules.map((rule) => {
      // Of all changed entities of this type, how many specifically trigger this rule?
      const triggered = entities.filter((e) => {
        // If the rule is for a different subtype, skip it
        if (!(e instanceof rule.source)) return false;
        // Any new-or-deleted entity fires every rule (getReactiveRules has already filtered out read-only)
        if (e.isNewEntity || e.isDeletedEntity) return true;
        // Otherwise see if the changed fields overlaps with the rule's fields
        const changedFields = (e as any).changes.fieldsWithoutRelations as string[];
        for (const field of changedFields) {
          if (rule.fields.includes(field)) return true;
        }
        return false;
      });
      // From these "triggered" entities, queue the "found"/owner entity to rerun this rule
      return followAndQueue(triggered, rule);
    });
  });

  const p2 = Object.values(joinRowTodos).flatMap((todo) => {
    const entities = [...todo.newRows, ...todo.deletedRows].flatMap((jr) => Object.values(jr.columns));
    // Do the first side
    const p1 = getReactiveRules(todo.m2m.meta)
      .filter((rule) => rule.fields.includes(todo.m2m.fieldName))
      .map((rule) => {
        const triggered = entities.filter((e) => e instanceof todo.m2m.meta.cstr);
        return followAndQueue(triggered, rule);
      });
    // And the second side
    const p2 = getReactiveRules(todo.m2m.otherMeta)
      .filter((rule) => rule.fields.includes(todo.m2m.otherFieldName))
      .map((rule) => {
        const triggered = entities.filter((e) => e instanceof todo.m2m.otherMeta.cstr);
        return followAndQueue(triggered, rule);
      });
    return [...p1, ...p2];
  });

  failIfAnyRejected(await Promise.allSettled([...p1, ...p2]));

  // Now that we've found the fn+entities to run, run them and collect any errors
  const p3 = [...fns.entries()].flatMap(([fn, entities]) =>
    [...entities].map(async (entity) => coerceError(entity, await fn(entity))),
  );
  const errors = failIfAnyRejected(await Promise.allSettled(p3)).flat();
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
  const errors = failIfAnyRejected(await Promise.allSettled(p)).flat();
  if (errors.length > 0) {
    throw new ValidationErrors(errors);
  }
}

export function driverBeforeBegin<TXN>(em: EntityManager<any, any, TXN>, txn: TXN): Promise<unknown> {
  return Promise.all(getEmInternalApi(em).hooks.beforeBegin.map((fn) => fn(em, txn)));
}

export function driverAfterBegin<TXN>(em: EntityManager<any, any, TXN>, txn: TXN): Promise<unknown> {
  return Promise.all(getEmInternalApi(em).hooks.afterBegin.map((fn) => fn(em, txn)));
}

export function driverBeforeCommit<TXN>(em: EntityManager<any, any, TXN>, txn: TXN): Promise<unknown> {
  return Promise.all(getEmInternalApi(em).hooks.beforeCommit.map((fn) => fn(em, txn)));
}

export function driverAfterCommit<TXN>(em: EntityManager<any, any, TXN>, txn: TXN): Promise<unknown> {
  return Promise.all(getEmInternalApi(em).hooks.afterCommit.map((fn) => fn(em, txn)));
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
  // (causes weird errors when/if they try to access the EntityManager that has "moved on")
  const results = await Promise.allSettled(p);
  failIfAnyRejected(results);
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

/** Given a validation rule result `maybeError`, returns a canonical `ValidationError[]`. */
function coerceError(entity: Entity, maybeError: ValidationRuleResult): ValidationError[] {
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
  found: Set<Entity>,
  // We keep skipMap separated out, instead of tuple-izing `found`, so that `found`
  // can be a set that is cheap to insert & check for duplicates.
  skipMap: WeakMap<Entity, string[]>,
  entities: readonly T[],
  deep: LoadHint<T>,
  opts: { skipIf?: (entity: Entity) => boolean; skip?: object } = {},
): Promise<void> {
  const { skipIf = () => false } = opts ?? {};

  const skip = deepNormalizeHint(opts.skip ?? {});
  // If we're passed `skip = { author: "publisher" }`, which is asking to "don't set `author.publisher`", then
  // `author` will technically be a key in the "skip hint", but it's only there for us to hop down into.
  // So we actually _don't_ skip any fields that have sub-hints, b/c it's the sub-hints themselves we want to skip.
  const skipFields = Object.keys(skip).filter((key) => Object.keys((skip as any)[key]).length === 0);

  // It's tempting to check `!found.has(entity)` here, but that would short-circuit later crawling the
  // entity at a potentially different point in the graph, i.e. a deep hint like:
  //
  // `{ comment: parent, books: { author: "publisher" } }`
  //
  // If the `comment.parent` was the same `Author` as a `books.author`, but we "crawled it first", we'd miss
  // crawling through the author a 2nd time and cloning the publisher.
  const entitiesToClone = entities.filter((e) => !skipIf(e));
  for (const entity of entitiesToClone) {
    found.add(entity);
    skipMap.set(entity, skipFields);
  }
  await Promise.all(
    entitiesToClone.flatMap((entity) =>
      (Object.entries(adaptHint(deep)) as [keyof RelationsIn<T> & string, LoadHint<any>][]).map(
        async ([relationName, nested]) => {
          const relation = entity[relationName];
          // If we're using a deep `skip` hint, drill in to it
          const _opts = { ...opts, skip: (skip as any)[relationName] };
          if (relation instanceof OneToManyCollection) {
            const relatedEntities: readonly Entity[] = await relation.load();
            await crawl(found, skipMap, relatedEntities, nested, _opts);
          } else if (relation instanceof OneToOneReferenceImpl) {
            const related: Entity | undefined = await relation.load();
            if (related) {
              await crawl(found, skipMap, [related], nested, _opts);
            }
          } else if (relation instanceof ManyToOneReferenceImpl) {
            const related: Entity | undefined = await relation.load();
            if (related) {
              await crawl(found, skipMap, [related], nested, _opts);
            }
          } else if (relation instanceof ReactiveReferenceImpl) {
            const relatedEntities: readonly Entity[] = await relation.load();
            await crawl(found, skipMap, relatedEntities, nested, _opts);
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
    const { updatedAt } = todo.metadata.timestampFields ?? {};
    if (updatedAt) {
      for (const e of todo.updates) {
        // We avoid going through `setField` because in unit tests, it might detect that our
        // bump's timestamp isn't actually different from the current value, and skip treating
        // it has changed. This is technically true, but this will break the oplock SQL generation,
        // so force the field to be dirty.
        const orm = getInstanceData(e);
        orm.originalData[updatedAt] = getField(e, updatedAt);
        const serde = todo.metadata.fields[updatedAt].serde as TimestampSerde<unknown>;
        orm.data[updatedAt] = serde.mapFromNow(now);
      }
    }
  }
}

let lastNow = undefined as Date | undefined;

// exposed so tests that do their own time management can override lastNow to get correct updatedAt values
export function setLastNow(now: Date | undefined) {
  lastNow = now;
}

function getNow(): Date {
  let now = new Date();
  // If we detect time has not progressed (or went backwards), we're probably in test that
  // has frozen time, which can throw off our oplocks b/c if Joist issues multiple `UPDATE`s
  // with exactly the same `updated_at`, the `updated_at` SQL trigger fallback will think "the caller
  // didn't self-manage `updated_at`" and so bump it for them. Which is fine, but now
  // Joist doesn't know about the bumped time, and the 2nd `UPDATE` will fail.
  if (lastNow && (lastNow.getTime() === now.getTime() || now.getTime() < lastNow.getTime())) {
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
    if (row.__class === "_" && maybeBaseMeta.ctiAbstract) {
      throw new Error(`${maybeBaseMeta.type} ${tagId(maybeBaseMeta, row.id)} must be instantiated via a subtype`);
    }
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

function maybeSetupHookOrdering(todos: Record<string, Todo>): Record<string, Todo>[] {
  // I'm too rushed to use a topo sort
  const group1: Record<string, Todo> = {};
  const group2: Record<string, Todo> = {};
  for (const todo of Object.values(todos)) {
    // If I should run before `cstr`, I go in group1
    const shouldRunBeforeAnotherGroup = todo.metadata.config.__data.runHooksBefore.some(
      (cstr) => getBaseMeta(getMetadata(cstr)).type in todos,
    );
    const group = shouldRunBeforeAnotherGroup ? group1 : group2;
    group[todo.metadata.type] = todo;
  }
  return Object.keys(group1).length ? [group1, group2] : [group2];
}

/**
 * Given an `err` thrown in "a different context", i.e. a database error or dataloader error
 * that doesn't include our stack trace, append our stack for better debugging.
 *
 * See https://github.com/brianc/node-postgres/pull/2983
 */
export function appendStack(err: unknown, dummy: Error): unknown {
  if (err && typeof err === "object" && "stack" in err) {
    err.stack += dummy.stack!.replace(/.*\n/, "\n");
  }
  return err;
}

/** Probe for `ctx.logger.debug` if it exists, otherwise fallback on `console.log`. */
function getDefaultWriteFn(ctx: unknown): WriteFn {
  return ctx &&
    typeof ctx === "object" &&
    "logger" in ctx &&
    ctx.logger &&
    typeof ctx.logger === "object" &&
    "debug" in ctx.logger &&
    ctx.logger.debug instanceof Function
    ? ctx.logger.debug.bind(ctx.logger)
    : console.log;
}

const fieldMap: Record<string, [Field, Column][]> = {};
// Generates what a row from the db would look like for a given entity
export function createRowFromEntityData(e: Entity, opts: { preferOriginalData?: boolean } = {}) {
  const { preferOriginalData = true } = opts;
  const { row: oldRow, data, originalData } = (e as any).__data as InstanceData;
  const __class = e.constructor.name;
  const { metadata: meta } = (e as any).__data as InstanceData;
  if (!fieldMap[__class]) {
    fieldMap[__class] = [];
    for (const field of Object.values(meta.allFields)) {
      if (!field.serde) continue;
      for (const column of field.serde.columns) {
        fieldMap[__class].push([field, column]);
      }
    }
  }

  const row: Record<string, any> = meta.inheritanceType === "cti" ? { __class } : {};

  for (const [field, column] of fieldMap[__class]) {
    const value: any =
      // Ideally, we could only go through the serde for data that has actually changed since the last time it was
      // fetched from the db and just use the row value for everything else.  Unfortunately, we lose track of which
      // fields are modified on flush. So we have to assume that anything present in `data` is a change and push it
      // through the serde.
      field.fieldName in originalData || field.fieldName in data
        ? // If our field is in originalData, then the field has been changed since flush. Our `row` should
          // reflect what would come from the db if we queried it right now, so use originalData when present
          column.rowValue(preferOriginalData && field.fieldName in originalData ? originalData : data)
        : // `data` is lazy and isn't set until it's accessed, so if the field isn't present there, then we should
          // be safe to pull the raw data out of `row`
          oldRow[column.columnName];
    row[column.columnName] = value ?? null;
  }
  return row;
}
