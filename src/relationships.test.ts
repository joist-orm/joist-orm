import { EntityManager } from "./EntityManager";
import { knex } from "./setupDbTests";
import { Book } from "../integration/Book";
import { Author } from "../integration/Author";

describe("relationships", () => {
  it("can load a foreign key", async () => {
    await knex.insert({ first_name: "f" }).into("authors");
    await knex.insert({ title: "t", author_id: 1 }).into("books");

    const em = new EntityManager(knex);
    const book = await em.load(Book, "1");
    const author = await book.author.load();
    expect(author.firstName).toEqual("f");
  });

  it("can save a foreign key", async () => {
    const em = new EntityManager(knex);
    const author = new Author(em);
    author.firstName = "a1";
    const book = new Book(em);
    book.author.set(author);
    await em.flush();

    const rows = await knex.select("*").from("books");
    expect(rows[0].author_id).toEqual(1);
  });
});
