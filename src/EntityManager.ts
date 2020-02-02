import Knex from "knex";
import { Author } from "../integration/Author";

interface EntityConstructor<T> {
  new (): T;
}

type FilterQuery<T> = any;

export class EntityManager {
  constructor(private knex: Knex) {}

  async find<T>(type: EntityConstructor<T>, where: FilterQuery<T>): Promise<T[]> {
    console.log(type.name);

    const rows = await this.knex.select("*").from("author");
    console.log(rows);

    const results: T[] = [];

    const meta = entityMeta[type.name]!;
    rows.forEach(row => {
      const t = (new meta.cstr() as any) as T;
      meta.columns.forEach(c => {
        const { fieldName, columnName } = c;
        (t as any)[fieldName] = row[columnName];
      });
      results.push(t);
    });

    return results;
  }
}

const authorMeta = {
  cstr: Author,
  columns: [
    { fieldName: "id", columnName: "id" },
    { fieldName: "firstName", columnName: "first_name" },
  ],
};

const entityMeta: Record<string, typeof authorMeta> = {
  Author: authorMeta,
};
