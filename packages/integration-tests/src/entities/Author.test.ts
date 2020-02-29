import { EntityManager } from "joist-orm";
import { knex } from "../setupDbTests";
import { Author } from "../entities";

describe("Author", () => {
  it("can have business logic methods", async () => {
    await knex.insert({ first_name: "a1" }).into("authors");
    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");
    const books = await a1.books.load();
    expect(books.length).toEqual(0);
  });
});
