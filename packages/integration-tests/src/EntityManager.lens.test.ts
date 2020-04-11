import { EntityManager } from "joist-orm";
import { knex, numberOfQueries, resetQueryCount } from "./setupDbTests";
import { Author, Book } from "./entities";

describe("EntityManager.lens", () => {
  it("can navigate", async () => {
    await knex.insert({ name: "p1" }).into("publishers");
    await knex.insert({ first_name: "a1", publisher_id: 1 }).into("authors");
    await knex.insert({ title: "b1", author_id: 1 }).into("books");
    const em = new EntityManager(knex);
    const book = await em.load(Book, "1");
    const p1 = await book.load((b) => b.author.publisher);
    expect(p1.name).toEqual("p1");
  });

  it("can navigate with n+1 safe queries", async () => {
    await knex.insert({ name: "p1" }).into("publishers");
    await knex.insert({ name: "p2" }).into("publishers");
    await knex.insert({ first_name: "a1", publisher_id: 1 }).into("authors");
    await knex.insert({ first_name: "a2", publisher_id: 2 }).into("authors");
    await knex.insert({ title: "b1", author_id: 1 }).into("books");
    await knex.insert({ title: "b2", author_id: 2 }).into("books");
    const em = new EntityManager(knex);
    const [b1, b2] = await em.find(Book, {});
    resetQueryCount();
    const [p1, p2] = await Promise.all([b1, b2].map((book) => book.load((b) => b.author.publisher)));
    expect(p1.name).toEqual("p1");
    expect(p2.name).toEqual("p2");
    // 2 = 1 for authors, 1 for publishers
    expect(numberOfQueries).toEqual(2);
  });

  it("does not compile if lens is incorrect", async () => {
    const em = new EntityManager(knex);
    const author = em.create(Author, { firstName: "a1" });
    const book = em.create(Book, { author, title: "b1" });
    // @ts-expect-error
    await book.load((b) => b.author.foo);
    // @ts-expect-error
    await book.load((b) => b.foo);
  });
});
