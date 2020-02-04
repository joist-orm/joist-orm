import DataLoader from "dataloader";
import Knex from "knex";
import { Author } from "../integration/Author";
import { Book } from "../integration/Book";

interface EntityConstructor<T> {
  new (): T;
}

type FilterQuery<T> = any;

type Key = { Entity: string; where: number };

export class EntityManager {
  constructor(private knex: Knex) {}

  private loaders: Record<string, DataLoader<any, any>> = {};

  async find<T>(type: EntityConstructor<T>, where: FilterQuery<T>): Promise<T[]> {
    return this.loaderForEntity(type).load(1);
  }

  async load<T>(type: EntityConstructor<T>, id: string): Promise<T> {
    return this.loaderForEntity(type).load(id);
  }

  private loaderForEntity<T>(type: EntityConstructor<T>) {
    let loader = this.loaders[type.name];
    if (!loader) {
      loader = new DataLoader(async keys => {
        const meta = entityMeta[type.name];
        const rows = await this.knex.select("*").from(meta.tableName);
        return rows.map(row => {
          const t = (new meta.cstr() as any) as T;
          meta.columns.forEach(c => c.serde.set(t, row));
          return t;
        });
      });
      this.loaders[type.name] = loader;
    }
    return loader;
  }
}

interface ColumnSerde {
  set(entity: any, row: any): void;
}

class SimpleSerde implements ColumnSerde {
  constructor(private fieldName: string, private columnName: string) {}

  set(entity: any, row: any): void {
    entity[this.fieldName] = row[this.columnName];
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
