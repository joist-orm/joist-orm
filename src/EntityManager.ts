import DataLoader from "dataloader";
import Knex from "knex";
import { flushEntities, flushJoinTables } from "./EntityPersister";
import { getOrSet, indexBy } from "./utils";
import { ColumnSerde, keyToString } from "./serde";
import { Collection, LoadedCollection, LoadedReference, Reference, Relation } from "./index";
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
  em: EntityManager;
}

export interface Entity {
  id: string | undefined;

  __orm: EntityOrmField;
}

export type FilterQuery<T extends Entity> = {
  [P in keyof T]?: T[P] extends Reference<T, infer U> ? FilterQuery<U> : T[P];
};

/** Marks a given `T[P]` as the loaded/synchronous version of the collection. */
type MarkLoaded<T extends Entity, P, H = {}> = P extends Reference<T, infer U>
  ? LoadedReference<T, Loaded<U, H>>
  : P extends Collection<T, infer U>
  ? LoadedCollection<T, Loaded<U, H>>
  : P;

/** Marks all references/collections of `T` as loaded, i.e. for newly instantiated entities. */
export type AllLoaded<T extends Entity> = {
  [P in keyof T]: MarkLoaded<T, T[P]>;
};

/** Given an entity `T` that is being populated with hints `H`, marks the `H` attributes as populated. */
export type Loaded<T extends Entity, H extends LoadHint<T>> = {
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
type LoadHint<T extends Entity> = keyof RelationsIn<T> | Array<keyof RelationsIn<T>> | NestedLoadHint<T>;

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

  public async find<T extends Entity>(type: EntityConstructor<T>, where: FilterQuery<T>): Promise<T[]> {
    const meta = getMetadata(type);
    const query = buildQuery(this.knex, type, where);
    const rows = await query;
    return rows.map(row => this.hydrateOrLookup(meta, row));
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
    const entity = await (this.findExistingInstance(getMetadata(type).type, id) || this.loaderForEntity(type).load(id));
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
    if (entity.id && this.findExistingInstance(entity.__orm.metadata.type, entity.id) !== undefined) {
      throw new Error(`Entity ${entity} has a duplicate instance already loaded`);
    }
    // Set a default createdAt/updatedAt that we'll keep if this is a new entity, or over-write if we're loaded an existing row
    entity.__orm.data["createdAt"] = new Date();
    entity.__orm.data["updatedAt"] = new Date();
    this.entities.push(entity);
  }

  markDirty(entity: Entity): void {
    entity.__orm.dirty = true;
  }

  async flush(): Promise<void> {
    await flushEntities(this.knex, this.entities);
    await flushJoinTables(this.knex, this.joinRows);
  }

  private loaderForEntity<T extends Entity>(type: EntityConstructor<T>) {
    return getOrSet(this.loaders, type.name, () => {
      return new DataLoader<string, T>(async keys => {
        const meta = getMetadata(type);

        const rows = await this.knex
          .select("*")
          .from(meta.tableName)
          .whereIn("id", keys as string[]);

        const entities = rows.map(row => this.hydrateOrLookup(meta, row));
        const entitiesById = indexBy(entities, e => e.id!);
        return keys.map(k => entitiesById.get(k) || new Error(`${type.name}#${k} not found`));
      });
    });
  }

  // Handles our Unit of Work-style look up / deduplication of entity instances.
  // TODO Hide private impl
  public findExistingInstance(type: string, id: string): Entity | undefined {
    return this.entities.find(e => e.__orm.metadata.type === type && e.id === id);
  }

  // TOOD Hide private
  public hydrateOrLookup<T extends Entity>(meta: EntityMetadata<T>, row: any): T {
    const id = keyToString(row["id"])!;
    // See if this is already in our UoW
    let entity = this.findExistingInstance(meta.type, id) as T;
    if (!entity) {
      entity = (new meta.cstr(this, {}) as any) as T;
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

export function getMetadata<T extends Entity>(type: EntityConstructor<T>): EntityMetadata<T> {
  return (type as any).metadata as EntityMetadata<T>;
}
