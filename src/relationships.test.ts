import { EntityManager } from "./EntityManager";
import { knex } from "./setupDbTests";
import { Book } from "../integration/Book";

describe("relationships", () => {
  it("can load a foreign key", async () => {
    await knex.insert({ first_name: "f" }).into("authors");
    await knex.insert({ title: "t", author_id: 1 }).into("books");

    const em = new EntityManager(knex);
    const book = await em.load(Book, "1");
    const author = await book.author.load();
    expect(author.firstName).toEqual("f");
  });
});
