import { EntityManager } from "./EntityManager";
import { Author } from "../integration/Author";
import { knex, numberOfQueries, resetQueryCount } from "./setupDbTests";
import { Book } from "../integration/Book";

describe("EntityManager", () => {
  it("can load author", async () => {
    await knex.insert({ first_name: "f" }).from("authors");
    const em = new EntityManager(knex);
    const author = await em.load(Author, "1");
    expect(author.firstName).toEqual("f");
  });

  it("can load book", async () => {
    await knex.insert({ title: "f" }).from("books");
    const em = new EntityManager(knex);
    const book = await em.load(Book, "1");
    expect(book.title).toEqual("f");
  });

  it("can load multiple books with one query", async () => {
    await knex.insert({ title: "t1" }).from("books");
    await knex.insert({ title: "t2" }).from("books");
    resetQueryCount();

    const em = new EntityManager(knex);
    const [book1, book2] = await Promise.all([em.load(Book, "1"), em.load(Book, "2")]);
    expect(book1.title).toEqual("t1");
    expect(book2.title).toEqual("t2");
    expect(numberOfQueries).toEqual(1);
  });

  it("maintains a single book instance", async () => {
    await knex.insert({ title: "t1" }).from("books");

    const em = new EntityManager(knex);
    const book1a = await em.load(Book, "1");
    const book1b = await em.load(Book, "1");
    expect(book1a).toStrictEqual(book1b);
  });

  it("inserts a new book", async () => {
    const em = new EntityManager(knex);
    const book = new Book(em);
    book.title = "t1";
    await em.flush();

    const rows = await knex.select("*").from("books");
    expect(rows.length).toEqual(1);
  });

  it("inserts multiple books in bulk", async () => {
    const em = new EntityManager(knex);
    const book1 = new Book(em);
    book1.title = "t1";
    const book2 = new Book(em);
    book2.title = "t2";
    await em.flush();

    // 3 = begin, insert, commit
    expect(numberOfQueries).toEqual(3);
    const rows = await knex.select("*").from("books");
    expect(rows.length).toEqual(2);
  });

  it("updates a book", async () => {
    const em = new EntityManager(knex);
    const book = new Book(em);
    book.title = "t1";
    await em.flush();
    expect(book.id).toEqual(1);

    book.title = "t2";
    await em.flush();
    expect(book.id).toEqual(1);

    const row = (await knex.select("*").from("books"))[0];
    expect(row["title"]).toEqual("t2");
  });
});
