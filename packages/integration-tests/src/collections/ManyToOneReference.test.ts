import { EntityManager } from "joist-orm";
import { knex, numberOfQueries, resetQueryCount } from "../setupDbTests";
import { Author, Book } from "../entities";

describe("ManyToOneReference", () => {
  it("can load a foreign key", async () => {
    await knex.insert({ first_name: "f" }).into("authors");
    await knex.insert({ title: "t", author_id: 1 }).into("books");

    const em = new EntityManager(knex);
    const book = await em.load(Book, "1");
    const author = await book.author.load();
    expect(author.firstName).toEqual("f");
  });

  it("can load a null foreign key", async () => {
    await knex.insert({ first_name: "f" }).into("authors");
    const em = new EntityManager(knex);
    const author = await em.load(Author, "1", "publisher");
    expect(author.publisher.get).toBeUndefined();
  });

  it("can save a foreign key", async () => {
    const em = new EntityManager(knex);
    const author = new Author(em, { firstName: "a1" });
    new Book(em, { title: "t1", author });
    await em.flush();

    const rows = await knex.select("*").from("books");
    expect(rows[0].author_id).toEqual(1);
  });

  it("batch loads foreign keys", async () => {
    await knex.insert({ first_name: "a1" }).into("authors");
    await knex.insert({ first_name: "a2" }).into("authors");
    await knex.insert({ title: "t1", author_id: 1 }).into("books");
    await knex.insert({ title: "t2", author_id: 2 }).into("books");

    const em = new EntityManager(knex);
    const [b1, b2] = await Promise.all([em.load(Book, "1"), em.load(Book, "2")]);
    resetQueryCount();
    const [a1, a2] = await Promise.all([b1.author.load(), b2.author.load()]);
    expect(a1.firstName).toEqual("a1");
    expect(a2.firstName).toEqual("a2");
    expect(numberOfQueries).toEqual(1);
  });

  it("can save changes to a foreign key", async () => {
    await knex.insert({ first_name: "a1" }).into("authors");
    await knex.insert({ first_name: "a2" }).into("authors");
    await knex.insert({ title: "b1", author_id: 1 }).into("books");

    const em = new EntityManager(knex);
    const a2 = await em.load(Author, "2");
    const b1 = await em.load(Book, "1");
    b1.author.set(a2);
    await em.flush();

    const rows = await knex.select("*").from("books");
    expect(rows[0].author_id).toEqual(2);
  });

  it("removes deleted entities from collections", async () => {
    // Given an author with a publisher
    await knex.insert({ name: "p1" }).from("publishers");
    await knex.insert({ first_name: "a1", publisher_id: 1 }).into("authors");
    const em = new EntityManager(knex);
    // And we load the author with a1.publisher already populated
    const a1 = await em.load(Author, "1", "publisher");
    const p1 = a1.publisher.get!;
    // When we delete the publisher
    em.delete(p1);
    // Then the a1.publisher field should be undefined
    expect(a1.publisher.get).toBeUndefined();
    await em.flush();
  });
});
