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

    rows.forEach(row => {
      const t = new Author();
      t.id = row["id"];
      t.firstName = row["first_name"];
      results.push((t as any) as T);
    });

    return results;
  }
}
