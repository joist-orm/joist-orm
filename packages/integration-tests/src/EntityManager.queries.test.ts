import { EntityManager } from "joist-orm";
import { Author, Book, Publisher, PublisherSize } from "./entities";
import { knex } from "./setupDbTests";

describe("EntityManager.queries", () => {
  it("can find all authors", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ first_name: "a2" }).from("authors");
    const em = new EntityManager(knex);
    const authors = await em.find(Author, {});
    expect(authors.length).toEqual(2);
    expect(authors[0].firstName).toEqual("a1");
    expect(authors[1].firstName).toEqual("a2");
  });

  it("can find an author by name", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ first_name: "a2" }).from("authors");
    const em = new EntityManager(knex);
    const authors = await em.find(Author, { firstName: "a2" });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find books by author name", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ first_name: "a2" }).from("authors");
    await knex.insert({ title: "b1", author_id: 1 }).from("books");
    await knex.insert({ title: "b2", author_id: 2 }).from("books");
    await knex.insert({ title: "b3", author_id: 2 }).from("books");

    const em = new EntityManager(knex);
    const books = await em.find(Book, { author: { firstName: "a2" } });
    expect(books.length).toEqual(2);
    expect(books[0].title).toEqual("b2");
    expect(books[1].title).toEqual("b3");
  });

  it("can find books by publisher name", async () => {
    await knex.insert({ name: "p1" }).from("publishers");
    await knex.insert({ name: "p2" }).from("publishers");
    await knex.insert({ first_name: "a1", publisher_id: 1 }).from("authors");
    await knex.insert({ first_name: "a2", publisher_id: 2 }).from("authors");
    await knex.insert({ title: "b1", author_id: 1 }).from("books");
    await knex.insert({ title: "b2", author_id: 2 }).from("books");

    const em = new EntityManager(knex);
    const books = await em.find(Book, { author: { publisher: { name: "p2" } } });
    expect(books.length).toEqual(1);
    expect(books[0].title).toEqual("b2");
  });

  it("can find books by author", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ first_name: "a2" }).from("authors");
    await knex.insert({ title: "b1", author_id: 1 }).from("books");
    await knex.insert({ title: "b2", author_id: 2 }).from("books");

    const em = new EntityManager(knex);
    const a2 = await em.load(Author, "2");
    // This is different from the next test case b/c Publisher does not currently have any References
    const books = await em.find(Book, { author: a2 });
    expect(books.length).toEqual(1);
    expect(books[0].title).toEqual("b2");
  });

  it("can find books by publisher", async () => {
    await knex.insert({ name: "p1" }).from("publishers");
    await knex.insert({ name: "p2" }).from("publishers");
    await knex.insert({ first_name: "a1", publisher_id: 1 }).from("authors");
    await knex.insert({ first_name: "a2", publisher_id: 2 }).from("authors");
    await knex.insert({ title: "b1", author_id: 1 }).from("books");
    await knex.insert({ title: "b2", author_id: 2 }).from("books");

    const em = new EntityManager(knex);
    const publisher = await em.load(Publisher, "2");
    const books = await em.find(Book, { author: { publisher } });
    expect(books.length).toEqual(1);
    expect(books[0].title).toEqual("b2");
  });

  it("can find by enums", async () => {
    await knex.insert({ name: "p1", size_id: 1 }).from("publishers");
    await knex.insert({ name: "p2", size_id: 2 }).from("publishers");

    const em = new EntityManager(knex);
    const pubs = await em.find(Publisher, { size: PublisherSize.Large });
    expect(pubs.length).toEqual(1);
    expect(pubs[0].name).toEqual("p2");
  });
});
