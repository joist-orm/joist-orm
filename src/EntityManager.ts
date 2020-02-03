import Knex from "knex";
import { Author } from "../integration/Author";
import { Book } from "../integration/Book";

interface EntityConstructor<T> {
  new (): T;
}

type FilterQuery<T> = any;

export class EntityManager {
  constructor(private knex: Knex) {}

  async find<T>(type: EntityConstructor<T>, where: FilterQuery<T>): Promise<T[]> {
    const meta = entityMeta[type.name];
    const rows = await this.knex.select("*").from(meta.tableName);

    return rows.map(row => {
      const t = (new meta.cstr() as any) as T;
      meta.columns.forEach(c => {
        const { fieldName, columnName } = c;
        (t as any)[fieldName] = row[columnName];
      });
      return t;
    });
  }
}

interface EntityMetadata {
  cstr: EntityConstructor<any>;
  tableName: string;
  columns: Array<{ fieldName: string; columnName: string }>;
}

const authorMeta: EntityMetadata = {
  cstr: Author,
  tableName: "authors",
  columns: [
    { fieldName: "id", columnName: "id" },
    { fieldName: "firstName", columnName: "first_name" },
  ],
};

const bookMeta: EntityMetadata = {
  cstr: Book,
  tableName: "books",
  columns: [
    { fieldName: "id", columnName: "id" },
    { fieldName: "title", columnName: "title" },
  ],
};

const entityMeta: Record<string, EntityMetadata> = {
  Author: authorMeta,
  Book: bookMeta,
};
