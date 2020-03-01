import DataLoader from "dataloader";
import Knex from "knex";
import { flushEntities, flushJoinTables, sortEntities, sortJoinRows } from "./EntityPersister";
import { getOrSet, indexBy } from "./utils";
import { ColumnSerde, keyToString, maybeResolveReferenceToId } from "./serde";
import { Collection, LoadedCollection, LoadedReference, Reference, Relation } from "./index";
import { JoinRow } from "./collections/ManyToManyCollection";
import { buildQuery } from "./QueryBuilder";
import { AbstractRelationImpl } from "./collections/AbstractRelationImpl";

export interface EntityConstructor<T> {
  new (em: EntityManager, opts: any): T;
}

/** Return the `FooOpts` type a given `Foo` entity constructor. */
export type OptsOf<T> = T extends { __optsType: infer O } ? O : never;

/** Return the `Foo` type for a given `Foo` entity constructor. */
export type EntityOf<C> = C extends new (em: EntityManager, opts: any) => infer T ? T : never;

/** Pulls the entity query type out of a given entity type T. */
export type FilterOf<T> = T extends { __filterType: infer Q } ? Q : never;

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

/** A marker/base interface for all of our entity types. */
export interface Entity {
  id: string | undefined;

  __orm: EntityOrmField;
}

/** Marks a given `T[P]` as the loaded/synchronous version of the collection. */
type MarkLoaded<T extends Entity, P, H = {}> = P extends Reference<T, infer U, infer N>
  ? LoadedReference<T, Loaded<U, H>, N>
  : P extends Collection<T, infer U>
  ? LoadedCollection<T, Loaded<U, H>>
  : P;

// Helper type for New b/c "O[K] extends Entity" doesn't seem to narrow
// correctly when inlined into New as a nested ternary.
type MaybeUseOptsType<T extends Entity, O, K extends keyof T & keyof O> = O[K] extends Entity
  ? T[K] extends Reference<T, infer U, infer N>
    ? LoadedReference<T, O[K], N>
    : never
  : O[K] extends Array<infer OU>
  ? OU extends Entity
    ? T[K] extends Collection<T, infer U>
      ? LoadedCollection<T, OU>
      : never
    : never
  : T[K];

/**
 * Marks all references/collections of `T` as loaded, i.e. for newly instantiated entities where
 * we know there are no already-existing rows with fk's to this new entity in the database.
 *
 * `O` is the generic from the call site so that if the caller passes `{ author: SomeLoadedAuthor }`,
 * we'll prefer that type, as it might have more nested load hints that we can't otherwise assume.
 */
export type New<T extends Entity, O extends OptsOf<T> = OptsOf<T>> = T &
  {
    [K in keyof T]: K extends keyof O ? MaybeUseOptsType<T, O, K> : MarkLoaded<T, T[K]>;
  };

/** Given an entity `T` that is being populated with hints `H`, marks the `H` attributes as populated. */
export type Loaded<T extends Entity, H extends LoadHint<T>> = T &
  {
    [K in keyof T]: H extends NestedLoadHint<T>
      ? LoadedIfInNestedHint<T, K, H>
      : H extends Array<infer U>
      ? LoadedIfInKeyHint<T, K, U>
      : LoadedIfInKeyHint<T, K, H>;
  };

type LoadedIfInNestedHint<T extends Entity, K extends keyof T, H> = K extends keyof H
  ? MarkLoaded<T, T[K], H[K]>
  : T[K];

type LoadedIfInKeyHint<T extends Entity, K extends keyof T, H> = K extends H ? MarkLoaded<T, T[K]> : T[K];

/** From any non-`Relations` field in `T`, i.e. for loader hints. */
type RelationsIn<T extends Entity> = SubType<T, Relation<any, any>>;

// https://medium.com/dailyjs/typescript-create-a-condition-based-subset-types-9d902cea5b8c
type SubType<T, C> = Pick<T, { [K in keyof T]: T[K] extends C ? K : never }[keyof T]>;

// We accept load hints as a string, or a string[], or a hash of { key: nested };
export type LoadHint<T extends Entity> = keyof RelationsIn<T> | ReadonlyArray<keyof RelationsIn<T>> | NestedLoadHint<T>;

type NestedLoadHint<T extends Entity> = {
  [K in keyof RelationsIn<T>]?: T[K] extends Relation<T, infer U> ? LoadHint<U> : never;
};

export type LoaderCache = Record<string, DataLoader<any, any>>;

export class EntityManager {
  /// TODO Hide impl
  constructor(public knex: Knex) {}

  // TODO make private
  loaders: LoaderCache = {};
  private entities: Entity[] = [];
  // TODO make private
  joinRows: Record<string, JoinRow[]> = {};

  public async find<T extends Entity>(type: EntityConstructor<T>, where: FilterOf<T>): Promise<T[]>;
  public async find<T extends Entity, H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    where: FilterOf<T>,
    options?: { populate: H },
  ): Promise<Loaded<T, H>[]>;
  async find<T extends Entity>(
    type: EntityConstructor<T>,
    where: FilterOf<T>,
    options?: { populate: any },
  ): Promise<T[]> {
    const meta = getMetadata(type);
    const query = buildQuery(this.knex, type, where);
    const rows = await query;
    const result = rows.map(row => this.hydrateOrLookup(meta, row));
    if (options?.populate) {
      await this.populate(result, options.populate);
    }
    return result;
  }

  /** Executes a given query filter and returns exactly one result, otherwise throws `NotFoundError` or `TooManyError`. */
  public async findOneOrFail<T extends Entity>(type: EntityConstructor<T>, where: FilterOf<T>): Promise<T>;
  public async findOneOrFail<T extends Entity, H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    where: FilterOf<T>,
    options: { populate: H },
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
      throw new TooManyError(`Found more than one: ${list.map(e => e.toString()).join(", ")}`);
    }
    return list[0];
  }

  /** Creates a new `type` and marks it as loaded, i.e. we know its collections are all safe to access in memory. */
  public create<T extends Entity, O extends OptsOf<T>>(type: EntityConstructor<T>, opts: O): New<T, O> {
    // The constructor will run setOpts which handles defaulting collections to the right state.
    return (new type(this, opts) as any) as New<T, O>;
  }

  /** Returns an instance of `type` for the given `id`, resolving to an existing instance if in our Unit of Work. */
  public async load<T extends Entity>(type: EntityConstructor<T>, id: string): Promise<T>;
  public async load<T extends Entity, H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    id: string,
    populate: H,
  ): Promise<Loaded<T, H>>;
  async load<T extends Entity>(type: EntityConstructor<T>, id: string, hint?: any): Promise<T> {
    if (typeof (id as any) !== "string") {
      throw new Error(`Expected ${id} to be a string`);
    }
    const entity = this.findExistingInstance(getMetadata(type).cstr, id) || (await this.loaderForEntity(type).load(id));
    if (!entity) {
      throw new Error(`${type.name}#${id} was not found`);
    }
    if (hint) {
      await this.populate(entity, hint);
    }
    return entity;
  }

  /** Given a hint `H` (a field, array of fields, or nested hash), pre-load that data into `entity` for sync access. */
  public async populate<T extends Entity, H extends LoadHint<T>>(entity: T, hint: H): Promise<Loaded<T, H>>;
  public async populate<T extends Entity, H extends LoadHint<T>>(entity: T[], hint: H): Promise<Loaded<T, H>[]>;
  async populate<T extends Entity, H extends LoadHint<T>>(
    entityOrList: T | T[],
    hint: H,
  ): Promise<Loaded<T, H> | Array<Loaded<T, H>>> {
    let promises: Promise<void>[] = [];
    const list: T[] = Array.isArray(entityOrList) ? entityOrList : [entityOrList];
    list.forEach(entity => {
      // This implementation is pretty simple b/c we just loop over the hint (which is a key / array of keys /
      // hash of keys) and call `.load()` on the corresponding o2m/m2o/m2m reference/collection object. This
      // will kick in the dataloader auto-batching and end up being smartly populated (granted via 1 query per
      // entity type per "level" of resolution, instead of 1 single giant SQL query that inner joins everything
      // in).
      if (typeof hint === "string") {
        promises.push((entity as any)[hint].load());
      } else if (Array.isArray(hint)) {
        (hint as string[]).forEach(key => {
          promises.push((entity as any)[key].load());
        });
      } else if (typeof hint === "object") {
        Object.entries(hint).forEach(([key, nestedHint]) => {
          promises.push(
            (entity as any)[key].load().then((result: any) => {
              if (Array.isArray(result)) {
                return Promise.all(result.map(result => this.populate(result, nestedHint)));
              } else {
                return this.populate(result, nestedHint);
              }
            }),
          );
        });
      } else {
        throw new Error(`Unexpected hint ${hint}`);
      }
    });
    await Promise.all(promises);
    return entityOrList as any;
  }

  /** Registers a newly-instantiated entity with our EntityManager; only called by entity constructors. */
  register(entity: Entity): void {
    if (entity.id && this.findExistingInstance(getMetadata(entity).cstr, entity.id) !== undefined) {
      throw new Error(`Entity ${entity} has a duplicate instance already loaded`);
    }
    // Set a default createdAt/updatedAt that we'll keep if this is a new entity, or over-write if we're loaded an existing row
    entity.__orm.data["createdAt"] = new Date();
    entity.__orm.data["updatedAt"] = new Date();
    this.entities.push(entity);
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
    // We want to "unhook" this entity from any other currently-loaded enitty.
    //
    // A simple way of doing this would be to start at this now-deleted entity
    // and "cascading out" from its o2m/m2m collections.
    //
    // However, this only works for our o2m/m2m collections that are loaded,
    // and there might be other-side entities that _are_ loaded pointing back
    // at us that we don't realize (i.e. we're an author, and `author.books`
    // is not loaded, but there is a `book.author` loaded in the EntityManager
    // pointing at us).
    //
    // So, instead of "cascading out", we just scan all loaded entities, tell
    // them that this entity got deleted, and let them sort it out.
    this.entities
      .filter(e => e.__orm.deleted === undefined)
      .forEach(maybeOtherEntity => {
        Object.values(maybeOtherEntity).map((v: any) => {
          if (v instanceof AbstractRelationImpl) {
            v.onDeleteOfMaybeOtherEntity(deletedEntity);
          }
        });
      });
  }

  setField(entity: Entity, fieldName: string, newValue: any): void {
    const { data, originalData } = entity.__orm;
    // "Un-dirty" our originalData if newValue is reverting to originalData
    if (fieldName in originalData) {
      if (originalData[fieldName] === newValue) {
        data[fieldName] = newValue;
        delete originalData[fieldName];
        return;
      }
    }
    // Push this logic into a field serde type abstraction?
    const currentValue = data[fieldName];
    // Only save the currentValue on the 1st change of this field
    if (!(fieldName in originalData)) {
      originalData[fieldName] = currentValue;
    }
    data[fieldName] = newValue;
  }

  /**
   * Flushes the SQL for any changed entities to the database.
   *
   * Currently this `BEGIN`s and `COMMIT`s a new transaction on every call;
   * we should also support an `EntityManager` itself running all queries
   * (i.e. including the initial `SELECT`s) in a transaction.
   */
  async flush(): Promise<void> {
    // We defer doing this cascade logic until flush() so that delete() can remain synchronous.
    await this.cascadeDeletesIntoUnloadedCollections();
    const entityTodos = sortEntities(this.entities);
    const joinRowTodos = sortJoinRows(this.joinRows);
    if (entityTodos.length === 0 && Object.keys(joinRowTodos).length === 0) {
      return;
    }
    await this.knex.transaction(async tx => {
      await flushEntities(this.knex, tx, entityTodos);
      await flushJoinTables(this.knex, tx, joinRowTodos);
      await tx.commit();
    });
  }

  /** Find all deleted entities and ensure their references all know about their deleted-ness. */
  private async cascadeDeletesIntoUnloadedCollections(): Promise<void> {
    await Promise.all(
      this.entities
        .filter(e => e.__orm.deleted === "pending")
        .map(entity => {
          return Promise.all(
            Object.values(entity).map(async (v: any) => {
              if (v instanceof AbstractRelationImpl) {
                await v.onEntityDeletedAndFlushing();
              }
            }),
          );
        }),
    );
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
  async refresh(entities: Entity[]): Promise<void>;
  async refresh(entityOrListOrUndefined?: Entity | Entity[]): Promise<void> {
    const list =
      entityOrListOrUndefined === undefined
        ? this.entities
        : Array.isArray(entityOrListOrUndefined)
        ? entityOrListOrUndefined
        : [entityOrListOrUndefined];
    await Promise.all(
      list.map(async entity => {
        if (entity.id) {
          // Clear the original cached loader result and fetch the new primitives
          const loader = this.loaderForEntity(getMetadata(entity).cstr);
          loader.clear(entity.id);
          await loader.load(entity.id);
          if (entity.__orm.deleted === undefined) {
            // Then refresh any loaded collections
            await Promise.all(
              Object.values(entity).map(c => {
                if (c instanceof AbstractRelationImpl) {
                  return c.refreshIfLoaded();
                }
              }),
            );
          }
        }
      }),
    );
  }

  private loaderForEntity<T extends Entity>(type: EntityConstructor<T>): DataLoader<string, T | undefined> {
    return getOrSet(this.loaders, type.name, () => {
      return new DataLoader<string, T | undefined>(async keys => {
        const meta = getMetadata(type);

        const rows = await this.knex
          .select("*")
          .from(meta.tableName)
          .whereIn("id", keys as string[]);

        // Pass setEvenIfAlreadyFound because it might be EntityManager.refresh calling us.
        const entities = rows.map(row => this.hydrateOrLookup(meta, row, true));
        const entitiesById = indexBy(entities, e => e.id!);

        // Return the results back in the same order as the keys
        return keys.map(k => {
          const entity = entitiesById.get(k);
          // We generally expect all of our entities to be found, but they may not for API calls like
          // `findOneOrFail` or for `EntityManager.refresh` when the entity has been deleted out from
          // under us.
          if (entity === undefined) {
            const existingEntity = this.findExistingInstance(type, k);
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
  // TODO Hide private impl
  public findExistingInstance<T extends Entity>(type: EntityConstructor<T>, id: string): T | undefined {
    return this.entities.find(e => getMetadata(e).cstr === type && e.id === id) as T | undefined;
  }

  // TODO Hide private
  public hydrateOrLookup<T extends Entity>(meta: EntityMetadata<T>, row: any, setEvenIfAlreadyFound?: boolean): T {
    const id = keyToString(row["id"])!;
    // See if this is already in our UoW
    let entity = this.findExistingInstance(meta.cstr, id) as T;
    if (!entity) {
      entity = (new meta.cstr(this, undefined) as any) as T;
      meta.columns.forEach(c => c.serde.setOnEntity(entity!.__orm.data, row));
    } else if (setEvenIfAlreadyFound) {
      // Usually if the entity alrady exists, we don't write over it, but in this case
      // we assume that `EntityManager.refresh` is telling us to explicitly load the
      // latest data.
      meta.columns.forEach(c => c.serde.setOnEntity(entity!.__orm.data, row));
    }
    return entity;
  }
}

export interface EntityMetadata<T extends Entity> {
  cstr: EntityConstructor<T>;
  type: string;
  tableName: string;
  // Eventually our dbType should go away to support N-column fields
  columns: Array<{ fieldName: string; columnName: string; dbType: string; serde: ColumnSerde }>;
  order: number;
}

export function isEntity(e: any): e is Entity {
  return e !== undefined && e instanceof Object && "id" in e && "__orm" in e;
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
  return (isEntity(entityOrType) ? entityOrType.__orm.metadata : (entityOrType as any).metadata) as EntityMetadata<T>;
}

export function ensureNotDeleted(entity: Entity): void {
  if (entity.__orm.deleted) {
    throw new Error(entity.toString() + " is marked as deleted");
  }
}

export class NotFoundError extends Error {}

export class TooManyError extends Error {}
