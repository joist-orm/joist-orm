import { EntityManager } from "./EntityManager";
import { Author, Publisher, PublisherSize } from "../integration";
import { knex, numberOfQueries, resetQueryCount } from "./setupDbTests";

describe("EntityManager", () => {
  it("can load an entity", async () => {
    await knex.insert({ first_name: "f" }).from("authors");
    const em = new EntityManager(knex);
    const author = await em.load(Author, "1");
    expect(author.firstName).toEqual("f");
  });

  it("can load multiple entities with one query", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ first_name: "a2" }).from("authors");
    resetQueryCount();

    const em = new EntityManager(knex);
    const [author1, author2] = await Promise.all([em.load(Author, "1"), em.load(Author, "2")]);
    expect(author1.firstName).toEqual("a1");
    expect(author2.firstName).toEqual("a2");
    expect(numberOfQueries).toEqual(1);
  });

  it("can load multiple entities in the right order", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ first_name: "a2" }).from("authors");

    const em = new EntityManager(knex);
    const [author2, author1] = await Promise.all([em.load(Author, "2"), em.load(Author, "1")]);
    expect(author1.firstName).toEqual("a1");
    expect(author2.firstName).toEqual("a2");
  });

  it("maintains a single entity instance", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");

    const em = new EntityManager(knex);
    const author1a = await em.load(Author, "1");
    const author1b = await em.load(Author, "1");
    expect(author1a).toStrictEqual(author1b);
  });

  it("inserts a new entity", async () => {
    const em = new EntityManager(knex);
    const author = new Author(em, { firstName: "a1" });
    await em.flush();

    const rows = await knex.select("*").from("authors");
    expect(rows.length).toEqual(1);
    expect(author.id).toEqual("1");
  });

  it("inserts then updates new entity", async () => {
    const em = new EntityManager(knex);
    const author = new Author(em, { firstName: "a1" });
    await em.flush();
    author.firstName = "a2";
    await em.flush();

    const rows = await knex.select("*").from("authors");
    expect(rows.length).toEqual(1);
    expect(rows[0].first_name).toEqual("a2");
  });

  it("inserts multiple entities in bulk", async () => {
    const em = new EntityManager(knex);
    new Author(em, { firstName: "a1" });
    new Author(em, { firstName: "a2" });
    await em.flush();

    // 3 = begin, insert, commit
    expect(numberOfQueries).toEqual(3);
    const rows = await knex.select("*").from("authors");
    expect(rows.length).toEqual(2);
  });

  it("updates an entity", async () => {
    const em = new EntityManager(knex);
    const author = new Author(em, { firstName: "a1" });
    await em.flush();
    expect(author.id).toEqual("1");

    author.firstName = "a2";
    await em.flush();
    expect(author.id).toEqual("1");

    const row = (await knex.select("*").from("authors"))[0];
    expect(row["first_name"]).toEqual("a2");
  });

  it("does not update inserted-then-unchanged entities", async () => {
    const em = new EntityManager(knex);
    new Author(em, { firstName: "a1" });
    await em.flush();
    resetQueryCount();
    await em.flush();
    expect(numberOfQueries).toEqual(0);
  });

  it("does not update updated-then-unchanged entities", async () => {
    const em = new EntityManager(knex);
    const author = new Author(em, { firstName: "a1" });
    await em.flush();
    author.firstName = "a2";
    await em.flush();
    resetQueryCount();
    await em.flush();
    expect(numberOfQueries).toEqual(0);
  });

  it("createdAt / updatedAt are always non-null", async () => {
    const em = new EntityManager(knex);
    const author = em.create(Author, { firstName: "author" });
    expect(author.createdAt).not.toBeUndefined();
    expect(author.updatedAt).not.toBeUndefined();
  });

  it("createdAt does not change", async () => {
    const em = new EntityManager(knex);
    const a1 = em.create(Author, { firstName: "a1" });
    a1.firstName = "a2";
    await em.flush();

    const em2 = new EntityManager(knex);
    const a2 = await em2.load(Author, "1");
    expect(a2.createdAt).toEqual(a1.createdAt);
  });

  it("updatedAt does change", async () => {
    const em = new EntityManager(knex);
    const a1 = em.create(Author, { firstName: "a1" });
    await em.flush();

    await new Promise(resolve => setTimeout(resolve, 10));

    const em2 = new EntityManager(knex);
    const a2 = await em2.load(Author, "1");
    a2.firstName = "a2";
    await em2.flush();

    const em3 = new EntityManager(knex);
    const a3 = await em3.load(Author, "1");
    expect(a3.updatedAt).not.toEqual(a1.updatedAt);
  });

  it("can save enums", async () => {
    const em = new EntityManager(knex);
    em.create(Publisher, { name: "a1", size: PublisherSize.Large });
    await em.flush();
    const rows = await knex.select("*").from("publishers");
    expect(rows[0].size_id).toEqual(2);

    const em2 = new EntityManager(knex);
    const p2 = await em2.load(Publisher, "1");
    expect(p2.size).toEqual(PublisherSize.Large);
  });

  it("can load null enums", async () => {
    await knex.insert({ name: "p1" }).from("publishers");
    const em = new EntityManager(knex);
    const p1 = await em.load(Publisher, "1");
    expect(p1.size).toBeUndefined();
  });

  it("can delete an antity", async () => {
    await knex.insert({ name: "p1" }).from("publishers");

    const em = new EntityManager(knex);
    const p1 = await em.load(Publisher, "1");
    await em.delete(p1);
    await em.flush();

    const rows = await knex.select("*").from("publishers");
    expect(rows.length).toEqual(0);
  });

  it("cannot modify a deleted entity", async () => {
    await knex.insert({ name: "p1" }).from("publishers");

    const em = new EntityManager(knex);
    const p1 = await em.load(Publisher, "1");
    await em.delete(p1);
    expect(() => (p1.name = "p2")).toThrow("Publisher#1 is marked as deleted");
  });
});
