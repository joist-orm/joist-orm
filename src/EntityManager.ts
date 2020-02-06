import DataLoader from "dataloader";
import Knex from "knex";
import { flushEntities } from "./EntityPersister";

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
    return this.loaderForEntity(type).load(id);
  }

  /** Registers a newly-instantiated entity with our EntityManager; only called by entity constructors. */
  register(entity: Entity): void {
    this.entities.push(entity);
  }

  markDirty(entity: Entity): void {
    entity.__orm.dirty = true;
  }

  async flush(): Promise<void> {
    await flushEntities(this.knex, this.entities);
  }

  private loaderForEntity<T extends Entity>(type: EntityConstructor<T>) {
    let loader = this.loaders[type.name];
    if (!loader) {
      loader = new DataLoader(async keys => {
        const meta = (type as any).metadata as EntityMetadata;
        const rows = await this.knex
          .select("*")
          .from(meta.tableName)
          .whereIn("id", keys as string[]);
        return rows.map(row => {
          const entity = (new meta.cstr(this) as any) as T;
          meta.columns.forEach(c => c.serde.setOnEntity(entity.__orm.data, row));
          return entity;
        });
      });
      this.loaders[type.name] = loader;
    }
    return loader;
  }
}

export interface ColumnSerde {
  setOnEntity(data: any, row: any): void;
  setOnRow(data: any, row: any): void;
  getFromEntity(data: any): any;
}

export class SimpleSerde implements ColumnSerde {
  constructor(private fieldName: string, private columnName: string) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = row[this.columnName];
  }

  setOnRow(data: any, row: any): void {
    row[this.columnName] = data[this.fieldName];
  }

  getFromEntity(data: any) {
    return data[this.fieldName];
  }
}

export class ForeignKeySerde implements ColumnSerde {
  constructor(private fieldName: string, private columnName: string) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = row[this.columnName];
  }

  setOnRow(data: any, row: any): void {
    this.maybeResolveReferenceToId(data);
    row[this.columnName] = data[this.fieldName];
  }

  getFromEntity(data: any) {
    this.maybeResolveReferenceToId(data);
    return data[this.fieldName];
  }

  // Before a referred-to object is saved, we keep its instance in our data
  // map, and then assume it will be persisted before we're asked to persist
  // ourselves, at which point we'll resolve it to an id.
  private maybeResolveReferenceToId(data: any) {
    const value = data[this.fieldName];
    if (value.id) {
      data[this.fieldName] = value.id;
    }
  }
}

export interface EntityMetadata {
  cstr: EntityConstructor<any>;
  tableName: string;
  // Eventually our dbType should go away to support N-column fields
  columns: Array<{ fieldName: string; columnName: string; dbType: string; serde: ColumnSerde }>;
  order: number;
}

