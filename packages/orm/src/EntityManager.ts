import { AsyncLocalStorage } from "async_hooks";
import DataLoader from "dataloader";
import { Knex } from "knex";
import { createOrUpdatePartial } from "./createOrUpdatePartial";
import { findDataLoader } from "./dataloaders/findDataLoader";
import { loadDataLoader } from "./dataloaders/loadDataLoader";
import { Driver } from "./drivers/driver";
import {
  assertIdsAreTagged,
  ConfigApi,
  CustomCollection,
  CustomReference,
  DeepNew,
  DeepPartialOrNull,
  EntityHook,
  FieldSerde,
  GenericError,
  getConstructorFromTaggedId,
  getRelations,
  keyToString,
  maybeResolveReferenceToId,
  OneToManyCollection,
  PartialOrNull,
  PolymorphicKeySerde,
  setField,
  setOpts,
  tagId,
  ValidationError,
  ValidationErrors,
  ValidationRuleResult,
} from "./index";
import { Loaded, LoadHint, NestedLoadHint, New, RelationsIn } from "./loaded";
import { ManyToOneReferenceImpl, OneToOneReferenceImpl } from "./relations";
import { JoinRow } from "./relations/ManyToManyCollection";
import { combineJoinRows, createTodos, getTodo, Todo } from "./Todo";
import { fail, toArray } from "./utils";

export interface EntityConstructor<T> {
  new (em: EntityManager<any>, opts: any): T;

  defaultValues: object;
}

/** Return the `FooOpts` type a given `Foo` entity constructor. */
export type OptsOf<T> = T extends { __orm: { optsType: infer O } } ? O : never;

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

/** The `__orm` metadata field we track on each instance. */
export interface EntityOrmField {
  /** A point to our entity type's metadata. */
  metadata: EntityMetadata<Entity>;
  /** A bag for our primitives/fk column values. */
  data: Record<any, any>;
  /** A bag to keep the original values, lazily populated. */
  originalData: Record<any, any>;
  /** Whether our entity has been deleted or not. */
  deleted?: "pending" | "deleted";
  /** All entities must be associated to an `EntityManager` to handle lazy loading/etc. */
  em: EntityManager;
  /** Whether our entity is new or not. */
  isNew: boolean;
  /** Whether our entity should flush regardless of any other changes. */
  isTouched: boolean;
}

export let currentlyInstantiatingEntity: Entity | undefined;

/** A marker/base interface for all of our entity types. */
export interface Entity {
  id: string | undefined;
  idOrFail: string;
  __orm: EntityOrmField;
  readonly em: EntityManager<any>;
  readonly isNewEntity: boolean;
  readonly isDeletedEntity: boolean;
  readonly isDirtyEntity: boolean;
  readonly isPendingFlush: boolean;
  readonly isPendingDelete: boolean;
  set(opts: Partial<OptsOf<this>>): void;
  setPartial(values: PartialOrNull<OptsOf<this>>): void;
}
type MaybePromise<T> = T | PromiseLike<T>;
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

export type TimestampFields = { updatedAt: string | undefined; createdAt: string | undefined };

export interface FlushOptions {
  /** Skip all validations, including reactive validations, when flushing */
  skipValidation?: boolean;
}

export class EntityManager<C = {}> {
  public readonly ctx: C;
  public driver: Driver;
  public currentTxnKnex: Knex | undefined;
  private _entities: Entity[] = [];
  // Indexes the currently loaded entities by their tagged ids. This fixes a real-world
  // performance issue where `findExistingInstance` scanning `_entities` was an `O(n^2)`.
  private _entityIndex: Map<string, Entity> = new Map();
  private flushSecret: number = 0;
  private _isFlushing: boolean = false;
  // TODO Make these private
  public loadLoaders: LoaderCache = {};
  public findLoaders: LoaderCache = {};
  // This is attempting to be internal/module private
  __data = {
    joinRows: {} as Record<string, JoinRow[]>,
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
  getEntity<T extends Entity>(tableName: string, id: IdOf<T>): T | undefined {
    return this._entityIndex.get(`${tableName}:${id}`) as T | undefined;
  }

  public async find<T extends Entity>(type: EntityConstructor<T>, where: FilterOf<T>): Promise<T[]>;
  public async find<T extends Entity, H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    where: FilterOf<T>,
    options?: { populate?: Const<H>; orderBy?: OrderOf<T>; limit?: number; offset?: number },
  ): Promise<Loaded<T, H>[]>;
  async find<T extends Entity>(
    type: EntityConstructor<T>,
    where: FilterOf<T>,
    options?: { populate?: any; orderBy?: OrderOf<T>; limit?: number; offset?: number },
  ): Promise<T[]> {
    const rows = await findDataLoader(this, type).load({ where, ...options });
    const result = rows.map((row) => this.hydrate(type, row, { overwriteExisting: false }));
    if (options?.populate) {
      await this.populate(result, options.populate);
    }
    return result;
  }

  /**
   * Works exactly like `find` but accepts "less than greatly typed" GraphQL filters.
   *
   * I.e. filtering by `null` on fields that are non-`nullable`.
   */
  public async findGql<T extends Entity>(type: EntityConstructor<T>, where: GraphQLFilterOf<T>): Promise<T[]>;
  public async findGql<T extends Entity, H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    where: GraphQLFilterOf<T>,
    options?: { populate?: Const<H>; orderBy?: OrderOf<T>; limit?: number; offset?: number },
  ): Promise<Loaded<T, H>[]>;
  async findGql<T extends Entity>(
    type: EntityConstructor<T>,
    where: FilterOf<T>,
    options?: { populate?: any; orderBy?: OrderOf<T>; limit?: number; offset?: number },
  ): Promise<T[]> {
    const rows = await findDataLoader(this, type).load({ where, ...options });
    const result = rows.map((row) => this.hydrate(type, row, { overwriteExisting: false }));
    if (options?.populate) {
      await this.populate(result, options.populate);
    }
    return result;
  }

  public async findOne<T extends Entity>(type: EntityConstructor<T>, where: FilterOf<T>): Promise<T | undefined>;
  public async findOne<T extends Entity, H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    where: FilterOf<T>,
    options?: { populate: Const<H> },
  ): Promise<Loaded<T, H> | undefined>;
  async findOne<T extends Entity>(
    type: EntityConstructor<T>,
    where: FilterOf<T>,
    options?: { populate: any },
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
  public async findOneOrFail<T extends Entity>(type: EntityConstructor<T>, where: FilterOf<T>): Promise<T>;
  public async findOneOrFail<T extends Entity, H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    where: FilterOf<T>,
    options: { populate: Const<H> },
  ): Promise<Loaded<T, H>>;
  async findOneOrFail<T extends Entity>(
    type: EntityConstructor<T>,
    where: FilterOf<T>,
    options?: { populate: any },
  ): Promise<T> {
    const list = await this.find(type, where, options);
    if (list.length === 0) {
      throw new NotFoundError(`Did not find ${type.name} for given query`);
    } else if (list.length > 1) {
      throw new TooManyError(`Found more than one: ${list.map((e) => e.toString()).join(", ")}`);
    }
    return list[0];
  }

  /**
   * Conditionally finds or creates an Entity.
   *
   * The types work out where the `where` + `ifNewOpts` are both subsets of the entity's `Opts`
   * type, i.e. if we have to create the entity, the combintaion of `where` + `ifNewOpts` will
   * have all of the necessary required fields.
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
    O extends Omit<OptsOf<T>, keyof F | keyof U>,
  >(type: EntityConstructor<T>, where: F, ifNew: O, upsert?: U): Promise<T>;
  async findOrCreate<
    T extends Entity,
    F extends Partial<OptsOf<T>>,
    U extends Partial<OptsOf<T>> | {},
    O extends Omit<OptsOf<T>, keyof F | keyof U>,
    H extends LoadHint<T>,
  >(type: EntityConstructor<T>, where: F, ifNew: O, upsert?: U, populate?: Const<H>): Promise<Loaded<T, H>>;
  async findOrCreate<
    T extends Entity,
    F extends Partial<OptsOf<T>>,
    U extends Partial<OptsOf<T>> | {},
    O extends Omit<OptsOf<T>, keyof F | keyof U>,
    H extends LoadHint<T>,
  >(type: EntityConstructor<T>, where: F, ifNew: O, upsert?: U, populate?: Const<H>): Promise<T> {
    const entities = await this.find(type, where as FilterOf<T>);
    let entity: T;
    if (entities.length > 1) {
      throw new TooManyError();
    } else if (entities.length === 1) {
      entity = entities[0];
    } else {
      entity = this.create(type, { ...where, ...ifNew } as OptsOf<T>);
    }
    if (upsert) {
      entity.set(upsert);
    }
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
   * @param hint - A populate hint
   *
   * @example
   * // This will duplicate the author
   * const duplicatedAuthor = await em.clone(author)
   *
   * @example
   * // This will duplicate the author and all their related book entities
   * const duplicatedAuthorAndBooks = await em.clone(author, "books")
   *
   * @example
   * // This will duplicate the author, all their books, and the images for those books
   * const duplicatedAuthorAndBooksAndImages = await em.clone(author, {books: "image"})
   */
  public async clone<T extends Entity, H extends LoadHint<T>>(entity: T, hint?: H): Promise<Loaded<T, H>> {
    // Keep a list that we can work against synchronously after doing the async find/crawl
    const todo: Entity[] = [];

    // 1. Find all entities w/o mutating them yet
    await crawl(todo, entity, hint || {});

    // 2. Clone each found entity
    const clones = todo.map((entity) => {
      const { id, ...data } = entity.__orm.data;
      const clone = new (getMetadata(entity).cstr)(this, {} as any);
      clone.__orm.data = data;
      return [entity, clone] as const;
    });
    const entityToClone = new Map(clones);

    // 3. Now mutate the m2o relations. We focus on only m2o's because they "own" the field/column,
    // and will drive percolation to keep the other-side o2m & o2o updated.
    clones.forEach(([entity, clone]) => {
      Object.entries(clone).forEach(([fieldName, value]) => {
        if (value instanceof ManyToOneReferenceImpl) {
          // What's the existing entity? Have we cloned it?
          const existingIdOrEntity = clone.__orm.data[fieldName];
          const existing = this.entities.find((e) => sameEntity(e, getMetadata(e), existingIdOrEntity));
          // If we didn't find a loaded entity for this value, assume that it a) itself is not being cloned,
          // and b) we don't need to bother telling it about the newly cloned entity
          if (existing) {
            // Clear the existing value so that set's percolation treats us as a new entity
            clone.__orm.data[fieldName] = undefined;
            ((clone as any)[fieldName] as any).set(entityToClone.get(existing) ?? existing);
          }
        }
      });
    });

    return clones[0][1] as Loaded<T, H>;
  }

  /** Returns an instance of `type` for the given `id`, resolving to an existing instance if in our Unit of Work. */
  public async load<T>(id: IdOf<T>): Promise<T>;
  public async load(id: string): Promise<Entity>;
  public async load<T extends Entity>(type: EntityConstructor<T>, id: string): Promise<T>;
  public async load<T extends Entity, H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    id: string,
    populate: Const<H>,
  ): Promise<Loaded<T, H>>;
  public async load<T extends Entity, H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    id: string,
    populate: Const<H>,
  ): Promise<Loaded<T, H>>;
  async load<T extends Entity>(typeOrId: EntityConstructor<T> | string, id?: string, hint?: any): Promise<T> {
    // Handle the `typeOrId` overload
    let type: EntityConstructor<T>;
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
    const entity =
      this.findExistingInstance<T>(meta.tableName, tagged) || (await loadDataLoader(this, meta).load(tagged));
    if (!entity) {
      throw new Error(`${tagged} was not found`);
    }
    if (hint) {
      await this.populate(entity, hint);
    }
    return entity;
  }

  /** Returns instances of `type` for the given `ids`, resolving to an existing instance if in our Unit of Work. */
  public async loadAll<T extends Entity>(type: EntityConstructor<T>, ids: string[]): Promise<T[]>;
  public async loadAll<T extends Entity, H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    ids: string[],
    populate: Const<H>,
  ): Promise<Loaded<T, H>[]>;
  async loadAll<T extends Entity>(type: EntityConstructor<T>, _ids: string[], hint?: any): Promise<T[]> {
    const meta = getMetadata(type);
    const ids = _ids.map((id) => tagId(meta, id));
    const entities = await Promise.all(
      ids.map((id) => {
        return this.findExistingInstance(meta.tableName, id) || loadDataLoader(this, meta).load(id);
      }),
    );
    const idsNotFound = ids.filter((id, i) => entities[i] === undefined);
    if (idsNotFound.length > 0) {
      throw new Error(`${idsNotFound.join(",")} were not found`);
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
  public async loadAllIfExists<T extends Entity>(type: EntityConstructor<T>, ids: string[]): Promise<T[]>;
  public async loadAllIfExists<T extends Entity, H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    ids: string[],
    populate: Const<H>,
  ): Promise<Loaded<T, H>[]>;
  async loadAllIfExists<T extends Entity>(type: EntityConstructor<T>, _ids: string[], hint?: any): Promise<T[]> {
    const meta = getMetadata(type);
    const ids = _ids.map((id) => tagId(meta, id));
    const entities = (
      await Promise.all(
        ids.map((id) => {
          return this.findExistingInstance(meta.tableName, id) || loadDataLoader(this, meta).load(id);
        }),
      )
    ).filter(Boolean);
    if (hint) {
      await this.populate(entities as T[], hint);
    }
    return entities as T[];
  }

  /** Loads entities from a knex QueryBuilder. */
  public async loadFromQuery<T extends Entity>(type: EntityConstructor<T>, query: Knex.QueryBuilder): Promise<T[]>;
  public async loadFromQuery<T extends Entity, H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    query: Knex.QueryBuilder,
    populate: H,
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
  async populate<T extends Entity, H extends LoadHint<T>, V>(
    entityOrList: T | T[],
    hintOrOpts: { hint: H; forceReload?: boolean } | H,
    fn?: (entity: Loaded<T, H>) => V,
  ): Promise<Loaded<T, H> | Array<Loaded<T, H>> | V> {
    const list = toArray(entityOrList);
    const { hint, ...opts } =
      // @ts-ignore for some reason TS thinks `"hint" in hintOrOpts` is operating on a primitive
      typeof hintOrOpts === "object" && "hint" in hintOrOpts ? hintOrOpts : { hint: hintOrOpts };
    const promises = list
      .filter((e) => e !== undefined && (e.isPendingDelete || !e.isDeletedEntity))
      .flatMap((entity) => {
        // This implementation is pretty simple b/c we just loop over the hint (which is a key / array of keys /
        // hash of keys) and call `.load()` on the corresponding o2m/m2o/m2m reference/collection object. This
        // will kick in the dataloader auto-batching and end up being smartly populated (granted via 1 query per
        // entity type per "level" of resolution, instead of 1 single giant SQL query that inner joins everything
        // in).
        if (typeof hint === "string") {
          return (entity as any)[hint].load(opts);
        } else if (Array.isArray(hint)) {
          return (hint as string[]).map((key) => (entity as any)[key].load(opts));
        } else if (typeof hint === "object") {
          return Object.entries(hint as object).map(async ([key, nestedHint]) => {
            const relation = (entity as any)[key];
            const result = await relation.load(opts);
            return this.populate(result, { hint: nestedHint, ...opts });
          });
        } else {
          throw new Error(`Unexpected hint ${hint}`);
        }
      });
    await Promise.all(promises);
    return !fn ? (entityOrList as any) : fn(entityOrList as any);
  }

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
    if (entity.id && this.findExistingInstance(meta.tableName, entity.id) !== undefined) {
      throw new Error(`Entity ${entity} has a duplicate instance already loaded`);
    }
    // Set a default createdAt/updatedAt that we'll keep if this is a new entity, or over-write if we're loaded an existing row
    const { createdAt, updatedAt } = getMetadata(entity).timestampFields;
    if (createdAt) {
      entity.__orm.data[createdAt] = new Date();
    }
    if (updatedAt) {
      entity.__orm.data[updatedAt] = new Date();
    }

    this._entities.push(entity);
    if (entity.id) {
      assertIdsAreTagged([entity.id]);

      this._entityIndex.set(`${entity.__orm.metadata.tableName}:${entity.id}`, entity);
    }

    if (this._entities.length >= entityLimit) {
      throw new Error(`More than ${entityLimit} entities have been instantiated`);
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
  delete(deletedEntity: Entity): void {
    // Early return if already deleted.
    if (deletedEntity.__orm.deleted) {
      return;
    }
    deletedEntity.__orm.deleted = "pending";

    getRelations(deletedEntity).forEach((relation) => relation.maybeCascadeDelete());
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

    const entitiesToFlush: Entity[] = [];
    let pendingEntities = this.entities.filter((e) => e.isPendingFlush);

    try {
      while (pendingEntities.length > 0) {
        await currentFlushSecret.run({ flushSecret: this.flushSecret }, async () => {
          const todos = createTodos(pendingEntities);

          // Add objects to todos that have reactive hooks.
          // Note that, if we're on the 2nd loop, we might actually re-add entities that were already-validated
          // and already-flushed on the 1st loop, if those entities happen to be marked as derived from the
          // current loop's entities. In theory this is a good thing, b/c the current loop's entities have
          // been changed since/during the 1st loop, so we want the derived validation rules + derived values
          // to run again to see the latest & greatest data.
          await addReactiveAsyncDerivedValues(todos);
          await addReactiveValidations(todos);

          // run our hooks
          await beforeDelete(this.ctx, todos);
          // We defer doing this cascade logic until flush() so that delete() can remain synchronous.
          await cleanupDeletedRelations(todos);
          await beforeFlush(this.ctx, todos);
          await beforeCreate(this.ctx, todos);
          await beforeUpdate(this.ctx, todos);
          recalcDerivedFields(todos);
          await recalcAsyncDerivedFields(this, todos);

          if (!skipValidation) {
            await validate(todos);
            await afterValidation(this.ctx, todos);
          }

          entitiesToFlush.push(...pendingEntities);
          pendingEntities = this.entities.filter((e) => e.isPendingFlush && !entitiesToFlush.includes(e));
          this.flushSecret += 1;
        });
      }

      const entityTodos = createTodos(entitiesToFlush);
      const joinRowTodos = combineJoinRows(this.__data.joinRows);

      if (Object.keys(entityTodos).length > 0 || Object.keys(joinRowTodos).length > 0) {
        // The driver will handle  the right thing if we're already in an existing transaction.
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
            this._entityIndex.set(`${e.__orm.metadata.tableName}:${e.id!}`, e);
            e.__orm.isNew = false;
          });
          [todo.inserts, todo.updates, todo.deletes].flat().forEach((e) => {
            e.__orm.originalData = {};
            e.__orm.isTouched = false;
          });
        });

        // Reset the find caches b/c data will have changed in the db
        this.loadLoaders = {};
        this.findLoaders = {};
      }

      return entitiesToFlush;
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
    this.loadLoaders = {};
    this.findLoaders = {};
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
        copy.filter((e) => e.id).map((entity) => loadDataLoader(this, getMetadata(entity)).load(entity.id)),
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
            // We skip recursing into CustomCollections and CustomReferences for two reasons:
            // 1. It can be tricky to ensure `{ forceReload: true }` is passed all the way through their custom load
            // implementations, and so it's easy to have `.get` accidentally come across a not-yet-loaded collection, and
            // 2. Any custom load functions should use the underlying o2m/m2o/etc relations anyway, so if we crawl/refresh
            // those, then when the user calls `.get` on custom collections/references, they should be talking to always-loaded
            // relations, w/o us having to tackle the tricky bookkeeping problem passing `forceReload` all through their
            // custom load function + any other collections they call.
            .filter((r) => !(r instanceof CustomCollection || r instanceof CustomReference))
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
  public findExistingInstance<T>(tableName: string, id: string): T | undefined {
    assertIdsAreTagged([id]);
    return this._entityIndex.get(`${tableName}:${id}`) as T | undefined;
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
  public hydrate<T extends Entity>(type: EntityConstructor<T>, row: any, options?: { overwriteExisting?: boolean }): T {
    const meta = getMetadata(type);
    const id = keyToString(meta, row["id"]) || fail("No id column was available");
    // See if this is already in our UoW
    let entity = this.findExistingInstance(meta.tableName, id) as T;
    if (!entity) {
      // Pass id as a hint that we're in hydrate mode
      entity = new type(this, id);
      Object.values(meta.fields).forEach((f) => f.serde?.setOnEntity(entity!.__orm.data, row));
    } else if (options?.overwriteExisting !== false) {
      // Usually if the entity already exists, we don't write over it, but in this case
      // we assume that `EntityManager.refresh` is telling us to explicitly load the
      // latest data.
      Object.values(meta.fields).forEach((f) => f.serde?.setOnEntity(entity!.__orm.data, row));
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

  public toString(): string {
    return "EntityManager";
  }
}

export let entityLimit = 10_000;

export function setEntityLimit(limit: number) {
  entityLimit = limit;
}

export function setDefaultEntityLimit() {
  entityLimit = 10_000;
}

export interface EntityMetadata<T extends Entity> {
  cstr: EntityConstructor<T>;
  type: string;
  idType: "int" | "uuid";
  tableName: string;
  tagName: string | undefined;
  fields: Record<string, Field>;
  config: ConfigApi<T, any>;
  timestampFields: TimestampFields;
  factory: (em: EntityManager<any>, opts?: any) => DeepNew<T>;
}

export type Field =
  | PrimaryKeyField
  | PrimitiveField
  | EnumField
  | OneToManyField
  | LargeOneToManyField
  | ManyToOneField
  | ManyToManyField
  | OneToOneField
  | PolymorphicField;

// Only the fields that have defined `serde` keys; should be a mapped type of Field
export type SerdeField = PrimaryKeyField | PrimitiveField | EnumField | ManyToOneField | PolymorphicField;

export type PrimaryKeyField = {
  kind: "primaryKey";
  fieldName: string;
  fieldIdName: undefined;
  required: true;
  serde: FieldSerde;
};

export type PrimitiveField = {
  kind: "primitive";
  fieldName: string;
  fieldIdName: undefined;
  required: boolean;
  derived: "orm" | "sync" | "async" | false;
  protected: boolean;
  type: string | Function;
  serde: FieldSerde;
};

export type EnumField = {
  kind: "enum";
  fieldName: string;
  fieldIdName: undefined;
  required: boolean;
  enumDetailType: { getValues(): ReadonlyArray<unknown> };
  serde: FieldSerde;
};

export type OneToManyField = {
  kind: "o2m";
  fieldName: string;
  fieldIdName: string;
  required: boolean;
  otherMetadata: () => EntityMetadata<any>;
  otherFieldName: string;
  serde: undefined;
};

export type LargeOneToManyField = {
  kind: "lo2m";
  fieldName: string;
  fieldIdName: string;
  required: boolean;
  otherMetadata: () => EntityMetadata<any>;
  otherFieldName: string;
  serde: undefined;
};

export type ManyToOneField = {
  kind: "m2o";
  fieldName: string;
  fieldIdName: string;
  required: boolean;
  otherMetadata: () => EntityMetadata<any>;
  otherFieldName: string;
  serde: FieldSerde;
};

export type ManyToManyField = {
  kind: "m2m";
  fieldName: string;
  fieldIdName: string;
  required: boolean;
  otherMetadata: () => EntityMetadata<any>;
  otherFieldName: string;
  serde: undefined;
};

export type OneToOneField = {
  kind: "o2o";
  fieldName: string;
  fieldIdName: string;
  required: boolean;
  otherMetadata: () => EntityMetadata<any>;
  otherFieldName: string;
  serde: undefined;
};

export type PolymorphicField = {
  kind: "poly";
  fieldName: string; // eg `parent`
  fieldIdName: string; // `parentId`
  required: boolean;
  components: PolymorphicFieldComponent[];
  serde: PolymorphicKeySerde;
};

export type PolymorphicFieldComponent = {
  otherMetadata: () => EntityMetadata<any>;
  otherFieldName: string; // eg `comment` or `comments`
  columnName: string; // eg `parent_book_id` or `parent_book_review_id`
};

export function isEntity(maybeEntity: any): maybeEntity is Entity {
  return maybeEntity && typeof maybeEntity === "object" && "id" in maybeEntity && "__orm" in maybeEntity;
}

export function isKey(k: any): k is string {
  return typeof k === "string";
}

/** Compares `a` to `b`, where `b` might be an id. B/c ids can overlap, we need to know `b`'s metadata type. */
export function sameEntity(a: Entity | undefined, meta: EntityMetadata<any>, b: Entity | string | undefined): boolean {
  if (a === undefined || b === undefined) {
    return a === undefined && b === undefined;
  }
  return (
    a === b ||
    (!a.isNewEntity && getMetadata(a) === meta && maybeResolveReferenceToId(a) === maybeResolveReferenceToId(b))
  );
}

export function getMetadata<T extends Entity>(entity: T): EntityMetadata<T>;
export function getMetadata<T extends Entity>(type: EntityConstructor<T>): EntityMetadata<T>;
export function getMetadata<T extends Entity>(meta: EntityMetadata<T>): EntityMetadata<T>;
export function getMetadata<T extends Entity>(param: T | EntityConstructor<T> | EntityMetadata<T>): EntityMetadata<T> {
  return (
    typeof param === "function" ? (param as any).metadata : "cstr" in param ? param : param.__orm.metadata
  ) as EntityMetadata<T>;
}

/** Thrown by `findOneOrFail` if an entity is not found. */
export class NotFoundError extends Error {}

/** Thrown by `findOne` and `findOneOrFail` if more than one entity is found. */
export class TooManyError extends Error {}

/**
 * For the entities currently in `todos`, find any reactive validation rules that point
 * from the currently-changed entities back to each rule's originally-defined-in entity,
 * and ensure those entities are added to `todos`.
 *
 * Note that we don't check whether `entitiesToFlush` already the entities we're adding,
 * because rules should be side effect free, so invoking them twice, if that does happen
 * to occur, should be fine (and desirable given something about the entity has changed).
 */
async function addReactiveValidations(todos: Record<string, Todo>): Promise<void> {
  const p: Promise<void>[] = Object.values(todos).flatMap((todo) => {
    const entities = [...todo.inserts, ...todo.updates, ...todo.deletes];
    // Find each statically-declared reactive rule for the given entity type
    return todo.metadata.config.__data.reactiveRules.map(async (reverseHint) => {
      // Add the resulting "found" entities to the right todos to be validated
      (await followReverseHint(entities, reverseHint)).forEach((entity) => {
        const todo = getTodo(todos, entity);
        if (
          !todo.inserts.includes(entity) &&
          !todo.updates.includes(entity) &&
          !todo.validates.includes(entity) &&
          !entity.isDeletedEntity
        ) {
          todo.validates.push(entity);
        }
      });
    });
  });
  await Promise.all(p);
}

/**
 * Given the current changed entities in `todos`, use the static metadata of `reactiveDerivedValues`
 * to find any potentially-unloaded entities we should now re-calc, and add them to `todos`.
 */
async function addReactiveAsyncDerivedValues(todos: Record<string, Todo>): Promise<void> {
  const p: Promise<void>[] = Object.values(todos).flatMap((todo) => {
    const entities = [...todo.inserts, ...todo.updates];
    return todo.metadata.config.__data.reactiveDerivedValues.map(async (reverseHint) => {
      (await followReverseHint(entities, reverseHint)).forEach((entity) => {
        const todo = getTodo(todos, entity);
        if (!todo.inserts.includes(entity) && !todo.updates.includes(entity) && !entity.isDeletedEntity) {
          todo.updates.push(entity);
        }
      });
    });
  });
  await Promise.all(p);
}

/** Find all deleted entities and ensure their references all know about their deleted-ness. */
async function cleanupDeletedRelations(todos: Record<string, Todo>): Promise<void> {
  const entities = Object.values(todos).flatMap((todo) => todo.deletes);
  await Promise.all(entities.flatMap(getRelations).map((relation) => relation.cleanupOnEntityDeleted()));
}

async function validate(todos: Record<string, Todo>): Promise<void> {
  const p = Object.values(todos).flatMap((todo) => {
    const rules = todo.metadata.config.__data.rules;
    return [...todo.inserts, ...todo.updates, ...todo.validates]
      .filter((e) => !e.isDeletedEntity)
      .flatMap((entity) => {
        return rules.flatMap(async (rule) => coerceError(entity, await rule(entity)));
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
  keys: ("inserts" | "deletes" | "updates" | "validates")[],
): Promise<void> {
  const p = Object.values(todos).flatMap((todo) => {
    const hookFns = todo.metadata.config.__data.hooks[hook];
    return keys
      .flatMap((k) => todo[k].filter((e) => k === "deletes" || !e.isDeletedEntity))
      .flatMap((entity) => {
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
  return runHook(ctx, "afterCommit", todos, ["inserts", "updates"]);
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
type Narrowable = string | number | boolean | symbol | object | undefined | void | null | {} | [];
type Const<N> =
  | N
  | {
      [K in keyof N]: N[K] extends Narrowable ? N[K] | Const<N[K]> : never;
    };

/**
 * Evaluates each derived field to see if it's value has changed.
 *
 * This is a) not at all reactive, b) only works for primitives, c) doesn't work
 * with async/promise-based logic, and d) doesn't support passing an app-specific
 * context, but it's a start.
 */
function recalcDerivedFields(todos: Record<string, Todo>) {
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
    const derivedFields = derivedFieldsByMeta.get(entity.__orm.metadata);
    derivedFields?.forEach((fieldName) => {
      // setField will intelligently mark/not mark the field as dirty.
      setField(entity, fieldName as any, (entity as any)[fieldName]);
    });
  }
}

/**
 * Calcs async derived fields for inserts and updates.
 *
 * We assume that `addReactiveAsyncDerivedValues` has already found any "reactive"
 * entities that need fields re-calced, and has already added them to `todos`.
 */
async function recalcAsyncDerivedFields(em: EntityManager, todos: Record<string, Todo>): Promise<void> {
  const p = Object.values(todos).map(async (todo) => {
    const { asyncDerivedFields } = todo.metadata.config.__data;
    const changed = [...todo.inserts, ...todo.updates];
    const p = Object.entries(asyncDerivedFields).map(async ([key, entry]) => {
      if (entry) {
        const [hint, fn] = entry;
        await em.populate(changed, hint);
        await Promise.all(changed.map((entity) => setField(entity, key as any, fn(entity))));
      }
    });
    await Promise.all(p);
  });
  await Promise.all(p);
}

/**
 * Walks `reverseHint` for every entity in `entities`.
 *
 * I.e. given `[book1, book2]` and `["author", 'publisher"]`, will return all of the books' authors' publishers.
 */
async function followReverseHint(entities: Entity[], reverseHint: string[]): Promise<Entity[]> {
  // Start at the current entities
  let current = [...entities];
  const paths = [...reverseHint];
  // And "walk backwards" through the reverse hint
  while (paths.length) {
    const fieldName = paths.shift()!;
    // The path might touch either a reference or a collection
    const entitiesOrLists = await Promise.all(
      current.flatMap((c) => {
        const currentValuePromise = (c as any)[fieldName].load();
        // If we're going from Book.author back to Author to re-validate the Author.books collection,
        // see if Book.author has changed so we can re-validate both the old author's books and the
        // new author's books.
        const isReference = getMetadata(c).fields[fieldName]?.kind === "m2o";
        const hasChanged = isReference && (c as any).changes[fieldName].hasChanged;
        const originalValue = (c as any).changes[fieldName].originalValue;
        if (hasChanged && originalValue) {
          const originalEntityMaybePromise = isEntity(originalValue)
            ? originalValue
            : c.em.load((c as any)[fieldName].otherMeta.cstr, originalValue);
          return [currentValuePromise, originalEntityMaybePromise];
        }
        return [currentValuePromise];
      }),
    );
    // Use flat() to get them all as entities
    const entities = entitiesOrLists.flat().filter((e) => e !== undefined);
    current = entities as Entity[];
  }
  return current;
}

/** Recursively crawls through `entity`, with the given populate `hint`, and adds anything found to `found`. */
async function crawl<T extends Entity>(found: Entity[], entity: T, hint: LoadHint<T>): Promise<void> {
  found.push(entity);
  await Promise.all(
    (Object.entries(adaptHint(hint)) as [keyof RelationsIn<T>, LoadHint<any>][]).map(async ([relationName, nested]) => {
      const relation = entity[relationName];
      if (relation instanceof OneToManyCollection) {
        const relatedEntities = await relation.load();
        await Promise.all(relatedEntities.map((entity) => crawl(found, entity, nested)));
      } else if (relation instanceof OneToOneReferenceImpl) {
        const related = await relation.load();
        if (related) {
          await crawl(found, related, nested);
        }
      } else if (relation instanceof ManyToOneReferenceImpl) {
        const related = await relation.load();
        if (related) {
          await crawl(found, related, nested);
        }
      } else {
        fail(`Uncloneable relation: ${relationName}`);
      }
    }),
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
