import DataLoader from "dataloader";
import Knex, { QueryBuilder } from "knex";
import hash from "object-hash";
import { AbstractRelationImpl } from "./collections/AbstractRelationImpl";
import { JoinRow } from "./collections/ManyToManyCollection";
import { Contexty } from "./contexty";
import { createOrUpdatePartial } from "./createOrUpdatePartial";
import { flushEntities, flushJoinTables, getTodo, sortEntities, sortJoinRows, Todo } from "./EntityPersister";
import {
  assertIdsAreTagged,
  Collection,
  ColumnSerde,
  ConfigApi,
  DeepPartialOrNull,
  deTagIds,
  EntityHook,
  getEm,
  keyToString,
  LoadedCollection,
  LoadedReference,
  maybeResolveReferenceToId,
  PartialOrNull,
  Reference,
  Relation,
  setField,
  setOpts,
  tagIfNeeded,
  ValidationError,
  ValidationErrors,
} from "./index";
import { buildQuery, FilterAndSettings } from "./QueryBuilder";
import { fail, getOrSet, indexBy, NullOrDefinedOr } from "./utils";

export interface EntityConstructor<T> {
  new (em: EntityManager, opts: any): T;
}

/** Return the `FooOpts` type a given `Foo` entity constructor. */
export type OptsOf<T> = T extends { __types: { optsType: infer O } } ? O : never;

export type OptIdsOf<T> = T extends { __types: { optIdsType: infer O } } ? O : never;

/** Return the `Foo` type for a given `Foo` entity constructor. */
export type EntityOf<C> = C extends new (em: EntityManager, opts: any) => infer T ? T : never;

/** Pulls the entity query type out of a given entity type T. */
export type FilterOf<T> = T extends { __types: { filterType: infer Q } } ? Q : never;

/** Pulls the entity GraphQL query type out of a given entity type T. */
export type GraphQLFilterOf<T> = T extends { __types: { gqlFilterType: infer Q } } ? Q : never;

/** Pulls the entity order type out of a given entity type T. */
export type OrderOf<T> = T extends { __types: { orderType: infer Q } } ? Q : never;

/**
 * Returns the opts of the entity's `newEntity` factory method, as exists in the actual file.
 *
 * This is because `FactoryOpts` is a set of defaults, but the user can customize it if they want.
 */
export type ActualFactoryOpts<T> = T extends { __types: { factoryOptsType: infer Q } } ? Q : never;

/** Pulls the entity's id type out of a given entity type T. */
export type IdOf<T> = T extends { id: infer I | undefined } ? I : never;

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
}

export let currentlyInstantiatingEntity: Entity | undefined;

/** A marker/base interface for all of our entity types. */
export interface Entity {
  id: string | undefined;

  idOrFail: string;

  __orm: EntityOrmField;

  readonly isNewEntity: boolean;

  readonly isDeletedEntity: boolean;

  readonly isDirtyEntity: boolean;

  readonly isPendingFlush: boolean;

  readonly isPendingDelete: boolean;

  set(opts: Partial<OptsOf<this>>): void;

  setPartial(values: PartialOrNull<OptsOf<this>>): void;
}

/** Marks a given `T[P]` as the loaded/synchronous version of the collection. */
type MarkLoaded<T extends Entity, P, H = {}> = P extends Reference<T, infer U, infer N>
  ? LoadedReference<T, Loaded<U, H>, N>
  : P extends Collection<T, infer U>
  ? LoadedCollection<T, Loaded<U, H>>
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
    ? T[K] extends Reference<T, infer U, infer N>
      ? LoadedReference<T, OK, N>
      : never
    : OK extends Array<infer OU>
    ? OU extends Entity
      ? T[K] extends Collection<T, infer U>
        ? LoadedCollection<T, OU>
        : never
      : never
    : T[K]
  : never;

/**
 * Marks all references/collections of `T` as loaded, i.e. for newly instantiated entities where
 * we know there are no already-existing rows with fk's to this new entity in the database.
 *
 * `O` is the generic from the call site so that if the caller passes `{ author: SomeLoadedAuthor }`,
 * we'll prefer that type, as it might have more nested load hints that we can't otherwise assume.
 */
export type New<T extends Entity, O extends OptsOf<T> = OptsOf<T>> = T &
  {
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

/** Given an entity `T` that is being populated with hints `H`, marks the `H` attributes as populated. */
export type Loaded<T extends Entity, H extends LoadHint<T>> = T &
  {
    [K in keyof T]: H extends NestedLoadHint<T>
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

/** From any non-`Relations` field in `T`, i.e. for loader hints. */
export type RelationsIn<T extends Entity> = SubType<T, Relation<any, any>>;

// https://medium.com/dailyjs/typescript-create-a-condition-based-subset-types-9d902cea5b8c
type SubType<T, C> = Pick<T, { [K in keyof T]: T[K] extends C ? K : never }[keyof T]>;

// We accept load hints as a string, or a string[], or a hash of { key: nested };
export type LoadHint<T extends Entity> = keyof RelationsIn<T> | ReadonlyArray<keyof RelationsIn<T>> | NestedLoadHint<T>;

type NestedLoadHint<T extends Entity> = {
  [K in keyof RelationsIn<T>]?: T[K] extends Relation<T, infer U> ? LoadHint<U> : never;
};

export type LoaderCache = Record<string, DataLoader<any, any>>;

export class EntityManager {
  constructor(public knex: Knex) {}

  private _entities: Entity[] = [];
  // Indexes the currently loaded entities by their tagged ids. This fixes a real-world
  // performance issue where `findExistingInstance` scanning `_entities` was an `O(n^2)`.
  private _entityIndex: Map<string, Entity> = new Map();
  private findLoaders: LoaderCache = {};
  private flushSecret: number = 0;
  private _isFlushing: boolean = false;
  private contexty?: Contexty;
  // This is attempting to be internal/module private
  __data = {
    loaders: {} as LoaderCache,
    joinRows: {} as Record<string, JoinRow[]>,
  };

  get context() {
    return this.contexty?.context || {};
  }

  get entities(): ReadonlyArray<Entity> {
    return [...this._entities];
  }

  public async find<T extends Entity>(type: EntityConstructor<T>, where: FilterOf<T>): Promise<T[]>;
  public async find<
    T extends Entity,
    H extends LoadHint<T> & ({ [k: string]: N | H | [] } | N | N[]),
    N extends Narrowable
  >(
    type: EntityConstructor<T>,
    where: FilterOf<T>,
    options?: { populate?: H; orderBy?: OrderOf<T>; limit?: number; offset?: number },
  ): Promise<Loaded<T, H>[]>;
  async find<T extends Entity>(
    type: EntityConstructor<T>,
    where: FilterOf<T>,
    options?: { populate?: any; orderBy?: OrderOf<T>; limit?: number; offset?: number },
  ): Promise<T[]> {
    const rows = await this.loaderForFind(type).load({ where, ...options });
    const result = rows.map((row: any) => this.hydrate(type, row, { overwriteExisting: false }));
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
  public async findGql<
    T extends Entity,
    H extends LoadHint<T> & ({ [k: string]: N | H | [] } | N | N[]),
    N extends Narrowable
  >(
    type: EntityConstructor<T>,
    where: GraphQLFilterOf<T>,
    options?: { populate?: H; orderBy?: OrderOf<T> },
  ): Promise<Loaded<T, H>[]>;
  async findGql<T extends Entity>(
    type: EntityConstructor<T>,
    where: FilterOf<T>,
    options?: { populate?: any; orderBy?: OrderOf<T>; limit?: number; offset?: number },
  ): Promise<T[]> {
    const rows = await this.loaderForFind(type).load({ where, ...options });
    const result = rows.map((row: any) => this.hydrate(type, row, { overwriteExisting: false }));
    if (options?.populate) {
      await this.populate(result, options.populate);
    }
    return result;
  }

  public async findOne<T extends Entity>(type: EntityConstructor<T>, where: FilterOf<T>): Promise<T | undefined>;
  public async findOne<
    T extends Entity,
    H extends LoadHint<T> & ({ [k: string]: N | H | [] } | N | N[]),
    N extends Narrowable
  >(type: EntityConstructor<T>, where: FilterOf<T>, options?: { populate: H }): Promise<Loaded<T, H> | undefined>;
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
  public async findOneOrFail<
    T extends Entity,
    H extends LoadHint<T> & ({ [k: string]: N | H | [] } | N | N[]),
    N extends Narrowable
  >(type: EntityConstructor<T>, where: FilterOf<T>, options: { populate: H }): Promise<Loaded<T, H>>;
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
    O extends Omit<OptsOf<T>, keyof F | keyof U>
  >(type: EntityConstructor<T>, where: F, ifNew: O, upsert?: U): Promise<T>;
  async findOrCreate<
    T extends Entity,
    F extends Partial<OptsOf<T>>,
    U extends Partial<OptsOf<T>> | {},
    O extends Omit<OptsOf<T>, keyof F | keyof U>,
    H extends LoadHint<T> & ({ [k: string]: N | H | [] } | N | N[]),
    N extends Narrowable
  >(type: EntityConstructor<T>, where: F, ifNew: O, upsert?: U, populate?: H): Promise<Loaded<T, H>>;
  async findOrCreate<
    T extends Entity,
    F extends Partial<OptsOf<T>>,
    U extends Partial<OptsOf<T>> | {},
    O extends Omit<OptsOf<T>, keyof F | keyof U>,
    H extends LoadHint<T> & ({ [k: string]: N | H | [] } | N | N[]),
    N extends Narrowable
  >(type: EntityConstructor<T>, where: F, ifNew: O, upsert?: U, populate?: H): Promise<T> {
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

  /** Returns an instance of `type` for the given `id`, resolving to an existing instance if in our Unit of Work. */
  public async load<T extends Entity>(type: EntityConstructor<T>, id: string): Promise<T>;
  public async load<T extends Entity, H extends LoadHint<T> & { [k: string]: N | T | [] }, N extends Narrowable>(
    type: EntityConstructor<T>,
    id: string,
    populate: H,
  ): Promise<Loaded<T, H>>;
  public async load<T extends Entity, H extends LoadHint<T> & (N | N[]), N extends Narrowable>(
    type: EntityConstructor<T>,
    id: string,
    populate: H,
  ): Promise<Loaded<T, H>>;
  async load<T extends Entity>(type: EntityConstructor<T>, id: string, hint?: any): Promise<T> {
    if (typeof (id as any) !== "string") {
      throw new Error(`Expected ${id} to be a string`);
    }
    const meta = getMetadata(type);
    const tagged = tagIfNeeded(meta, id);
    const entity = this.findExistingInstance<T>(tagged) || (await this.loaderForEntity(meta).load(tagged));
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
  public async loadAll<
    T extends Entity,
    H extends LoadHint<T> & ({ [k: string]: N | H | [] } | N | N[]),
    N extends Narrowable
  >(type: EntityConstructor<T>, ids: string[], populate: H): Promise<Loaded<T, H>[]>;
  async loadAll<T extends Entity>(type: EntityConstructor<T>, _ids: string[], hint?: any): Promise<T[]> {
    const meta = getMetadata(type);
    const ids = _ids.map((id) => tagIfNeeded(meta, id));
    const entities = await Promise.all(
      ids.map((id) => {
        return this.findExistingInstance(id) || this.loaderForEntity(meta).load(id);
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

  /** Loads entities from a knex QueryBuilder. */
  public async loadFromQuery<T extends Entity>(type: EntityConstructor<T>, query: QueryBuilder): Promise<T[]>;
  public async loadFromQuery<T extends Entity, H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    query: QueryBuilder,
    populate: H,
  ): Promise<Loaded<T, H>[]>;
  public async loadFromQuery<T extends Entity>(
    type: EntityConstructor<T>,
    query: QueryBuilder,
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
  public async populate<
    T extends Entity,
    H extends LoadHint<T> & ({ [k: string]: N | H | [] } | N | N[]),
    N extends Narrowable
  >(entity: T, hint: H): Promise<Loaded<T, H>>;
  public async populate<
    T extends Entity,
    H extends LoadHint<T> & ({ [k: string]: N | H | [] } | N | N[]),
    N extends Narrowable
  >(entities: ReadonlyArray<T>, hint: H): Promise<Loaded<T, H>[]>;
  async populate<T extends Entity, H extends LoadHint<T>>(
    entityOrList: T | T[],
    hint: H,
  ): Promise<Loaded<T, H> | Array<Loaded<T, H>>> {
    const list: T[] = Array.isArray(entityOrList) ? entityOrList : [entityOrList];
    const promises = list
      .filter((e) => e !== undefined && (e.isPendingDelete || !e.isDeletedEntity))
      .flatMap((entity) => {
        // This implementation is pretty simple b/c we just loop over the hint (which is a key / array of keys /
        // hash of keys) and call `.load()` on the corresponding o2m/m2o/m2m reference/collection object. This
        // will kick in the dataloader auto-batching and end up being smartly populated (granted via 1 query per
        // entity type per "level" of resolution, instead of 1 single giant SQL query that inner joins everything
        // in).
        if (typeof hint === "string") {
          return (entity as any)[hint].load();
        } else if (Array.isArray(hint)) {
          return (hint as string[]).map((key) => (entity as any)[key].load());
        } else if (typeof hint === "object") {
          return Object.entries(hint as object).map(async ([key, nestedHint]) => {
            const relation = (entity as any)[key];
            const result = await relation.load();
            return this.populate(result, nestedHint);
          });
        } else {
          throw new Error(`Unexpected hint ${hint}`);
        }
      });
    await Promise.all(promises);
    return entityOrList as any;
  }

  /**
   * Executes `fn` with a transaction, and automatically calls `flush`/`commit` at the end.
   *
   * This ensures both any `.find` as well as `.flush` operations happen within the same
   * transaction, which is useful for enforcing cross-table/application-level invariants that
   * cannot be enforced with database-level constraints.
   */
  public async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const originalKnex = this.knex;
    const txn = await this.knex.transaction();
    this.knex = txn;
    try {
      await txn.raw("set transaction isolation level serializable;");
      const result = await fn();
      // The lambda may have done some interstitial flushes (that would not
      // have committed the transaction), but go ahead and do a final one
      // in case they didn't explicitly call flush.
      await this.flush();
      await txn.commit();
      return result;
    } finally {
      if (!txn.isCompleted()) {
        txn.rollback().catch((e) => {
          console.error(e, "Error rolling back");
        });
      }
      this.knex = originalKnex;
    }
  }

  /** Registers a newly-instantiated entity with our EntityManager; only called by entity constructors. */
  register(meta: EntityMetadata<any>, entity: Entity): void {
    if (entity.id && this.findExistingInstance(entity.id) !== undefined) {
      throw new Error(`Entity ${entity} has a duplicate instance already loaded`);
    }
    // Set a default createdAt/updatedAt that we'll keep if this is a new entity, or over-write if we're loaded an existing row
    entity.__orm.data["createdAt"] = new Date();
    entity.__orm.data["updatedAt"] = new Date();

    this._entities.push(entity);
    if (entity.id) {
      assertIdsAreTagged([entity.id]);
      this._entityIndex.set(entity.id, entity);
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

    Object.values(deletedEntity)
      .filter((v) => v instanceof AbstractRelationImpl)
      .map((relation: AbstractRelationImpl<any>) => {
        relation.onEntityDelete();
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
   */
  async flush(): Promise<void> {
    if (this.isFlushing) {
      throw new Error("Cannot flush while another flush is already in progress");
    }

    this._isFlushing = true;

    this.contexty = new Contexty();
    this.contexty.create();

    const entitiesToFlush: Entity[] = [];
    let pendingEntities = this.entities.filter((e) => e.isPendingFlush);

    // We need to split the thread so that Node's executionAsyncId changes and in turn
    // Contexty give us a context that's distinct from whatever called flush
    await new Promise((res) => setTimeout(res, 0));
    const context = this.contexty.create();

    while (pendingEntities.length > 0) {
      context.flushSecret = this.flushSecret;
      const todos = sortEntities(pendingEntities);

      // add objects to todos that have reactive hooks
      await addReactiveAsyncDerivedValues(todos);
      await addReactiveValidations(todos);

      // run our hooks
      await beforeDelete(todos);
      // We defer doing this cascade logic until flush() so that delete() can remain synchronous.
      await cascadeDeletesIntoRelations(todos);
      await beforeFlush(todos);
      recalcDerivedFields(todos);
      await recalcAsyncDerivedFields(this, todos);
      await validate(todos);
      await afterValidation(todos);

      entitiesToFlush.push(...pendingEntities);
      pendingEntities = this.entities.filter((e) => e.isPendingFlush && !entitiesToFlush.includes(e));
      this.flushSecret += 1;
    }

    const entityTodos = sortEntities(entitiesToFlush);
    const joinRowTodos = sortJoinRows(this.__data.joinRows);

    if (Object.keys(entityTodos).length > 0 || Object.keys(joinRowTodos).length > 0) {
      const alreadyInTxn = "commit" in this.knex;

      if (!alreadyInTxn) {
        await this.knex.transaction(async (knex) => {
          await flushEntities(knex, entityTodos);
          await flushJoinTables(knex, joinRowTodos);
          // When using `.transaction` with a lambda, we don't explicitly call commit
          // await knex.commit();
        });
      } else {
        await flushEntities(this.knex, entityTodos);
        await flushJoinTables(this.knex, joinRowTodos);
        // Defer to the caller to commit the transaction
      }

      // TODO: This is really "after flush" if we're being called from a transaction that
      // is going to make multiple `em.flush()` calls?
      await afterCommit(entityTodos);

      Object.values(entityTodos).forEach((todo) => {
        todo.inserts.forEach((e) => this._entityIndex.set(e.id!, e));
      });

      // Reset the find caches b/c data will have changed in the db
      this.findLoaders = {};
      this.__data.loaders = {};
    }

    this.contexty.cleanup();
    this.contexty = undefined;
    this._isFlushing = false;
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
   * TODO Newly-found collection entries will not have prior load hints applied to this.
   */
  async refresh(): Promise<void>;
  async refresh(entity: Entity): Promise<void>;
  async refresh(entities: ReadonlyArray<Entity>): Promise<void>;
  async refresh(entityOrListOrUndefined?: Entity | ReadonlyArray<Entity>): Promise<void> {
    this.findLoaders = {};
    const list =
      entityOrListOrUndefined === undefined
        ? this._entities
        : Array.isArray(entityOrListOrUndefined)
        ? entityOrListOrUndefined
        : [entityOrListOrUndefined];
    await Promise.all(
      list.map(async (entity) => {
        if (entity.id) {
          // Clear the original cached loader result and fetch the new primitives
          const loader = this.loaderForEntity(getMetadata(entity));
          loader.clear(entity.id);
          await loader.load(entity.id);
          if (entity.__orm.deleted === undefined) {
            // Then refresh any loaded collections
            await Promise.all(
              Object.values(entity).map((c) => {
                if (c instanceof AbstractRelationImpl) {
                  return c.refreshIfLoaded();
                }
                return undefined;
              }),
            );
          }
        }
      }),
    );
  }

  public get numberOfEntities(): number {
    return this.entities.length;
  }

  private loaderForFind<T extends Entity>(type: EntityConstructor<T>): DataLoader<FilterAndSettings<T>, unknown[]> {
    return getOrSet(this.findLoaders, type.name, () => {
      return new DataLoader<FilterAndSettings<T>, unknown[], string>(
        async (queries) => {
          function ensureUnderLimit(rows: unknown[]): unknown[] {
            if (rows.length >= entityLimit) {
              throw new Error(`Query returned more than ${entityLimit} rows`);
            }
            return rows;
          }

          // If there is only 1 query, we can skip the tagging step.
          if (queries.length === 1) {
            return [ensureUnderLimit(await buildQuery(this.knex, type, queries[0]))];
          }

          const { knex } = this;

          // Map each incoming query[i] to itself or a previous dup
          const uniqueQueries: FilterAndSettings<T>[] = [];
          const queryToUnique: Record<number, number> = {};
          queries.forEach((q, i) => {
            let j = uniqueQueries.findIndex((uq) => whereFilterHash(uq) === whereFilterHash(q));
            if (j === -1) {
              uniqueQueries.push(q);
              j = uniqueQueries.length - 1;
            }
            queryToUnique[i] = j;
          });

          // There are duplicate queries, but only one unique query, so we can execute just it w/o tagging.
          if (uniqueQueries.length === 1) {
            const rows = ensureUnderLimit(await buildQuery(this.knex, type, queries[0]));
            // Reuse this same result for however many callers asked for it.
            return queries.map(() => rows);
          }

          // TODO: Instead of this tagged approach, we could probably check if the each
          // where cause: a) has the same structure for joins, and b) has conditions that
          // we can evaluate client-side, and then combine it into a query like:
          //
          // SELECT entity.*, t1.foo as condition1, t2.bar as condition2 FROM ...
          // WHERE t1.foo (union of each queries condition)
          //
          // And then use the `condition1` and `condition2` to tease the combined result set
          // back apart into each condition's result list.

          // For each query, add an additional `__tag` column that will identify that query's
          // corresponding rows in the combined/UNION ALL'd result set.
          //
          // We also add a `__row` column with that queries order, so that after we `UNION ALL`,
          // we can order by `__tag` + `__row` and ensure we're getting back the combined rows
          // exactly as they would be in done individually (i.e. per the docs `UNION ALL` does
          // not gaurantee order).
          const tagged = uniqueQueries.map((queryAndSettings, i) => {
            const query = buildQuery(this.knex, type, queryAndSettings) as QueryBuilder;
            return query.select(knex.raw(`${i} as __tag`), knex.raw("row_number() over () as __row"));
          });

          const meta = getMetadata(type);

          // Kind of dumb, but make a dummy row to start our query with
          let query = knex
            .select("*", knex.raw("-1 as __tag"), knex.raw("-1 as __row"))
            .from(meta.tableName)
            .orderBy("__tag", "__row")
            .where({ id: -1 });

          // Use the dummy query as a base, then `UNION ALL` in all the rest
          tagged.forEach((add) => {
            query = query.unionAll(add, true);
          });

          // Issue a single SQL statement for all of them
          const rows = ensureUnderLimit(await query);

          const resultForUniques: any[][] = [];
          uniqueQueries.forEach((q, i) => {
            resultForUniques[i] = [];
          });
          rows.forEach((row: any) => {
            resultForUniques[row["__tag"]].push(row);
          });

          // We return an array-of-arrays, where result[i] is the rows for queries[i]
          const result: any[][] = [];
          queries.forEach((q, i) => {
            result[i] = resultForUniques[queryToUnique[i]];
          });
          return result;
        },
        {
          // Our filter/order tuple is a complex object, so object-hash it to ensure caching works
          cacheKeyFn: whereFilterHash,
        },
      );
    });
  }

  private loaderForEntity<T extends Entity>(meta: EntityMetadata<T>): DataLoader<string, T | undefined> {
    return getOrSet(this.__data.loaders, meta.type, () => {
      return new DataLoader<string, T | undefined>(async (_keys) => {
        assertIdsAreTagged(_keys);
        const keys = deTagIds(meta, _keys);

        const rows = await this.knex.select("*").from(meta.tableName).whereIn("id", keys);

        // Pass overwriteExisting (which is the default anyway) because it might be EntityManager.refresh calling us.
        const entities = rows.map((row) => this.hydrate(meta.cstr, row, { overwriteExisting: true }));
        const entitiesById = indexBy(entities, (e) => e.id!);

        // Return the results back in the same order as the keys
        return _keys.map((k) => {
          const entity = entitiesById.get(k);
          // We generally expect all of our entities to be found, but they may not for API calls like
          // `findOneOrFail` or for `EntityManager.refresh` when the entity has been deleted out from
          // under us.
          if (entity === undefined) {
            const existingEntity = this.findExistingInstance<T>(k);
            if (existingEntity) {
              existingEntity.__orm.deleted = "deleted";
            }
          }
          return entity;
        });
      });
    });
  }

  // Handles our Unit of Work-style look up / deduplication of entity instances.
  private findExistingInstance<T>(id: string): T | undefined {
    assertIdsAreTagged([id]);
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
  public hydrate<T extends Entity>(type: EntityConstructor<T>, row: any, options?: { overwriteExisting?: boolean }): T {
    const meta = getMetadata(type);
    const id = keyToString(meta, row["id"]) || fail("No id column was available");
    // See if this is already in our UoW
    let entity = this.findExistingInstance(id) as T;
    if (!entity) {
      // Pass id as a hint that we're in hydrate mode
      entity = new type(this, id);
      meta.columns.forEach((c) => c.serde.setOnEntity(entity!.__orm.data, row));
    } else if (options?.overwriteExisting !== false) {
      // Usually if the entity alrady exists, we don't write over it, but in this case
      // we assume that `EntityManager.refresh` is telling us to explicitly load the
      // latest data.
      meta.columns.forEach((c) => c.serde.setOnEntity(entity!.__orm.data, row));
    }
    return entity;
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
  tableName: string;
  tagName: string;
  // Eventually our dbType should go away to support N-column fields
  columns: Array<{ fieldName: string; columnName: string; dbType: string; serde: ColumnSerde }>;
  fields: Array<Field>;
  config: ConfigApi<T>;
  factory: (em: EntityManager, opts?: any) => New<T>;
}

export type Field =
  | PrimaryKeyField
  | PrimitiveField
  | EnumField
  | OneToManyField
  | ManyToOneField
  | ManyToManyField
  | OneToOneField;

export type PrimaryKeyField = {
  kind: "primaryKey";
  fieldName: string;
  fieldIdName: undefined;
  required: true;
};

export type PrimitiveField = {
  kind: "primitive";
  fieldName: string;
  fieldIdName: undefined;
  required: boolean;
  derived: "orm" | "sync" | "async" | false;
  protected: boolean;
  type: string | Function;
};

export type EnumField = {
  kind: "enum";
  fieldName: string;
  fieldIdName: undefined;
  required: boolean;
  enumDetailType: { getValues(): ReadonlyArray<unknown> };
};

export type OneToManyField = {
  kind: "o2m";
  fieldName: string;
  fieldIdName: string;
  required: boolean;
  otherMetadata: () => EntityMetadata<any>;
  otherFieldName: string;
};

export type ManyToOneField = {
  kind: "m2o";
  fieldName: string;
  fieldIdName: string;
  required: boolean;
  otherMetadata: () => EntityMetadata<any>;
  otherFieldName: string;
};

export type ManyToManyField = {
  kind: "m2m";
  fieldName: string;
  fieldIdName: string;
  required: boolean;
  otherMetadata: () => EntityMetadata<any>;
  otherFieldName: string;
};

export type OneToOneField = {
  kind: "o2o";
  fieldName: string;
  fieldIdName: string;
  required: boolean;
  otherMetadata: () => EntityMetadata<any>;
  otherFieldName: string;
};

export function isEntity(maybeEntity: any): maybeEntity is Entity {
  return maybeEntity && typeof maybeEntity === "object" && "id" in maybeEntity && "__orm" in maybeEntity;
}

export function isKey(k: any): k is string {
  return typeof k === "string";
}

/** Compares `a` to `b`, where `b` might be an id. B/c ids can overlap, we need to know `b`'s metadata type. */
export function sameEntity(a: Entity, bMeta: EntityMetadata<any>, bCurrent: Entity | string | undefined): boolean {
  if (a === undefined || bCurrent === undefined) {
    return false;
  }
  return (
    a === bCurrent || (getMetadata(a) === bMeta && maybeResolveReferenceToId(a) === maybeResolveReferenceToId(bCurrent))
  );
}

export function getMetadata<T extends Entity>(entity: T): EntityMetadata<T>;
export function getMetadata<T extends Entity>(type: EntityConstructor<T>): EntityMetadata<T>;
export function getMetadata<T extends Entity>(entityOrType: T | EntityConstructor<T>): EntityMetadata<T> {
  return (typeof entityOrType === "function"
    ? (entityOrType as any).metadata
    : entityOrType.__orm.metadata) as EntityMetadata<T>;
}

/** Thrown by `findOneOrFail` if an entity is not found. */
export class NotFoundError extends Error {}

/** Thrown by `findOne` and `findOneOrFail` if more than one entity is found. */
export class TooManyError extends Error {}

/**
 * For the entities currently in `todos`, find any reactive validation rules that point
 * from the currently-changed entities back to each rule's originally-defined-in entity,
 * and ensure those entities are added to `todos`.
 */
async function addReactiveValidations(todos: Record<string, Todo>): Promise<void> {
  const p: Promise<void>[] = Object.values(todos).flatMap((todo) => {
    const entities = [...todo.inserts, ...todo.updates, ...todo.deletes];
    // Find each statically-declared reactive rule for the given entity type
    return todo.metadata.config.__data.reactiveRules.map(async (reverseHint) => {
      // Add the resulting "found" entities to the right todos to be validated
      (await followReverseHint(entities, reverseHint)).forEach((entity) => {
        const todo = getTodo(todos, entity);
        if (!todo.inserts.includes(entity) && !todo.updates.includes(entity) && !entity.isDeletedEntity) {
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
async function cascadeDeletesIntoRelations(todos: Record<string, Todo>): Promise<void> {
  const entities = Object.values(todos).flatMap((todo) => todo.deletes);
  await Promise.all(
    entities
      .flatMap((e) => Object.values(e))
      .filter((v) => v instanceof AbstractRelationImpl)
      .map((relation: AbstractRelationImpl<any>) => {
        return relation.onEntityDeletedAndFlushing();
      }),
  );
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

async function runHook(
  hook: EntityHook,
  todos: Record<string, Todo>,
  keys: ("inserts" | "deletes" | "updates" | "validates")[],
): Promise<void> {
  const p = Object.values(todos).flatMap((todo) => {
    const hookFns = todo.metadata.config.__data.hooks[hook];

    return keys
      .flatMap((k) => todo[k].filter((e) => k === "deletes" || !e.isDeletedEntity))
      .flatMap((entity) => {
        return hookFns.map(async (fn) => fn(entity));
      });
  });
  await Promise.all(p);
}

async function beforeDelete(todos: Record<string, Todo>): Promise<void> {
  await runHook("beforeDelete", todos, ["deletes"]);
}

async function beforeFlush(todos: Record<string, Todo>): Promise<void> {
  await runHook("beforeFlush", todos, ["inserts", "updates"]);
}

async function afterValidation(todos: Record<string, Todo>): Promise<void> {
  await runHook("afterValidation", todos, ["inserts", "updates"]);
}

async function afterCommit(todos: Record<string, Todo>): Promise<void> {
  await runHook("afterCommit", todos, ["inserts", "updates"]);
}

function coerceError(
  entity: Entity,
  maybeError: string | ValidationError | ValidationError[] | undefined,
): ValidationError[] {
  if (maybeError === undefined) {
    return [];
  } else if (typeof maybeError === "string") {
    return [{ entity, message: maybeError }];
  } else if (Array.isArray(maybeError)) {
    return maybeError as ValidationError[];
  } else {
    return [maybeError];
  }
}

type Narrowable = string | number | boolean | symbol | object | undefined | void | null | {};

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
      return [m, m.fields.filter((f) => f.kind === "primitive" && f.derived === "sync").map((f) => f.fieldName)];
    }),
  );

  for (const entity of entities) {
    const derivedFields = derivedFieldsByMeta.get(entity.__orm.metadata);
    derivedFields?.forEach((fieldName) => {
      // setField will intelligently mark/not mark the field as dirty.
      setField(entity, fieldName, (entity as any)[fieldName]);
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
        await Promise.all(changed.map((entity) => setField(entity, key, fn(entity))));
      }
    });
    await Promise.all(p);
  });
  await Promise.all(p);
}

// If a where clause includes an entity, object-hash cannot hash it, so just use the id.
const replacer = (v: any) => (isEntity(v) ? v.id : v);

function whereFilterHash(where: FilterAndSettings<any>): string {
  return hash(where, { replacer });
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
        const isReference = getMetadata(c).fields.find((f) => f.fieldName === fieldName)?.kind === "m2o";
        const hasChanged = isReference && (c as any).changes[fieldName].hasChanged;
        const originalValue = (c as any).changes[fieldName].originalValue;
        if (hasChanged && originalValue) {
          const originalEntityMaybePromise = isEntity(originalValue)
            ? originalValue
            : getEm(c).load((c as any)[fieldName].otherMeta.cstr, originalValue);
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
