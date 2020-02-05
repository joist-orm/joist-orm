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

  __meta: { type: string; data: Record<any, any> };
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

  markDirty(entity: Entity): void {}

  async flush(): Promise<void> {
    const ps = Object.values(this.entities).map(async list => {
      const meta = entityMeta[list[0].__meta.type];

      const rows = list.map(entity => {
        const row = {};
        meta.columns.forEach(c => c.serde.setOnRow(entity.__meta.data, row));
        return row;
      });

      const ids = await this.knex.batchInsert(meta.tableName, rows).returning("id");
      console.log("Inserted", ids);
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
}

class SimpleSerde implements ColumnSerde {
  constructor(private fieldName: string, private columnName: string) {}

  setOnEntity(entity: any, row: any): void {
    entity[this.fieldName] = row[this.columnName];
  }

  setOnRow(entity: any, row: any): void {
    row[this.columnName] = entity[this.fieldName];
  }
}

interface EntityMetadata {
  cstr: EntityConstructor<any>;
  tableName: string;
  columns: Array<{ fieldName: string; columnName: string; serde: ColumnSerde }>;
}

const authorMeta: EntityMetadata = {
  cstr: Author,
  tableName: "authors",
  columns: [
    { fieldName: "id", columnName: "id", serde: new SimpleSerde("id", "id") },
    { fieldName: "firstName", columnName: "first_name", serde: new SimpleSerde("firstName", "first_name") },
  ],
};

const bookMeta: EntityMetadata = {
  cstr: Book,
  tableName: "books",
  columns: [
    { fieldName: "id", columnName: "id", serde: new SimpleSerde("id", "id") },
    { fieldName: "title", columnName: "title", serde: new SimpleSerde("title", "title") },
  ],
};

const entityMeta: Record<string, EntityMetadata> = {
  Author: authorMeta,
  Book: bookMeta,
};
