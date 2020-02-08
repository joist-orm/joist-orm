import DataLoader from "dataloader";
import Knex from "knex";
import { flushEntities } from "./EntityPersister";
import { getOrSet } from "./utils";
import { OneToManyCollection } from "./collections/OneToManyCollection";
import { ColumnSerde, keyToNumber, keyToString } from "./serde";
import { Collection, LoadedCollection, LoadedReference, Reference } from "./index";
import { ManyToManyCollection } from "./collections/ManyToManyCollection";

export interface EntityConstructor<T> {
  new (em: EntityManager, opts?: Partial<T>): T;
}

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

type FilterQuery<T> = any;

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

export class EntityManager {
  constructor(private knex: Knex) {}

  private loaders: Record<string, DataLoader<any, any>> = {};
  private entities: Entity[] = [];

  async find<T extends Entity>(type: EntityConstructor<T>, where: FilterQuery<T>): Promise<T[]> {
    return this.loaderForEntity(type).load(1);
  }

  /** Creates a new `type` and marks it as loaded, i.e. we know it's collections are all safe to access in memory. */
  create<T extends Entity>(type: EntityConstructor<T>, opts?: Partial<T>): Loaded<T> {
    return new type(this, opts) as Loaded<T>;
  }

  async load<T extends Entity>(type: EntityConstructor<T>, id: string): Promise<T> {
    if (typeof (id as any) !== "string") {
      throw new Error(`Expected ${id} to be a string`);
    }
    return this.findExistingInstance((type as any).metadata.type, id) || this.loaderForEntity(type).load(id);
  }

  async loadCollection<T extends Entity, U extends Entity>(collection: OneToManyCollection<T, U>): Promise<U[]> {
    return this.loaderForCollection(collection).load(collection.entity.id);
  }

  async loadJoinTable<T extends Entity, U extends Entity>(collection: ManyToManyCollection<T, U>): Promise<U[]> {
    const key = collection.dataLoaderKey();
    return this.loaderForJoinTable(collection).load(key);
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
  }

  private loaderForEntity<T extends Entity>(type: EntityConstructor<T>) {
    return getOrSet(this.loaders, type.name, () => {
      return new DataLoader<string, T>(async keys => {
        const meta = (type as any).metadata as EntityMetadata<T>;

        const rows = await this.knex
          .select("*")
          .from(meta.tableName)
          .whereIn("id", keys as string[]);

        const rowsById = new Map<string, T>();
        rows.forEach(row => {
          const entity = (new meta.cstr(this) as any) as T;
          meta.columns.forEach(c => c.serde.setOnEntity(entity.__orm.data, row));
          rowsById.set(entity.id!, entity);
        });

        return keys.map(k => rowsById.get(k) || new Error(`${type.name}#${k} not found`));
      });
    });
  }

  private loaderForCollection<T extends Entity, U extends Entity>(collection: OneToManyCollection<T, U>) {
    // The metadata for the entity that contains the collection
    const meta = collection.entity.__orm.metadata;
    const loaderName = `${meta.tableName}.${collection.fieldName}`;
    return getOrSet(this.loaders, loaderName, () => {
      return new DataLoader<string, U[]>(async keys => {
        const otherMeta = collection.otherMeta;

        const rows = await this.knex
          .select("*")
          .from(otherMeta.tableName)
          .whereIn(collection.otherColumnName, keys as string[])
          .orderBy("id");

        const rowsById: Record<string, U[]> = {};

        rows.forEach(row => {
          const id = keyToString(row["id"])!;

          // See if this is already in our UoW
          let entity = this.findExistingInstance(otherMeta.type, id) as U;

          // If not create it.
          if (!entity) {
            entity = (new otherMeta.cstr(this) as any) as U;
            otherMeta.columns.forEach(c => c.serde.setOnEntity(entity!.__orm.data, row));
          }

          // TODO If this came from the UoW, it may not be an id? I.e. pre-insert.
          const ownerId = entity.__orm.data[collection.otherFieldName];
          if (ownerId === undefined) {
            throw new Error("Could not find ownerId in other entity");
          }

          getOrSet(rowsById, ownerId, []).push(entity);
        });

        return keys.map(k => rowsById[k] || []);
      });
    });
  }

  private loaderForJoinTable<T extends Entity, U extends Entity>(collection: ManyToManyCollection<T, U>) {
    const { joinTableName } = collection;
    const { em } = collection.entity.__orm;
    return getOrSet(this.loaders, joinTableName, () => {
      return new DataLoader<string, Entity[]>(async keys => {
        // Break out `column_id=string` keys out
        const columns: Record<string, string[]> = {};
        keys.forEach(key => {
          const [columnId, id] = key.split("=");
          getOrSet(columns, columnId, []).push(id);
        });

        // Or together `where tag_id in (...)` and `book_id in (...)`
        let query = this.knex.select("*").from(joinTableName);
        Object.entries(columns).forEach(([columnId, values]) => {
          query = query.orWhereIn(
            columnId,
            values.map(id => keyToNumber(id)!),
          );
        });

        const rows = (await query.orderBy("id")) as JoinRow[];

        // Make a map that will be both `tag_id=2 -> [...]` and `book_id=3 -> [...]`
        const rowsByKey: Record<string, JoinRow[]> = {};

        // Each join table row might have some promises to load the other entity. Eventually
        // We should just pull the other side in via the ^ query.
        const p = rows.map(async row => {
          // For this join table row, resolve the entities both of foreign keys. For now
          // we're using the EntityManager.load to do this in batch for this, but eventually
          // we should pull those into the row itself.
          const p = Object.entries(row).map(async entry => {
            const [column, value] = entry;
            if (column === "id" || column === "created_at") {
              return;
            }

            // We'll do this twice per join table row, but in batch.
            const cstr = (column === collection.columnName
              ? collection.entity.__orm.metadata.cstr
              : collection.otherType) as EntityConstructor<any>;

            row[column] = await em.load(cstr, keyToString(value)!);

            // Put this row into the map for both join table columns, i.e. `book_id=2` and `tag_id=3`
            const key = `${column}=${value}`;
            getOrSet(rowsByKey, key, []).push(row);
          });
          await Promise.all(p);
        });
        await Promise.all(p);

        return keys.map(key => {
          const [column] = key.split("=");
          const joinRows = rowsByKey[key] || [];
          const otherColumn = column === collection.columnName ? collection.otherColumnName : collection.columnName;
          return joinRows.map(joinRow => joinRow[otherColumn] as Entity);
        });
      });
    });
  }

  // Handles our Unit of Work-style look up / deduplication of entity instances.
  private findExistingInstance(type: string, id: string): Entity | undefined {
    return this.entities.find(e => e.__orm.metadata.type === type && e.id === id);
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

type JoinRow = { id: number; created_at: Date } & { [column: string]: number | Entity };
