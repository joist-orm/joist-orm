import { EntityManager } from "./EntityManager";
import { Author } from "../integration/Author";
import { knex, numberOfQueries, resetQueryCount } from "./setupDbTests";

describe("EntityManager", () => {
  it("can load author", async () => {
    await knex.insert({ first_name: "f" }).from("authors");
    const em = new EntityManager(knex);
    const author = await em.load(Author, "1");
    expect(author.firstName).toEqual("f");
  });

  it("can load multiple authors with one query", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ first_name: "a2" }).from("authors");
    resetQueryCount();

    const em = new EntityManager(knex);
    const [author1, author2] = await Promise.all([em.load(Author, "1"), em.load(Author, "2")]);
    expect(author1.firstName).toEqual("a1");
    expect(author2.firstName).toEqual("a2");
    expect(numberOfQueries).toEqual(1);
  });

  it("maintains a single author instance", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");

    const em = new EntityManager(knex);
    const author1a = await em.load(Author, "1");
    const author1b = await em.load(Author, "1");
    expect(author1a).toStrictEqual(author1b);
  });

  it("inserts a new author", async () => {
    const em = new EntityManager(knex);
    const author = new Author(em);
    author.firstName = "a1";
    await em.flush();

    const rows = await knex.select("*").from("authors");
    expect(rows.length).toEqual(1);
  });

  it("inserts multiple authors in bulk", async () => {
    const em = new EntityManager(knex);
    const author1 = new Author(em);
    author1.firstName = "a1";
    const author2 = new Author(em);
    author2.firstName = "a2";
    await em.flush();

    // 3 = begin, insert, commit
    expect(numberOfQueries).toEqual(3);
    const rows = await knex.select("*").from("authors");
    expect(rows.length).toEqual(2);
  });

  it("updates an author", async () => {
    const em = new EntityManager(knex);
    const author = new Author(em);
    author.firstName = "a1";
    await em.flush();
    expect(author.id).toEqual(1);

    author.firstName = "a2";
    await em.flush();
    expect(author.id).toEqual(1);

    const row = (await knex.select("*").from("authors"))[0];
    expect(row["first_name"]).toEqual("a2");
  });
});
