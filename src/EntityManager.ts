import DataLoader from "dataloader";
import Knex from "knex";
import { Author } from "../integration/Author";
import { Book } from "../integration/Book";
import { getOrSet } from "./utils";

interface EntityConstructor<T> {
  new (em: EntityManager): T;
}

interface Entity {
  id: string;

  __meta: { type: string; data: Record<any, any>; dirty?: boolean };
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
    const list = getOrSet(this.entities, entity.__meta.type, []);
    list.push(entity);
  }

  markDirty(entity: Entity): void {
    entity.__meta.dirty = true;
  }

  async flush(): Promise<void> {
    const ps = Object.values(this.entities).map(async list => {
      const meta = entityMeta[list[0].__meta.type];

      const newEntities: Entity[] = [];
      const updateEntities: Entity[] = [];

      list.forEach(entity => {
        if (!entity.__meta.data["id"]) {
          newEntities.push(entity);
        } else if (entity.__meta.dirty) {
          updateEntities.push(entity);
        }
      });

      // Do a batch insert
      if (newEntities.length > 0) {
        const rows = newEntities.map(entity => {
          const row = {};
          meta.columns.forEach(c => c.serde.setOnRow(entity.__meta.data, row));
          return row;
        });
        const ids = await this.knex.batchInsert(meta.tableName, rows).returning("id");
        for (let i = 0; i < newEntities.length; i++) {
          list[i].__meta.data["id"] = ids[i];
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
        await this.knex.raw(cleanSql(`
          UPDATE ${meta.tableName}
          SET ${meta.columns.map(c => `${c.fieldName} = data.${c.fieldName}`).join(", ")}
          FROM (select ${meta.columns.map(c => `unnest(?::${c.dbType}[]) as ${c.fieldName}`).join(", ")}) as data
          WHERE ${meta.tableName}.id = data.id
        `), bindings);
      }
    });
    await Promise.all(ps);
  }

  private loaderForEntity<T extends Entity>(type: EntityConstructor<T>) {
    let loader = this.loaders[type.name];
    if (!loader) {
      loader = new DataLoader(async keys => {
        const meta = entityMeta[type.name];
        const rows = await this.knex.select("*").from(meta.tableName);
        return rows.map(row => {
          const entity = (new meta.cstr(this) as any) as T;
          meta.columns.forEach(c => c.serde.setOnEntity(entity.__meta.data, row));
          return entity;
        });
      });
      this.loaders[type.name] = loader;
    }
    return loader;
  }
}

interface ColumnSerde {
  setOnEntity(entity: any, row: any): void;
  setOnRow(entity: any, row: any): void;
  getFromEntity(entity: any): any;
}

class SimpleSerde implements ColumnSerde {
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

interface EntityMetadata {
  cstr: EntityConstructor<any>;
  tableName: string;
  // Eventually our dbType should go away to support N-column fields
  columns: Array<{ fieldName: string; columnName: string; dbType: string; serde: ColumnSerde }>;
}

const authorMeta: EntityMetadata = {
  cstr: Author,
  tableName: "authors",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new SimpleSerde("id", "id") },
    { fieldName: "firstName", columnName: "first_name", dbType: "varchar", serde: new SimpleSerde("firstName", "first_name") },
  ],
};

const bookMeta: EntityMetadata = {
  cstr: Book,
  tableName: "books",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new SimpleSerde("id", "id") },
    { fieldName: "title", columnName: "title", dbType: "varchar", serde: new SimpleSerde("title", "title") },
  ],
};

const entityMeta: Record<string, EntityMetadata> = {
  Author: authorMeta,
  Book: bookMeta,
};

function cleanSql(sql: string): string {
  return sql.trim().replace("\n", "").replace(/  +/, " ");
}
