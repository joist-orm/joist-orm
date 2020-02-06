import DataLoader from "dataloader";
import Knex from "knex";
import { flushEntities } from "./EntityPersister";
import { getOrSet } from "./utils";
import { OneToManyCollection } from "./collections/OneToManyCollection";
import { ColumnSerde, keyToString } from "./serde";

export interface EntityConstructor<T> {
  new (em: EntityManager): T;
}

export interface EntityOrmField {
  metadata: EntityMetadata;
  data: Record<any, any>;
  dirty?: boolean;
  em: EntityManager;
}

export interface Entity {
  id: string | undefined;

  __orm: EntityOrmField;
}

type FilterQuery<T> = any;

export class EntityManager {
  constructor(private knex: Knex) {}

  private loaders: Record<string, DataLoader<any, any>> = {};
  private entities: Entity[] = [];

  async find<T extends Entity>(type: EntityConstructor<T>, where: FilterQuery<T>): Promise<T[]> {
    return this.loaderForEntity(type).load(1);
  }

  async load<T extends Entity>(type: EntityConstructor<T>, id: string): Promise<T> {
    return this.findExistingInstance((type as any).metadata.type, id) || this.loaderForEntity(type).load(id);
  }

  async loadCollection<T extends Entity, U extends Entity>(collection: OneToManyCollection<T, U>): Promise<U[]> {
    return this.loaderForCollection(collection).load(collection.__orm.entity.id);
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
        const meta = (type as any).metadata as EntityMetadata;

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
    const meta = collection.__orm.entity.__orm.metadata;
    const loaderName = `${meta.tableName}.${collection.__orm.fieldName}`;
    return getOrSet(this.loaders, loaderName, () => {
      return new DataLoader<string, U[]>(async keys => {
        const otherMeta = collection.__orm.otherMeta;

        const rows = await this.knex
          .select("*")
          .from(otherMeta.tableName)
          .whereIn(collection.__orm.otherColumnName, keys as string[])
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
          const ownerId = entity.__orm.data[collection.__orm.otherFieldName];
          if (ownerId === undefined) {
            throw new Error("Could not find ownerId in other entity");
          }

          getOrSet(rowsById, ownerId, []).push(entity);
        });

        return keys.map(k => rowsById[k] || []);
      });
    });
  }

  // Handles our Unit of Work-style look up / deduplication of entity instances.
  private findExistingInstance(type: string, id: string): Entity | undefined {
    return this.entities.find(e => e.__orm.metadata.type === type && e.id === id);
  }
}

export interface EntityMetadata {
  cstr: EntityConstructor<any>;
  type: string;
  tableName: string;
  // Eventually our dbType should go away to support N-column fields
  columns: Array<{ fieldName: string; columnName: string; dbType: string; serde: ColumnSerde }>;
  order: number;
}
