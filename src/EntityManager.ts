import DataLoader from "dataloader";
import Knex from "knex";
import { getOrSet } from "./utils";

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
  id: string;

  __orm: EntityOrmField;
}

type FilterQuery<T> = any;

export class EntityManager {
  constructor(private knex: Knex) {}

  private loaders: Record<string, DataLoader<any, any>> = {};
  private entities: Record<string, Entity[]> = {};

  async find<T extends Entity>(type: EntityConstructor<T>, where: FilterQuery<T>): Promise<T[]> {
    return this.loaderForEntity(type).load(1);
  }

  async load<T extends Entity>(type: EntityConstructor<T>, id: string): Promise<T> {
    return this.loaderForEntity(type).load(id);
  }

  register(entity: Entity): void {
    const list = getOrSet(this.entities, entity.__orm.metadata.tableName, []);
    list.push(entity);
  }

  markDirty(entity: Entity): void {
    entity.__orm.dirty = true;
  }

  async flush(): Promise<void> {
    const ps = Object.values(this.entities).map(async list => {
      const meta = list[0].__orm.metadata;

      const newEntities: Entity[] = [];
      const updateEntities: Entity[] = [];

      list.forEach(entity => {
        if (!entity.__orm.data["id"]) {
          newEntities.push(entity);
        } else if (entity.__orm.dirty) {
          updateEntities.push(entity);
        }
      });

      // Do a batch insert
      if (newEntities.length > 0) {
        const rows = newEntities.map(entity => {
          const row = {};
          meta.columns.forEach(c => c.serde.setOnRow(entity.__orm.data, row));
          return row;
        });
        const ids = await this.knex.batchInsert(meta.tableName, rows).returning("id");
        for (let i = 0; i < newEntities.length; i++) {
          list[i].__orm.data["id"] = ids[i];
        }
        console.log("Inserted", ids);
      }

      // Do a batch update
      if (updateEntities.length > 0) {
        const bindings: any[][] = meta.columns.map(() => []);
        for (const entity of updateEntities) {
          meta.columns.forEach((c, i) => bindings[i].push(c.serde.getFromEntity(entity)));
        }
        // Use a pg-specific syntax to issue a bulk update
        await this.knex.raw(
          cleanSql(`
            UPDATE ${meta.tableName}
            SET ${meta.columns.map(c => `${c.columnName} = data.${c.columnName}`).join(", ")}
            FROM (select ${meta.columns.map(c => `unnest(?::${c.dbType}[]) as ${c.columnName}`).join(", ")}) as data
            WHERE ${meta.tableName}.id = data.id
        `),
          bindings,
        );
      }
    });
    await Promise.all(ps);
  }

  private loaderForEntity<T extends Entity>(type: EntityConstructor<T>) {
    let loader = this.loaders[type.name];
    if (!loader) {
      loader = new DataLoader(async keys => {
        const meta = (type as any).metadata as EntityMetadata;
        const rows = await this.knex.select("*").from(meta.tableName);
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
  setOnEntity(entity: any, row: any): void;
  setOnRow(entity: any, row: any): void;
  getFromEntity(entity: any): any;
}

export class SimpleSerde implements ColumnSerde {
  constructor(private fieldName: string, private columnName: string) {}

  setOnEntity(entity: any, row: any): void {
    entity[this.fieldName] = row[this.columnName];
  }

  setOnRow(entity: any, row: any): void {
    row[this.columnName] = entity[this.fieldName];
  }

  getFromEntity(entity: any) {
    return entity[this.fieldName];
  }
}

export interface EntityMetadata {
  cstr: EntityConstructor<any>;
  tableName: string;
  // Eventually our dbType should go away to support N-column fields
  columns: Array<{ fieldName: string; columnName: string; dbType: string; serde: ColumnSerde }>;
}

function cleanSql(sql: string): string {
  return sql
    .trim()
    .replace("\n", "")
    .replace(/  +/, " ");
}
