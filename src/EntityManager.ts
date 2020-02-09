import DataLoader from "dataloader";
import Knex from "knex";
import { flushEntities, flushJoinTables } from "./EntityPersister";
import { fail, getOrSet, indexBy } from "./utils";
import { ColumnSerde, keyToString } from "./serde";
import { Collection, LoadedCollection, LoadedReference, Reference } from "./index";
import { JoinRow } from "./collections/ManyToManyCollection";

export interface EntityConstructor<T> {
  new (em: EntityManager, opts?: Partial<T>): T;
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

type FilterQuery<T extends Entity> = {
  [P in keyof T]?: T[P];
};

/** Marks a given `T[P]` as the loaded/synchronous version of the collection. */
type MarkLoaded<T extends Entity, P extends keyof T> = T[P] extends Reference<T, infer U>
  ? LoadedReference<T, U>
  : T[P] extends Collection<T, infer U>
  ? LoadedCollection<T, U>
  : T[P];

/** Marks all references/collections of `T` as loaded, i.e. for newly instantiated entities. */
export type Loaded<T extends Entity> = {
  [P in keyof T]: MarkLoaded<T, P>;
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

  async find<T extends Entity>(type: EntityConstructor<T>, where: FilterQuery<T>): Promise<T[]> {
    const meta = getMetadata(type);

    let query = this.knex({ t: meta.tableName })
      .select("t.*")
      .orderBy("t.id");

    Object.entries(where).forEach(([key, value]) => {
      const column = meta.columns.find(c => c.fieldName === key) || fail();
      query = query.where(column.columnName, value);
    });

    const rows = await query;

    return rows.map(row => this.hydrateOrLookup(meta, row));
  }

  /** Creates a new `type` and marks it as loaded, i.e. we know its collections are all safe to access in memory. */
  create<T extends Entity>(type: EntityConstructor<T>, opts?: Partial<T>): Loaded<T> {
    return new type(this, opts) as Loaded<T>;
  }

  /** Returns an instance of `type` for the given `id`, resolving to an existing instance if in our Unit of Work. */
  async load<T extends Entity>(type: EntityConstructor<T>, id: string): Promise<T> {
    if (typeof (id as any) !== "string") {
      throw new Error(`Expected ${id} to be a string`);
    }
    return this.findExistingInstance(getMetadata(type).type, id) || this.loaderForEntity(type).load(id);
  }

  /** Registers a newly-instantiated entity with our EntityManager; only called by entity constructors. */
  register(entity: Entity): void {
    if (entity.id && this.findExistingInstance(entity.__orm.metadata.type, entity.id) !== undefined) {
      throw new Error(`Entity ${entity} has a duplicate instance already loaded`);
    }
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
      entity = (new meta.cstr(this) as any) as T;
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
