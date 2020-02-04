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
});
