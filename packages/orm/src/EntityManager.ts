import { AsyncLocalStorage } from "async_hooks";
import DataLoader, { BatchLoadFn, Options } from "dataloader";
import { Knex } from "knex";
import { Entity, isEntity } from "./Entity";
import { ReactionsManager } from "./ReactionsManager";
import { Todo, combineJoinRows, createTodos } from "./Todo";
import { constraintNameToValidationError } from "./config";
import { createOrUpdatePartial } from "./createOrUpdatePartial";
import { findByUniqueDataLoader } from "./dataloaders/findByUniqueDataLoader";
import { findCountDataLoader } from "./dataloaders/findCountDataLoader";
import { findDataLoader } from "./dataloaders/findDataLoader";
import { findOrCreateDataLoader } from "./dataloaders/findOrCreateDataLoader";
import { loadDataLoader } from "./dataloaders/loadDataLoader";
import { Driver } from "./drivers/Driver";
import {
  Changes,
  CustomCollection,
  CustomReference,
  DeepPartialOrNull,
  EntityHook,
  EntityMetadata,
  ExpressionFilter,
  FilterWithAlias,
  GenericError,
  GraphQLFilterWithAlias,
  Lens,
  OneToManyCollection,
  PartialOrNull,
  PolymorphicReferenceImpl,
  UniqueFilter,
  ValidationError,
  ValidationErrors,
  ValidationRule,
  ValidationRuleResult,
  asConcreteCstr,
  assertIdIsTagged,
  getAllMetas,
  getBaseMeta,
  getConstructorFromTaggedId,
  getMetadata,
  getRelations,
  keyToString,
  loadLens,
  parseFindQuery,
  setField,
  setOpts,
  tagId,
} from "./index";
import { LoadHint, Loaded, NestedLoadHint, New, RelationsIn } from "./loadHints";
import { normalizeHint } from "./normalizeHints";
import { followReverseHint } from "./reactiveHints";
import { ManyToOneReferenceImpl, OneToOneReferenceImpl, PersistedAsyncReferenceImpl } from "./relations";
import { AbstractRelationImpl } from "./relations/AbstractRelationImpl";
import { JoinRow } from "./relations/ManyToManyCollection";
import { MaybePromise, assertNever, fail, getOrSet, toArray } from "./utils";

/**
 * The constructor for concrete entity types.
 *
 * Abstract entity types, like a base `Publisher` class that is marked `abstract`, cannot
 * implement this and instead only have the `AbsEntityConstructor` type.
 */
export interface EntityConstructor<T> {
  new (em: EntityManager<any>, opts: any): T;

  defaultValues: object;
  // Use any for now to pass the `.includes` test in `EntityConstructor.test.ts`. We could
  // probably do some sort of `tagOf(T)` look up, similar to filter types, which would return
  // either the string literal for a real `T`, or `any` if using `EntityConstructor<any>`.
  tagName: any;
  metadata: EntityMetadata<any>;
}

/** Options for the auto-batchable `em.find` queries, i.e. limit & offset aren't allowed. */
export interface FindFilterOptions<T extends Entity> {
  conditions?: ExpressionFilter;
  orderBy?: OrderOf<T>;
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
export type MaybeAbstractEntityConstructor<T> = abstract new (em: EntityManager<any>, opts: any) => T;

/** Return the `FooOpts` type a given `Foo` entity constructor. */
export type OptsOf<T> = T extends { __orm: { optsType: infer O } } ? O : never;

export type FieldsOf<T> = T extends { __orm: { fieldsType: infer O } } ? O : never;

export type OptIdsOf<T> = T extends { __orm: { optIdsType: infer O } } ? O : never;

/** Return the `Foo` type for a given `Foo` entity constructor. */
export type EntityOf<C> = C extends new (em: EntityManager, opts: any) => infer T ? T : never;

/** Pulls the entity query type out of a given entity type T. */
export type FilterOf<T> = T extends { __orm: { filterType: infer Q } } ? Q : never;

/** Pulls the entity GraphQL query type out of a given entity type T. */
export type GraphQLFilterOf<T> = T extends { __orm: { gqlFilterType: infer Q } } ? Q : never;

/** Pulls the entity order type out of a given entity type T. */
export type OrderOf<T> = T extends { __orm: { orderType: infer Q } } ? Q : never;

/**
 * Returns the opts of the entity's `newEntity` factory method, as exists in the actual file.
 *
 * This is because `FactoryOpts` is a set of defaults, but the user can customize it if they want.
 */
export type ActualFactoryOpts<T> = T extends { __orm: { factoryOptsType: infer Q } } ? Q : never;

/** Pulls the entity's id type out of a given entity type T. */
export type IdOf<T> = T extends { id: infer I | undefined } ? I : never;

export function isId(value: any): value is IdOf<unknown> {
  return value && typeof value === "string";
}

export let currentlyInstantiatingEntity: Entity | undefined;

export type EntityManagerHook = "beforeTransaction" | "afterTransaction";

type HookFn = (em: EntityManager, knex: Knex.Transaction) => MaybePromise<any>;

/**
 * A marker to prevent setter calls during `flush` calls.
 *
 * The `flush` process does a dirty check + SQL flush and generally doesn't want
 * entities to re-dirtied after it's done the initial dirty check. So we'd like
 * to prevent all setter calls while `flush` is running.
 *
 * That said, lifecycle code like hooks actually can make setter calls b/c `flush`
 * invokes them at a specific point in its process.
 *
 * We solve this by using node's `AsyncLocalStorage` to mark certain callbacks (promise
 * handlers) as blessed / invoked-from-`flush`-itself, and they are allowed to call setters,
 * but any external callers (i.e. application code) will be rejected.
 */
export const currentFlushSecret = new AsyncLocalStorage<{ flushSecret: number }>();

export type LoaderCache = Record<string, DataLoader<any, any>>;

export type TimestampFields = {
  updatedAt: string | undefined;
  createdAt: string | undefined;
  deletedAt: string | undefined;
};

export interface FlushOptions {
  /** Skip all validations, including reactive validations, when flushing */
  skipValidation?: boolean;
}

export class EntityManager<C = unknown> {
  public readonly ctx: C;
  public driver: Driver;
  public currentTxnKnex: Knex | undefined;
  private _entities: Entity[] = [];
  // Indexes the currently loaded entities by their tagged ids. This fixes a real-world
  // performance issue where `findExistingInstance` scanning `_entities` was an `O(n^2)`.
  private _entityIndex: Map<string, Entity> = new Map();
  private flushSecret: number = 0;
  private _isFlushing: boolean = false;
  private _isValidating: boolean = false;
  // TODO Make these private
  public pendingChildren: Map<string, Map<string, Entity[]>> = new Map();
  /**
   * Tracks cascade deletes.
   *
   * We originally used a beforeDelete lifecycle hook to implement this, but tracking this
   * individually allows us to a) recursively cascade deletes even during the 1st iteration
   * of our `flush` loop, and b) cascade deletions before we recalc fields & run user hooks,
   * so that both see the most accurate state.
   */
  private pendingCascadeDeletes: Entity[] = [];
  public dataloaders: Record<string, LoaderCache> = {};
  // This is attempting to be internal/module private
  __data = {
    joinRows: {} as Record<string, JoinRow[]>,
    /** Stores any `source -> downstream` reactions to recalc during `em.flush`. */
    rm: new ReactionsManager(),
  };
  private hooks: Record<EntityManagerHook, HookFn[]> = {
    beforeTransaction: [],
    afterTransaction: [],
  };

  constructor(em: EntityManager<C>);
  constructor(ctx: C, driver: Driver);
  constructor(emOrCtx: EntityManager<C> | C, driver?: Driver) {
    if (emOrCtx instanceof EntityManager) {
      const em = emOrCtx;
      this.driver = em.driver;
      this.hooks = {
        beforeTransaction: [...em.hooks.beforeTransaction],
        afterTransaction: [...em.hooks.afterTransaction],
      };
      this.ctx = em.ctx!;
    } else {
      this.ctx = emOrCtx!;
      this.driver = driver!;
    }
  }

  /** Returns a read-only shallow copy of the currently-loaded entities. */
  get entities(): ReadonlyArray<Entity> {
    return [...this._entities];
  }

  /** Looks up `id` in the list of already-loaded entities. */
  getEntity<T extends Entity>(id: IdOf<T>): T | undefined {
    assertIdIsTagged(id);
    return this._entityIndex.get(id) as T | undefined;
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
  public async find<T extends Entity>(type: MaybeAbstractEntityConstructor<T>, where: FilterWithAlias<T>): Promise<T[]>;
  public async find<T extends Entity, H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options?: FindFilterOptions<T> & { populate?: Const<H> },
  ): Promise<Loaded<T, H>[]>;
  async find<T extends Entity>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options?: FindFilterOptions<T> & { populate?: any },
  ): Promise<T[]> {
    const { populate, ...rest } = options || {};
    const settings = { where, ...rest };
    const rows = await findDataLoader(this, type, settings).load(settings);
    const result = rows.map((row) => this.hydrate(type, row, { overwriteExisting: false }));
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
  public async findPaginated<T extends Entity>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options: FindPaginatedFilterOptions<T>,
  ): Promise<T[]>;
  public async findPaginated<T extends Entity, H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options: FindPaginatedFilterOptions<T> & { populate: Const<H> },
  ): Promise<Loaded<T, H>[]>;
  async findPaginated<T extends Entity>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options: FindPaginatedFilterOptions<T> & { populate?: any },
  ): Promise<T[]> {
    const { populate, limit, offset, ...rest } = options || {};
    const query = parseFindQuery(getMetadata(type), where, rest);
    const rows = await this.driver.executeFind(this, query, { limit, offset });
    // check row limit
    const result = rows.map((row) => this.hydrate(type, row, { overwriteExisting: false }));
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
  public async findGql<T extends Entity>(
    type: MaybeAbstractEntityConstructor<T>,
    where: GraphQLFilterWithAlias<T>,
  ): Promise<T[]>;
  public async findGql<T extends Entity, H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    where: GraphQLFilterWithAlias<T>,
    options?: FindFilterOptions<T> & { populate?: Const<H> },
  ): Promise<Loaded<T, H>[]>;
  async findGql<T extends Entity>(
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
  public async findGqlPaginated<T extends Entity>(
    type: MaybeAbstractEntityConstructor<T>,
    where: GraphQLFilterWithAlias<T>,
    options: FindGqlPaginatedFilterOptions<T>,
  ): Promise<T[]>;
  public async findGqlPaginated<T extends Entity, H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    where: GraphQLFilterWithAlias<T>,
    options: FindGqlPaginatedFilterOptions<T> & { populate: Const<H> },
  ): Promise<Loaded<T, H>[]>;
  async findGqlPaginated<T extends Entity>(
    type: MaybeAbstractEntityConstructor<T>,
    where: GraphQLFilterWithAlias<T>,
    options: FindGqlPaginatedFilterOptions<T> & { populate?: any },
  ): Promise<T[]> {
    return this.findPaginated(type, where as any, options as any);
  }

  public async findOne<T extends Entity>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
  ): Promise<T | undefined>;
  public async findOne<T extends Entity, H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options?: {
      populate?: Const<H>;
      softDeletes?: "include" | "exclude";
    },
  ): Promise<Loaded<T, H> | undefined>;
  async findOne<T extends Entity>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options?: {
      populate?: any;
      softDeletes?: "include" | "exclude";
    },
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
  public async findOneOrFail<T extends Entity>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
  ): Promise<T>;
  public async findOneOrFail<T extends Entity, H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options: { populate?: Const<H>; softDeletes?: "include" | "exclude" },
  ): Promise<Loaded<T, H>>;
  async findOneOrFail<T extends Entity>(
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

  public async findByUnique<T extends Entity>(
    type: MaybeAbstractEntityConstructor<T>,
    where: UniqueFilter<T>,
  ): Promise<T | undefined>;
  public async findByUnique<T extends Entity, H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    where: UniqueFilter<T>,
    options?: {
      populate?: Const<H>;
      softDeletes?: "include" | "exclude";
    },
  ): Promise<Loaded<T, H> | undefined>;
  async findByUnique<T extends Entity>(
    type: MaybeAbstractEntityConstructor<T>,
    where: UniqueFilter<T>,
    options: {
      populate?: any;
      softDeletes?: "include" | "exclude";
    } = {},
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
      const entity = this.hydrate(type, row);
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
  async findCount<T extends Entity>(
    type: MaybeAbstractEntityConstructor<T>,
    where: FilterWithAlias<T>,
    options: FindCountFilterOptions<T> = {},
  ): Promise<number> {
    const { softDeletes = "exclude" } = options;

    let count = await findCountDataLoader(this, type, softDeletes).load({ where, ...options });

    // If the user is do "count all", we can adjust the number up/down based on
    // WIP creates/deletes. We can't do this if the WHERE clause is populated b/c
    // then we'd also have to eval each created/deleted entity against the WHERE
    // clause before knowing if it should adjust teh amount.
    const isSelectAll = Object.keys(where).length === 0;
    if (isSelectAll) {
      for (const entity of this._entities) {
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
    T extends Entity,
    F extends Partial<OptsOf<T>>,
    U extends Partial<OptsOf<T>> | {},
    N extends Omit<OptsOf<T>, keyof F | keyof U>,
  >(type: EntityConstructor<T>, where: F, ifNew: N, upsert?: U): Promise<T>;
  async findOrCreate<
    T extends Entity,
    F extends Partial<OptsOf<T>>,
    U extends Partial<OptsOf<T>> | {},
    N extends Omit<OptsOf<T>, keyof F | keyof U>,
    H extends LoadHint<T>,
  >(
    type: EntityConstructor<T>,
    where: F,
    ifNew: N,
    upsert?: U,
    options?: { populate?: Const<H>; softDeletes?: "include" | "exclude" },
  ): Promise<Loaded<T, H>>;
  async findOrCreate<
    T extends Entity,
    F extends Partial<OptsOf<T>>,
    U extends Partial<OptsOf<T>> | {},
    N extends Omit<OptsOf<T>, keyof F | keyof U>,
    H extends LoadHint<T>,
  >(
    type: EntityConstructor<T>,
    where: F,
    ifNew: N,
    upsert?: U,
    options?: { populate?: Const<H>; softDeletes?: "include" | "exclude" },
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
  public create<T extends Entity, O extends OptsOf<T>>(type: EntityConstructor<T>, opts: O): New<T, O> {
    // The constructor will run setOpts which handles defaulting collections to the right state.
    return new type(this, opts) as New<T, O>;
  }

  /** Creates a new `type` but with `opts` that are nullable, to accept partial-update-style input. */
  public createPartial<T extends Entity>(type: EntityConstructor<T>, opts: PartialOrNull<OptsOf<T>>): T {
    // We force some manual calls to setOpts to mimic `setUnsafe`'s behavior that `undefined` should
    // mean "ignore" (and we assume validation rules will catch it later) but still set
    // `calledFromConstructor` because this is _basically_ like calling `new`.
    const entity = new type(this, undefined!);
    // Could remove the `as OptsOf<T>` by adding a method overload on `partial: true`
    setOpts(entity, opts as OptsOf<T>, { partial: true, calledFromConstructor: true });
    return entity;
  }

  /** Creates a new `type` but with `opts` that are nullable, to accept partial-update-style input. */
  public createOrUpdatePartial<T extends Entity>(type: EntityConstructor<T>, opts: DeepPartialOrNull<T>): Promise<T> {
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
  public async clone<T extends Entity, H extends LoadHint<T>>(
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
  public async clone<T extends Entity, H extends LoadHint<T>>(
    entities: readonly T[],
    opts?: { deep?: H; skipIf?: (entity: Entity) => boolean; postClone?: (original: Entity, clone: Entity) => void },
  ): Promise<Loaded<T, H>[]>;
  public async clone<T extends Entity, H extends LoadHint<T>>(
    entityOrArray: T | readonly T[],
    opts?: { deep?: H; skipIf?: (entity: Entity) => boolean; postClone?: (original: Entity, clone: Entity) => void },
  ): Promise<Loaded<T, H> | Loaded<T, H>[]> {
    const { deep = {}, skipIf, postClone } = opts ?? {};
    // Keep a list that we can work against synchronously after doing the async find/crawl
    const todo: Entity[] = [];

    // 1. Find all entities w/o mutating them yets
    await crawl(todo, Array.isArray(entityOrArray) ? entityOrArray : [entityOrArray], deep, { skipIf });

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
                  return [f.fieldName, entity.__orm.data[f.fieldName]];
                } else {
                  return undefined;
                }
              case "m2o":
              case "poly":
              case "enum":
                return [f.fieldName, entity.__orm.data[f.fieldName]];
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
      Object.entries(clone).forEach(([fieldName, value]) => {
        if (
          value instanceof ManyToOneReferenceImpl ||
          value instanceof PolymorphicReferenceImpl ||
          value instanceof PersistedAsyncReferenceImpl
        ) {
          // What's the existing entity? Have we cloned it?
          const existingIdOrEntity = clone.__orm.data[fieldName];
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
          .map((original) => entityToClone.get(original) as Loaded<T, H>)
      : clones[0]
      ? (clones[0][1] as Loaded<T, H>)
      : fail("no entities were cloned given the provided options");
  }

  /** Returns an instance of `type` for the given `id`, resolving to an existing instance if in our Unit of Work. */
  public async load<T>(id: IdOf<T>): Promise<T>;
  public async load(id: string): Promise<Entity>;
  public async load<T extends Entity>(type: MaybeAbstractEntityConstructor<T>, id: string): Promise<T>;
  public async load<T extends Entity, H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    id: string,
    populate: Const<H>,
  ): Promise<Loaded<T, H>>;
  public async load<T extends Entity, H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    id: string,
    populate: Const<H>,
  ): Promise<Loaded<T, H>>;
  async load<T extends Entity>(
    typeOrId: MaybeAbstractEntityConstructor<T> | string,
    id?: string,
    hint?: any,
  ): Promise<T> {
    // Handle the `typeOrId` overload
    let type: MaybeAbstractEntityConstructor<T>;
    if (typeof typeOrId === "string") {
      type = getConstructorFromTaggedId(typeOrId);
      id = typeOrId;
    } else {
      type = typeOrId;
      id = id || fail();
    }
    if (typeof (id as any) !== "string") {
      throw new Error(`Expected ${id} to be a string`);
    }
    const meta = getMetadata(type);
    const tagged = tagId(meta, id);
    const entity = this.findExistingInstance<T>(tagged) || (await loadDataLoader(this, meta).load(tagged));
    if (!entity) {
      throw new NotFoundError(`${tagged} was not found`);
    }
    if (hint) {
      await this.populate(entity, hint);
    }
    return entity;
  }

  /** Returns instances of `type` for the given `ids`, resolving to an existing instance if in our Unit of Work. */
  public async loadAll<T extends Entity>(type: MaybeAbstractEntityConstructor<T>, ids: readonly string[]): Promise<T[]>;
  public async loadAll<T extends Entity, H extends LoadHint<T>>(
    type: MaybeAbstractEntityConstructor<T>,
    ids: readonly string[],
    populate: Const<H>,
  ): Promise<Loaded<T, H>[]>;
  async loadAll<T extends Entity>(
    type: MaybeAbstractEntityConstructor<T>,
    _ids: readonly string[],
    hint?: any,
  ): Promise<T[]> {
    const meta = getMetadata(type);
    const ids = _ids.map((id) => tagId(meta, id));
    const entities = await Promise.all(
      ids.map((id) => {
        return this.findExistingInstance(id) || loadDataLoader(this, meta).load(id);
      }),
    );
    const idsNotFound = ids.filter((id, i) => entities[i] === undefined);
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
  public async loadAllIfExists<T extends Entity>(type: EntityConstructor<T>, ids: readonly string[]): Promise<T[]>;
  public async loadAllIfExists<T extends Entity, H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    ids: readonly string[],
    populate: Const<H>,
  ): Promise<Loaded<T, H>[]>;
  async loadAllIfExists<T extends Entity>(
    type: EntityConstructor<T>,
    _ids: readonly string[],
    hint?: any,
  ): Promise<T[]> {
    const meta = getMetadata(type);
    const ids = _ids.map((id) => tagId(meta, id));
    const entities = (
      await Promise.all(
        ids.map((id) => {
          return this.findExistingInstance(id) || loadDataLoader(this, meta).load(id);
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
  public async loadLens<T extends Entity, U, V>(entities: T[], fn: (lens: Lens<T>) => Lens<U, V>): Promise<U[]>;
  public async loadLens<T extends Entity, U extends Entity, V, H extends LoadHint<U>>(
    entities: T[],
    fn: (lens: Lens<T>) => Lens<U, V>,
    populate: Const<H>,
  ): Promise<Loaded<U, H>[]>;
  public async loadLens<T extends Entity, U, V>(
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
  public async loadFromQuery<T extends Entity>(type: EntityConstructor<T>, query: Knex.QueryBuilder): Promise<T[]>;
  public async loadFromQuery<T extends Entity, H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    query: Knex.QueryBuilder,
    populate: Const<H>,
  ): Promise<Loaded<T, H>[]>;
  public async loadFromQuery<T extends Entity>(
    type: EntityConstructor<T>,
    query: Knex.QueryBuilder,
    populate?: any,
  ): Promise<T[]> {
    const rows = await query;
    const entities = rows.map((row: any) => this.hydrate(type, row, { overwriteExisting: false }));
    if (populate) {
      await this.populate(entities, populate);
    }
    return entities;
  }

  /** Loads entities from rows. */
  public async loadFromRows<T extends Entity>(type: EntityConstructor<T>, rows: unknown[]): Promise<T[]>;
  public async loadFromRows<T extends Entity, H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    rows: unknown[],
    populate: Const<H>,
  ): Promise<Loaded<T, H>[]>;
  public async loadFromRows<T extends Entity>(
    type: EntityConstructor<T>,
    rows: unknown[],
    populate?: any,
  ): Promise<T[]> {
    const entities = rows.map((row: any) => this.hydrate(type, row, { overwriteExisting: false }));
    if (populate) {
      await this.populate(entities, populate);
    }
    return entities;
  }

  /** Given a hint `H` (a field, array of fields, or nested hash), pre-load that data into `entity` for sync access. */
  public async populate<T extends Entity, H extends LoadHint<T>, V = Loaded<T, H>>(
    entity: T,
    hint: Const<H>,
    fn?: (entity: Loaded<T, H>) => V,
  ): Promise<V>;
  public async populate<T extends Entity, H extends LoadHint<T>, V = Loaded<T, H>>(
    entity: T,
    opts: { hint: Const<H>; forceReload?: boolean },
    fn?: (entity: Loaded<T, H>) => V,
  ): Promise<V>;
  public async populate<T extends Entity, H extends LoadHint<T>>(
    entities: ReadonlyArray<T>,
    hint: Const<H>,
  ): Promise<Loaded<T, H>[]>;
  public async populate<T extends Entity, H extends LoadHint<T>>(
    entities: ReadonlyArray<T>,
    opts: { hint: Const<H>; forceReload?: boolean },
  ): Promise<Loaded<T, H>[]>;
  populate<T extends Entity, H extends LoadHint<T>, V>(
    entityOrList: T | T[],
    hintOrOpts: { hint: H; forceReload?: boolean } | H,
    fn?: (entity: Loaded<T, H>) => V,
  ): Promise<Loaded<T, H> | Array<Loaded<T, H>> | V> {
    const { hint: hintOpt, ...opts } =
      // @ts-ignore for some reason TS thinks `"hint" in hintOrOpts` is operating on a primitive
      typeof hintOrOpts === "object" && "hint" in hintOrOpts ? hintOrOpts : { hint: hintOrOpts };

    // I'm tempted to throw an error here, because at least internal callers should ideally pre-check
    // that `list > 0` and `Object.keys(hint).length > 0` before calling `populate`, just as an optimization.
    // But since it's a public API, we should just early exit.
    const list = toArray(entityOrList).filter((e) => e !== undefined && (e.isPendingDelete || !e.isDeletedEntity));
    if (list.length === 0) {
      return !fn ? (entityOrList as any) : fn(entityOrList as any);
    }

    // If a bunch of `.load`s get called in parallel for the same entity type + load hint, dedup them down
    // to a single promise to avoid making more and more promises with each level/fan-out of a nested load hint.
    const batchKey = `${list[0]?.__orm.metadata.tagName}-${JSON.stringify(hintOpt)}-${opts.forceReload}`;
    const loader = this.getLoader(
      "populate",
      batchKey,
      (batch) => {
        // Because we're using `{ cache: false }`, we could have dups in the list, so unique
        const list = [...new Set(batch)];

        const hints = Object.entries(normalizeHint(hintOpt as any));

        // One breadth-width pass to ensure each relation is loaded
        const loadPromises = list.flatMap((entity) => {
          return hints.map(([key]) => {
            const relation = (entity as any)[key];
            if (!relation || typeof relation.load !== "function") {
              throw new Error(`Invalid load hint '${key}' on ${entity}`);
            }
            return relation.isLoaded && !opts.forceReload ? undefined : (relation.load(opts) as Promise<any>);
          });
        });

        // 2nd breadth-width pass to do nested load hints
        return Promise.all(loadPromises).then(() => {
          const nestedLoadPromises = hints.map(([key, nestedHint]) => {
            if (Object.keys(nestedHint).length === 0) return;
            // Unique for good measure?...
            const children = [...new Set(list.map((entity) => toArray(getEvenDeleted((entity as any)[key]))).flat())];
            if (children.length === 0) return;
            return this.populate(children, { hint: nestedHint, ...opts });
          });
          // After the nested hints are done, echo back the original now-loaded list
          return Promise.all(nestedLoadPromises).then(() => batch);
        });
      },
      // We always disable caching, because during a UoW, having called `populate(author, nestedHint1)`
      // once doesn't mean that, on the 2nd call to `populate(author, nestedHint1)`, we can completely
      // skip it b/c author's relations may have been changed/mutated to different not-yet-loaded
      // entities.
      //
      // Even though having `{ cache: false }` looks weird here, i.e. why use dataloader at all?, it
      // still helps us fan-in resolvers callers that are happening ~simultaneously into the same
      // effort.
      { cache: false },
    );

    // Purposefully use `then` instead of `async` as an optimization; avoid using loader.loadMany so
    // that we don't have to check its allSettled-style `Array<V | Error>` return value for errors.
    return Promise.all(list.map((entity) => loader.load(entity))).then(() =>
      fn ? fn(entityOrList as any) : (entityOrList as any),
    );
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
  register(meta: EntityMetadata<any>, entity: Entity): void {
    if (entity.idTagged) {
      if (this.findExistingInstance(entity.idTagged) !== undefined) {
        throw new Error(`Entity ${entity} has a duplicate instance already loaded`);
      }
      this._entityIndex.set(entity.idTagged, entity);
    }

    this._entities.push(entity);
    if (this._entities.length >= entityLimit) {
      throw new Error(`More than ${entityLimit} entities have been instantiated`);
    }

    // Set a default createdAt/updatedAt that we'll keep if this is a new entity, or over-write if we're loaded an existing row
    if (entity.isNewEntity) {
      const { createdAt, updatedAt } = getBaseMeta(getMetadata(entity)).timestampFields;
      if (createdAt) {
        entity.__orm.data[createdAt] = new Date();
      }
      if (updatedAt) {
        entity.__orm.data[updatedAt] = new Date();
      }
      this.__data.rm.queueAllDownstreamFields(entity);
    }

    currentlyInstantiatingEntity = entity;
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
    if (entity.__orm.deleted) {
      return;
    }
    entity.__orm.deleted = "pending";
    // Any derived fields that read this entity will need recalc-d
    this.__data.rm.queueAllDownstreamFields(entity);
    // Synchronously unhook the entity if the relations are loaded
    getCascadeDeleteRelations(entity).forEach((r) => r.maybeCascadeDelete());
    // And queue the cascade deletes
    this.pendingCascadeDeletes.push(entity);
  }

  async assignNewIds() {
    let pendingEntities = this.entities.filter((e) => e.isNewEntity && !e.id);
    let todos = createTodos(pendingEntities);
    return this.driver.assignNewIds(this, todos);
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
    const { skipValidation = false } = flushOptions;

    if (this.isFlushing) {
      throw new Error("Cannot flush while another flush is already in progress");
    }

    this._isFlushing = true;

    await currentFlushSecret.run({ flushSecret: this.flushSecret }, async () => {
      // Recalc any touched entities
      const touched = this.entities.filter((e) => e.__orm.isTouched);
      if (touched.length > 0) {
        await recalcTouchedEntities(touched);
      }
      // Cascade deletes now that we're async (i.e. to keep `em.delete` synchronous).
      // Also do this before calling `recalcPendingDerivedValues` to avoid recalculating
      // fields on entities that will be deleted (and probably have unset/invalid FKs
      // that would NPE their logic anyway).
      await this.cascadeDeletes();
      // Recalc before we run hooks, so the hooks will see the latest calculated values.
      await this.__data.rm.recalcPendingDerivedValues();
    });

    const hooksInvoked: Set<Entity> = new Set();
    let pendingEntities = this.entities.filter((e) => e.isPendingFlush);

    try {
      while (pendingEntities.length > 0) {
        // Run hooks in a series of loops until things "settle down"
        await currentFlushSecret.run({ flushSecret: this.flushSecret }, async () => {
          // Run our hooks
          let todos = createTodos(pendingEntities);
          await beforeCreate(this.ctx, todos);
          await beforeUpdate(this.ctx, todos);
          await beforeFlush(this.ctx, todos);
          // Recalc todos in case one of ^ hooks did an em.delete that moved an
          // entity in this pending loop from created/updated to deleted.
          todos = createTodos(pendingEntities);
          await beforeDelete(this.ctx, todos);

          // Call `setField` just to get the column marked as dirty if needed.
          // This can come after the hooks, b/c if the hooks read any of these
          // fields, they'd be via the synchronous getter and would not be stale.
          recalcSynchronousDerivedFields(todos);

          // The hooks could have deleted this-loop or prior-loop entities, so re-cascade again.
          await this.cascadeDeletes();
          // The hooks could have changed fields, so recalc again.
          await this.__data.rm.recalcPendingDerivedValues();

          for (const e of pendingEntities) hooksInvoked.add(e);
          pendingEntities = this.entities.filter((e) => e.isPendingFlush && !hooksInvoked.has(e));
          this.flushSecret += 1;
        });
      }

      // Recreate todos now that we've run hooks and recalculated fields so know
      // the full set of entities that will be INSERT/UPDATE/DELETE-d in the database.
      const entitiesToFlush = [...hooksInvoked];
      const entityTodos = createTodos(entitiesToFlush);

      if (!skipValidation) {
        try {
          this._isValidating = true;
          // Run simple rules first b/c it includes not-null/required rules, so that then when we run
          // `validateReactiveRules` next, the lambdas won't see invalid entities.
          await validateSimpleRules(entityTodos);
          await validateReactiveRules(entityTodos);
        } finally {
          this._isValidating = false;
        }
        await afterValidation(this.ctx, entityTodos);
      }

      const joinRowTodos = combineJoinRows(this.__data.joinRows);

      if (Object.keys(entityTodos).length > 0 || Object.keys(joinRowTodos).length > 0) {
        // The driver will handle the right thing if we're already in an existing transaction.
        // We also purposefully don't pass an isolation level b/c if we're only doing
        // INSERTs and UPDATEs, then we don't really care about overlapping SELECT-then-INSERT
        // serialization anomalies. (Although should we? Maybe we should run the flush hooks
        // in this same transaction just as a matter of principle / safest default.)
        await this.driver.transaction(this, async () => {
          await this.driver.flushEntities(this, entityTodos);
          await this.driver.flushJoinTables(this, joinRowTodos);
        });

        // TODO: This is really "after flush" if we're being called from a transaction that
        // is going to make multiple `em.flush()` calls?
        await afterCommit(this.ctx, entityTodos);

        Object.values(entityTodos).forEach((todo) => {
          todo.inserts.forEach((e) => {
            this._entityIndex.set(e.idTagged!, e);
            e.__orm.isNew = false;
          });
          todo.deletes.forEach((e) => {
            e.__orm.deleted = "deleted";
          });
          [todo.inserts, todo.updates, todo.deletes].flat().forEach((e) => {
            e.__orm.originalData = {};
            e.__orm.isTouched = false;
          });
        });

        // Reset the find caches b/c data will have changed in the db
        this.dataloaders = {};
        this.__data.rm.clear();
      }

      return entitiesToFlush;
    } catch (e) {
      if (e && typeof e === "object" && "constraint" in e && typeof e.constraint === "string") {
        const message = constraintNameToValidationError[e.constraint];
        if (message) {
          throw new ValidationErrors(message);
        }
      }
      throw e;
    } finally {
      this._isFlushing = false;
    }
  }

  get isFlushing(): boolean {
    return this._isFlushing;
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
  async refresh(entity: Entity): Promise<void>;
  async refresh(entities: ReadonlyArray<Entity>): Promise<void>;
  async refresh(param?: Entity | ReadonlyArray<Entity> | { deepLoad?: boolean }): Promise<void> {
    this.dataloaders = {};
    const deepLoad = param && "deepLoad" in param && param.deepLoad;
    let todo =
      param === undefined ? this._entities : Array.isArray(param) ? param : isEntity(param) ? [param] : this._entities;
    const done = new Set<Entity>();
    while (todo.length > 0) {
      const copy = [...todo];
      copy.forEach((e) => done.add(e));
      todo = [];

      // Clear the original cached loader result and fetch the new primitives
      const entities = await Promise.all(
        copy.filter((e) => e.idTagged).map((entity) => loadDataLoader(this, getMetadata(entity)).load(entity.idTagged)),
      );

      // Then refresh any non-deleted loaded collections
      const relations = entities
        .filter((e) => e && e.__orm.deleted === undefined)
        .flatMap((entity) => getRelations(entity))
        .filter((r) => deepLoad || r.isLoaded);
      await Promise.all(relations.map((r) => r.load({ forceReload: true })));

      // If deep loading, get all entity/entities in the relation and push them on the list
      if (deepLoad) {
        todo.push(
          ...relations
            .filter((r) => "get" in r)
            // We skip recursing into CustomCollections and CustomReferences and PersistedAsyncReferencesImpl for two reasons:
            // 1. It can be tricky to ensure `{ forceReload: true }` is passed all the way through their custom load
            // implementations, and so it's easy to have `.get` accidentally come across a not-yet-loaded collection, and
            // 2. Any custom load functions should use the underlying o2m/m2o/etc relations anyway, so if we crawl/refresh
            // those, then when the user calls `.get` on custom collections/references, they should be talking to always-loaded
            // relations, w/o us having to tackle the tricky bookkeeping problem passing `forceReload` all through their
            // custom load function + any other collections they call.
            .filter(
              (r) =>
                !(
                  r instanceof CustomCollection ||
                  r instanceof CustomReference ||
                  r instanceof PersistedAsyncReferenceImpl
                ),
            )
            .map((r) => (r as any).get)
            .flatMap((value) => (Array.isArray(value) ? value : [value]))
            .filter((value) => isEntity(value) && !done.has(value)),
        );
      }
    }
  }

  public get numberOfEntities(): number {
    return this.entities.length;
  }

  // Handles our Unit of Work-style look up / deduplication of entity instances.
  // Currently only public for the driver impls
  public findExistingInstance<T>(id: string): T | undefined {
    assertIdIsTagged(id);
    return this._entityIndex.get(id) as T | undefined;
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
  public hydrate<T extends Entity>(
    type: MaybeAbstractEntityConstructor<T>,
    row: any,
    options?: { overwriteExisting?: boolean },
  ): T {
    const maybeBaseMeta = getMetadata(type);
    const id = keyToString(maybeBaseMeta, row["id"]) || fail("No id column was available");
    // See if this is already in our UoW
    let entity = this.findExistingInstance(id) as T;
    if (!entity) {
      // Look for __class from the driver telling us which subtype to instantiate
      const meta = row.__class
        ? maybeBaseMeta.subTypes.find((st) => st.type === row.__class) ?? maybeBaseMeta
        : maybeBaseMeta;
      // Pass id as a hint that we're in hydrate mode
      // `asConcreteCstr` is safe b/c we should have detected the right subtype via __class
      entity = new (asConcreteCstr(meta.cstr))(this, id);
      Object.values(meta.allFields).forEach((f) => f.serde?.setOnEntity(entity!.__orm.data, row));
    } else if (options?.overwriteExisting !== false) {
      const meta = getMetadata(entity);
      // Usually if the entity already exists, we don't write over it, but in this case
      // we assume that `EntityManager.refresh` is telling us to explicitly load the
      // latest data.
      Object.values(meta.allFields).forEach((f) => f.serde?.setOnEntity(entity!.__orm.data, row));
    }
    return entity;
  }

  /**
   * Mark an entity as needing to be flushed regardless of its state
   */
  public touch(entity: Entity) {
    entity.__orm.isTouched = true;
  }

  public beforeTransaction(fn: HookFn) {
    this.hooks.beforeTransaction.push(fn);
  }

  public afterTransaction(fn: HookFn) {
    this.hooks.afterTransaction.push(fn);
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
    // https://github.com/stephenh/joist-ts/issues/629
    const loadersForKind = (this.dataloaders[operation] ??= {});
    return getOrSet(loadersForKind, batchKey, () => new DataLoader(fn, opts));
  }

  public toString(): string {
    return "EntityManager";
  }

  /** Recursively cascades any pending deletions. */
  private async cascadeDeletes(): Promise<void> {
    let entities = this.pendingCascadeDeletes;
    this.pendingCascadeDeletes = [];
    // Loop if our deletes cascade to other deletes
    while (entities.length > 0) {
      // For cascade delete relations, cascade the delete...
      await Promise.all(
        entities.flatMap(getCascadeDeleteRelations).map((r) => r.load().then(() => r.maybeCascadeDelete())),
      );
      // For all relations, unhook the entity from the other side
      await Promise.all(entities.flatMap(getRelations).map((r) => r.cleanupOnEntityDeleted()));
      entities = this.pendingCascadeDeletes;
      this.pendingCascadeDeletes = [];
    }
  }
}

export let entityLimit = 10_000;

export function setEntityLimit(limit: number) {
  entityLimit = limit;
}

export function setDefaultEntityLimit() {
  entityLimit = 10_000;
}

export function isKey(k: any): k is string {
  return typeof k === "string";
}

/** Compares `a` to `b`, where `b` might be an id. */
export function sameEntity(a: Entity | string | undefined, b: Entity | string | undefined): boolean {
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
  const aId = isEntity(a) ? a.idTagged : a;
  const bId = isEntity(b) ? b.idTagged : b;
  return aId === bId;
}

/** Thrown by `findOneOrFail`, 'load' & 'loadAll' if an entity is not found. */
export class NotFoundError extends Error {}

/** Thrown by `findOne` and `findOneOrFail` if more than one entity is found. */
export class TooManyError extends Error {}

/** Force recalc all async fields on entities that were `em.touch`-d. */
async function recalcTouchedEntities(touched: Entity[]): Promise<void> {
  const relations = touched.flatMap((entity) =>
    Object.values(getMetadata(entity).allFields)
      .filter((f) => "derived" in f && f.derived === "async")
      .map((field) => (entity as any)[field.fieldName]),
  );
  await Promise.all(relations.map((r: any) => r.load()));
}

/**
 * For the entities currently in `todos`, find any reactive validation rules that point
 * from the currently-changed entities back to each rule's originally-defined-in entity,
 * and ensure those entities are added to `todos`.
 */
async function validateReactiveRules(todos: Record<string, Todo>): Promise<void> {
  // Use a map of rule -> Set<Entity> so that we only invoke a rule once per entity,
  // even if it was triggered by multiple changed fields.
  const fns: Map<ValidationRule<any>, Set<Entity>> = new Map();

  const p1 = Object.values(todos).flatMap((todo) => {
    const entities = [...todo.inserts, ...todo.updates, ...todo.deletes];
    // Find each statically-declared reactive rule for the given entity type
    const rules = getAllMetas(todo.metadata).flatMap((m) => m.config.__data.reactiveRules);
    return rules.map(async (rule) => {
      // Of all changed entities of this type, how many specifically trigger this rule?
      const triggered = entities.filter(
        (e) =>
          e.isNewEntity ||
          e.isDeletedEntity ||
          ((e as any).changes as Changes<any>).fields.some((f) => rule.fields.includes(f)),
      );
      // From these "triggered" entities, queue the "found"/owner entity to rerun this rule
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
    });
  });
  await Promise.all(p1);

  // Now that we've found the fn+entities to run, run them and collect any errors
  const p2 = [...fns.entries()].flatMap(([fn, entities]) =>
    [...entities].map(async (entity) => coerceError(entity, await fn(entity))),
  );
  const errors = (await Promise.all(p2)).flat();
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
        const rules = getAllMetas(getMetadata(entity)).flatMap((m) => m.config.__data.rules);
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
  return Promise.all(em["hooks"].beforeTransaction.map((fn) => fn(em, knex)));
}

export function afterTransaction(em: EntityManager, knex: Knex.Transaction): Promise<unknown> {
  return Promise.all(em["hooks"].afterTransaction.map((fn) => fn(em, knex)));
}

async function runHook(
  ctx: unknown,
  hook: EntityHook,
  todos: Record<string, Todo>,
  keys: ("inserts" | "deletes" | "updates")[],
): Promise<void> {
  const p = Object.values(todos).flatMap((todo) => {
    return keys
      .flatMap((k) => todo[k].filter((e) => k === "deletes" || !e.isDeletedEntity))
      .flatMap((entity) => {
        const hookFns = getAllMetas(getMetadata(entity)).flatMap((m) => m.config.__data.hooks[hook]);
        // Use an explicit `async` here to ensure all hooks are promises, i.e. so that a non-promise
        // hook blowing up doesn't orphan the others .
        return hookFns.map(async (fn) => fn(entity, ctx as any));
      });
  });
  // Use `allSettled` so that even if 1 hook blows up, we don't orphan other hooks mid-flush
  const rejects = (await Promise.allSettled(p)).filter((r) => r.status === "rejected");
  // For now just throw the 1st rejection; this should be pretty rare
  if (rejects.length > 0 && rejects[0].status === "rejected") {
    throw rejects[0].reason;
  }
}

function beforeDelete(ctx: unknown, todos: Record<string, Todo>): Promise<unknown> {
  return runHook(ctx, "beforeDelete", todos, ["deletes"]);
}

function beforeFlush(ctx: unknown, todos: Record<string, Todo>): Promise<unknown> {
  return runHook(ctx, "beforeFlush", todos, ["inserts", "updates"]);
}

function beforeCreate(ctx: unknown, todos: Record<string, Todo>): Promise<unknown> {
  return runHook(ctx, "beforeCreate", todos, ["inserts"]);
}

function beforeUpdate(ctx: unknown, todos: Record<string, Todo>): Promise<unknown> {
  return runHook(ctx, "beforeUpdate", todos, ["updates"]);
}

function afterValidation(ctx: unknown, todos: Record<string, Todo>): Promise<unknown> {
  return runHook(ctx, "afterValidation", todos, ["inserts", "updates"]);
}

function afterCommit(ctx: unknown, todos: Record<string, Todo>): Promise<unknown> {
  return runHook(ctx, "afterCommit", todos, ["inserts", "updates", "deletes"]);
}

function coerceError(entity: Entity, maybeError: ValidationRuleResult<any>): ValidationError[] {
  if (maybeError === undefined) {
    return [];
  } else if (typeof maybeError === "string") {
    return [{ entity, message: maybeError }];
  } else if (Array.isArray(maybeError)) {
    return (maybeError as GenericError[]).map((ve) => ({ entity, ...ve }));
  } else {
    return [{ entity, ...maybeError }];
  }
}

// See https://github.com/microsoft/TypeScript/issues/30680#issuecomment-752725353
type Narrowable = string | number | boolean | symbol | object | undefined | {} | [];
export type Const<N> =
  | N
  | {
      [K in keyof N]: N[K] extends Narrowable ? N[K] | Const<N[K]> : never;
    };

/** Evaluates each (non-async) derived field to see if it's value has changed. */
function recalcSynchronousDerivedFields(todos: Record<string, Todo>) {
  const entities = Object.values(todos)
    .flatMap((todo) => [...todo.inserts, ...todo.updates])
    .filter((e) => !e.isDeletedEntity);
  const derivedFieldsByMeta = new Map(
    [...new Set(entities.map(getMetadata))].map((m) => {
      return [
        m,
        Object.values(m.fields)
          .filter((f) => f.kind === "primitive" && f.derived === "sync")
          .map((f) => f.fieldName),
      ];
    }),
  );

  for (const entity of entities) {
    const derivedFields = getAllMetas(getMetadata(entity)).flatMap((m) => derivedFieldsByMeta.get(m) || []);
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
          } else if (relation instanceof PersistedAsyncReferenceImpl) {
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

/** Probes `relation` to see if it's a m2o/o2m/m2m relation that supports `getWithDeleted`, otherwise calls `get`. */
function getEvenDeleted(relation: any): any {
  return "getWithDeleted" in relation ? relation.getWithDeleted : relation.get;
}

function getCascadeDeleteRelations(entity: Entity): AbstractRelationImpl<any>[] {
  return getAllMetas(getMetadata(entity)).flatMap((meta) => {
    return meta.config.__data.cascadeDeleteFields.map((fieldName) => (entity as any)[fieldName]);
  });
}
