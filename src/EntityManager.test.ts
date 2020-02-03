import { EntityManager } from "./EntityManager";
import { Author } from "../integration/Author";
import { knex } from "./setupDbTests";
import { Book } from "../integration/Book";

describe("EntityManager", () => {
  it("can find authors", async () => {
    await knex.insert({ first_name: "f" }).from("authors");
    const em = new EntityManager(knex);
    const authors = await em.find(Author, { id: 1 });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("f");
  });

  it("can find books", async () => {
    await knex.insert({ title: "f" }).from("books");
    const em = new EntityManager(knex);
    const books = await em.find(Book, { id: 1 });
    expect(books.length).toEqual(1);
    expect(books[0].title).toEqual("f");
  });
});
