import { EntityManager } from "../EntityManager";
import { knex } from "../setupDbTests";
import { Book } from "../../integration/Book";
import { Author } from "../../integration/Author";

describe("relationships", () => {
  it("loads collections", async () => {
    await knex.insert({ first_name: "a1" }).into("authors");
    await knex.insert({ title: "t1", author_id: 1 }).into("books");
    await knex.insert({ title: "t2", author_id: 1 }).into("books");

    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");
    const books = await a1.books.load();
    expect(books.length).toEqual(2);
  });

  it("loads collections with instances already in the UoW", async () => {
    await knex.insert({ first_name: "a1" }).into("authors");
    await knex.insert({ title: "t1", author_id: 1 }).into("books");
    await knex.insert({ title: "t2", author_id: 1 }).into("books");

    const em = new EntityManager(knex);
    const t1 = await em.load(Book, "1");
    const a1 = await em.load(Author, "1");
    const books = await a1.books.load();
    expect(books[0] === t1).toEqual(true);
  });

  it("references use collection-loaded instances from the UoW", async () => {
    await knex.insert({ first_name: "a1" }).into("authors");
    await knex.insert({ title: "t1", author_id: 1 }).into("books");
    await knex.insert({ title: "t2", author_id: 1 }).into("books");

    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");
    const books = await a1.books.load();
    // Pretend this is a reference
    const t1 = await em.load(Book, "1");
    expect(books[0] === t1).toEqual(true);
  });
});
