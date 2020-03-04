import { EntityManager, NotFoundError, TooManyError } from "joist-orm";
import { Author, Book, Publisher, PublisherId, PublisherSize } from "./entities";
import { knex } from "./setupDbTests";

describe("EntityManager.queries", () => {
  it("can find all", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ first_name: "a2" }).from("authors");
    const em = new EntityManager(knex);
    const authors = await em.find(Author, {});
    expect(authors.length).toEqual(2);
    expect(authors[0].firstName).toEqual("a1");
    expect(authors[1].firstName).toEqual("a2");
  });

  it("can find by simple varchar", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ first_name: "a2" }).from("authors");
    const em = new EntityManager(knex);
    const authors = await em.find(Author, { firstName: "a2" });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find by simple varchar not null", async () => {
    await knex.insert({ first_name: "a1", last_name: "l1" }).from("authors");
    await knex.insert({ first_name: "a2" }).from("authors");
    const em = new EntityManager(knex);
    const authors = await em.find(Author, { lastName: { $ne: null } });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a1");
  });

  it("can find by simple varchar not undefined", async () => {
    await knex.insert({ first_name: "a1", last_name: "l1" }).from("authors");
    await knex.insert({ first_name: "a2" }).from("authors");
    const em = new EntityManager(knex);
    const authors = await em.find(Author, { lastName: { $ne: undefined } });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a1");
  });

  it("can find by varchar through join", async () => {
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

  it("can find by varchar through two joins", async () => {
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

  it("can find by foreign key", async () => {
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

  it("can find by foreign key is null", async () => {
    await knex.insert({ id: 1, name: "p1" }).into("publishers");
    await knex.insert({ id: 2, first_name: "a1" }).into("authors");
    await knex.insert({ id: 3, first_name: "a2", publisher_id: 1 }).into("authors");
    const em = new EntityManager(knex);
    const authors = await em.find(Author, { publisher: null });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a1");
  });

  it("can find by foreign key is not null", async () => {
    await knex.insert({ id: 1, name: "p1" }).into("publishers");
    await knex.insert({ id: 2, first_name: "a1" }).into("authors");
    await knex.insert({ id: 3, first_name: "a2", publisher_id: 1 }).into("authors");
    const em = new EntityManager(knex);
    const authors = await em.find(Author, { publisher: { $ne: null } });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find by foreign key is not undefined", async () => {
    await knex.insert({ id: 1, name: "p1" }).into("publishers");
    await knex.insert({ id: 2, first_name: "a1" }).into("authors");
    await knex.insert({ id: 3, first_name: "a2", publisher_id: 1 }).into("authors");
    const em = new EntityManager(knex);
    const authors = await em.find(Author, { publisher: { $ne: undefined } });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find by foreign key is flavor", async () => {
    await knex.insert({ id: 1, name: "p1" }).into("publishers");
    await knex.insert({ id: 2, first_name: "a1" }).into("authors");
    await knex.insert({ id: 3, first_name: "a2", publisher_id: 1 }).into("authors");
    const em = new EntityManager(knex);
    const publisherId: PublisherId = "1";
    const authors = await em.find(Author, { publisher: publisherId });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find by foreign key is not flavor", async () => {
    await knex.insert({ id: 1, name: "p1" }).into("publishers");
    await knex.insert({ id: 2, first_name: "a1" }).into("authors");
    await knex.insert({ id: 3, first_name: "a2", publisher_id: 1 }).into("authors");
    const em = new EntityManager(knex);
    const publisherId: PublisherId = "1";
    // Technically id != 1 does not match the a1.publisher_id is null. Might fix this.
    const authors = await em.find(Author, { publisher: { $ne: publisherId } });
    expect(authors.length).toEqual(0);
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

  it("can find by foreign key using only an id", async () => {
    await knex.insert({ id: 3, first_name: "a1" }).from("authors");
    await knex.insert({ id: 4, first_name: "a2" }).from("authors");
    await knex.insert({ title: "b1", author_id: 3 }).from("books");
    await knex.insert({ title: "b2", author_id: 4 }).from("books");

    const em = new EntityManager(knex);
    const books = await em.find(Book, { author: { id: "4" } });
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

  it("can find by not equal enum", async () => {
    await knex.insert({ name: "p1", size_id: 1 }).from("publishers");
    await knex.insert({ name: "p2", size_id: 2 }).from("publishers");
    const em = new EntityManager(knex);
    const pubs = await em.find(Publisher, { size: { $ne: PublisherSize.Large } });
    expect(pubs.length).toEqual(1);
    expect(pubs[0].name).toEqual("p1");
  });

  it("can find by simple integer", async () => {
    await knex.insert({ first_name: "a1", age: 1 }).into("authors");
    await knex.insert({ first_name: "a2", age: 2 }).into("authors");
    const em = new EntityManager(knex);
    const authors = await em.find(Author, { age: 2 });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find by greater than", async () => {
    await knex.insert({ first_name: "a1", age: 1 }).into("authors");
    await knex.insert({ first_name: "a2", age: 2 }).into("authors");
    const em = new EntityManager(knex);
    const authors = await em.find(Author, { age: { $gt: 1 } });
    expect(authors.length).toEqual(1);
  });

  it("can find by greater than or equal two", async () => {
    await knex.insert({ first_name: "a1", age: 1 }).into("authors");
    await knex.insert({ first_name: "a2", age: 2 }).into("authors");
    const em = new EntityManager(knex);
    const authors = await em.find(Author, { age: { $gte: 1 } });
    expect(authors.length).toEqual(2);
  });

  it("can find by not equal", async () => {
    await knex.insert({ first_name: "a1", age: 1 }).into("authors");
    await knex.insert({ first_name: "a2", age: 2 }).into("authors");
    const em = new EntityManager(knex);
    const authors = await em.find(Author, { age: { $ne: 1 } });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find by like", async () => {
    await knex.insert({ first_name: "a1", age: 1 }).into("authors");
    await knex.insert({ first_name: "a2", age: 2 }).into("authors");
    const em = new EntityManager(knex);
    const authors = await em.find(Author, { firstName: { $like: "a%" } });
    expect(authors.length).toEqual(2);
  });

  it("can find by like and join with not equal enum", async () => {
    await knex.insert({ name: "p1", size_id: 1 }).into("publishers");
    await knex.insert({ name: "p2", size_id: 2 }).into("publishers");
    await knex.insert({ first_name: "a", publisher_id: 1 }).into("authors");
    await knex.insert({ first_name: "a", publisher_id: 2 }).into("authors");
    const em = new EntityManager(knex);
    const authors = await em.find(Author, {
      firstName: "a",
      publisher: {
        size: { $ne: PublisherSize.Large },
      },
    });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a");
  });

  it("can find by one", async () => {
    await knex.insert({ name: "p1", size_id: 1 }).into("publishers");
    const em = new EntityManager(knex);
    const publisher = await em.findOne(Publisher, { name: "p2" });
    expect(publisher).toBeUndefined();
  });

  it("can find by one or fail", async () => {
    await knex.insert({ name: "p1", size_id: 1 }).into("publishers");
    await knex.insert({ name: "p2", size_id: 2 }).into("publishers");
    const em = new EntityManager(knex);
    const publisher = await em.findOneOrFail(Publisher, { name: "p2" });
    expect(publisher.name).toEqual("p2");
  });

  it("can find by one when not found", async () => {
    await knex.insert({ name: "p1", size_id: 1 }).into("publishers");
    await knex.insert({ name: "p2", size_id: 2 }).into("publishers");
    const em = new EntityManager(knex);
    await expect(em.findOneOrFail(Publisher, { name: "p3" })).rejects.toThrow(NotFoundError);
    await expect(em.findOneOrFail(Publisher, { name: "p3" })).rejects.toThrow("Did not find Publisher for given query");
  });

  it("can find by one when too many found", async () => {
    await knex.insert({ name: "p", size_id: 1 }).into("publishers");
    await knex.insert({ name: "p", size_id: 2 }).into("publishers");
    const em = new EntityManager(knex);
    await expect(em.findOneOrFail(Publisher, { name: "p" })).rejects.toThrow(TooManyError);
    await expect(em.findOneOrFail(Publisher, { name: "p" })).rejects.toThrow(
      "Found more than one: Publisher#1, Publisher#2",
    );
  });
});
