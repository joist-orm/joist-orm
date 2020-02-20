import DataLoader from "dataloader";
import Knex from "knex";
import { flushEntities, flushJoinTables, sortEntities, sortJoinRows } from "./EntityPersister";
import { getOrSet, indexBy } from "./utils";
import { ColumnSerde, keyToString } from "./serde";
import {
  Collection,
  LoadedCollection,
  LoadedReference,
  ManyToOneReference,
  OneToManyCollection,
  Reference,
  Relation,
} from "./index";
import { JoinRow } from "./collections/ManyToManyCollection";
import { buildQuery } from "./QueryBuilder";

export interface EntityConstructor<T> {
  new (em: EntityManager, opts: any): T;
}

/** The `__orm` metadata field we track on each instance. */
export interface EntityOrmField {
  metadata: EntityMetadata<Entity>;
  data: Record<any, any>;
  dirty?: boolean;
  deleted?: boolean;
  em: EntityManager;
}

export interface Entity {
  id: string | undefined;

  __orm: EntityOrmField;
}

export type FilterQuery<T extends Entity> = {
  [P in keyof T]?: T[P] extends Reference<T, infer U, any> ? FilterQuery<U> : T[P];
};

/** Marks a given `T[P]` as the loaded/synchronous version of the collection. */
type MarkLoaded<T extends Entity, P, H = {}> = P extends Reference<T, infer U, infer N>
  ? LoadedReference<T, Loaded<U, H>, N>
  : P extends Collection<T, infer U>
  ? LoadedCollection<T, Loaded<U, H>>
  : P;

/** Marks all references/collections of `T` as loaded, i.e. for newly instantiated entities. */
export type AllLoaded<T extends Entity> = T &
  {
    [P in keyof T]: MarkLoaded<T, T[P]>;
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

  public async find<T extends Entity>(type: EntityConstructor<T>, where: FilterQuery<T>): Promise<T[]>;
  public async find<T extends Entity, H extends LoadHint<T>>(
    type: EntityConstructor<T>,
    where: FilterQuery<T>,
    options: { populate: H },
  ): Promise<Loaded<T, H>[]>;
  async find<T extends Entity>(
    type: EntityConstructor<T>,
    where: FilterQuery<T>,
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

  /** Creates a new `type` and marks it as loaded, i.e. we know its collections are all safe to access in memory. */
  public create<T extends Entity, O>(type: new (em: EntityManager, opts: O) => T, opts: O): AllLoaded<T> {
    return (new type(this, opts) as any) as AllLoaded<T>;
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
   * This method is async b/c deleting an entity that is the target of foreign keys requires
   * loading all of those collections and un-setting the otherField on those entities.
   *
   * In theory, we wouldn't have to do this for foreign keys that are cascade delete / cascade
   * null, but in general I prefer pulling that sort of logic into the domain layer and giving
   * the domain model life cycle hooks a chance to handle it.
   */
  async delete(entity: Entity): Promise<void> {
    entity.__orm.deleted = true;
    // Unhook us from the other side's collection
    const p = Object.values(entity).map(async (v: any) => {
      if (v instanceof ManyToOneReference) {
        // I.e. we're a Book, and this is the Book.author ManyToOne.
        // We want Author.books to respect this deletion, which this `set(...)` call will do.
        // Currently, this won't mark our `Author` as dirty/for re-validation.
        v.set(undefined, { beingDeleted: true });
      } else if (v instanceof OneToManyCollection) {
        // I.e. we're an Author, and this is the Author.books OneToManyCollection.
        // For this collection to be loaded because it's likely all of our "children" need
        // to know, btw, this for their foreign key is pointing to is going away.
        const others = await v.load();
        others.forEach(other => {
          // TODO What if other.otherFieldName is required/not-null?
          (other[v.otherFieldName] as ManyToOneReference<any, any, any>).set(undefined);
        });
      }
    });
    await Promise.all(p);
  }

  markDirty(entity: Entity): void {
    entity.__orm.dirty = true;
  }

  /**
   * Flushes the SQL for any changed entities to the database.
   *
   * Currently this `BEGIN`s and `COMMIT`s a new transaction on every call;
   * we should also support an `EntityManager` itself running all queries
   * (i.e. including the initial `SELECT`s) in a transaction.
   */
  async flush(): Promise<void> {
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
          // Then refresh any loaded collections
          await Promise.all(
            Object.values(entity).map(c => {
              if ("refreshIfLoaded" in c) {
                return c.refreshIfLoaded();
              }
            }),
          );
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
        return keys.map(k => entitiesById.get(k));
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
      entity = (new meta.cstr(this, {}) as any) as T;
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

export function getMetadata<T extends Entity>(entity: T): EntityMetadata<T>;
export function getMetadata<T extends Entity>(type: EntityConstructor<T>): EntityMetadata<T>;
export function getMetadata<T extends Entity>(entityOrType: T | EntityConstructor<T>): EntityMetadata<T> {
  return (isEntity(entityOrType) ? entityOrType.__orm.metadata : (entityOrType as any).metadata) as EntityMetadata<T>;
}
