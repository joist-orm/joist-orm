import { EntityManager } from "joist-orm";
import { knex } from "./setupDbTests";
import { Author, Book } from "./entities";
import { insertAuthor, insertBook } from "@src/entities/inserts";

describe("EntityManager", () => {
  it("can create new entity with valid data", async () => {
    const em = new EntityManager(knex);
    const a1 = await em.createOrUpdatePartial(Author, { firstName: "a1" });
    expect(a1.firstName).toEqual("a1");
  });

  it("fails to create new entity with invalid data", async () => {
    const em = new EntityManager(knex);
    await expect(em.createOrUpdatePartial(Author, { id: null, firstName: null })).rejects.toThrow(
      "firstName is required",
    );
  });

  it("can update an entity with valid data", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = new EntityManager(knex);
    const a1 = await em.createOrUpdatePartial(Author, { id: "1", firstName: "a2" });
    expect(a1.firstName).toEqual("a2");
  });

  it("fails to update an entity with valid data", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = new EntityManager(knex);
    await expect(em.createOrUpdatePartial(Author, { id: "1", firstName: null })).rejects.toThrow(
      "firstName is required",
    );
  });

  it("can create new children with valid data", async () => {
    const em = new EntityManager(knex);
    const a1 = await em.createOrUpdatePartial(Author, {
      firstName: "a1",
      mentor: { firstName: "m1" },
      books: [{ title: "b1" }],
    });
    expect(a1.firstName).toEqual("a1");
    expect((await a1.mentor.load())!.firstName).toEqual("m1");
    expect((await a1.books.load())![0].title).toEqual("b1");
  });

  it("can update existing references with valid data", async () => {
    await insertAuthor({ first_name: "m1" });
    const em = new EntityManager(knex);
    const a1 = await em.createOrUpdatePartial(Author, {
      firstName: "a1",
      mentor: { id: "1", firstName: "m2" },
    });
    expect(a1.firstName).toEqual("a1");
    expect((await a1.mentor.load())!.firstName).toEqual("m2");
    await em.flush();
    expect((await knex.count().from("authors"))[0]).toEqual({ count: "2" });
  });

  it("references can refer to entities by id", async () => {
    await insertAuthor({ first_name: "m1" });
    const em = new EntityManager(knex);
    const a1 = await em.createOrUpdatePartial(Author, { firstName: "a1", mentor: "1" });
    expect((await a1.mentor.load())!.firstName).toEqual("m1");
  });

  it("references can refer to null", async () => {
    await insertAuthor({ first_name: "m1" });
    const em = new EntityManager(knex);
    const a1 = await em.createOrUpdatePartial(Author, { firstName: "a1", mentor: null });
    expect(a1.mentor.isSet).toBeFalsy();
  });

  it("references can refer to undefined", async () => {
    await insertAuthor({ first_name: "m1" });
    const em = new EntityManager(knex);
    const a1 = await em.createOrUpdatePartial(Author, { firstName: "a1", mentor: undefined });
    expect(a1.mentor.isSet).toBeFalsy();
  });

  it("references can refer to entity", async () => {
    await insertAuthor({ first_name: "m1" });
    const em = new EntityManager(knex);
    const a1 = await em.createOrUpdatePartial(Author, { firstName: "a1", mentor: await em.load(Author, "1") });
    expect(a1.mentor.id).toEqual("a:1");
  });

  it("collections can refer to entities by id", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = new EntityManager(knex);
    const a1 = await em.createOrUpdatePartial(Author, { firstName: "a2", books: ["1"] });
    expect((await a1.books.load())[0].title).toEqual("b1");
  });

  it("collections can refer to null", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = new EntityManager(knex);
    const a1 = await em.createOrUpdatePartial(Author, { firstName: "a2", books: null });
    expect(await a1.books.load()).toEqual([]);
  });

  it("collections can refer to undefined", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = new EntityManager(knex);
    const a1 = await em.createOrUpdatePartial(Author, { firstName: "a2", books: undefined });
    expect(await a1.books.load()).toEqual([]);
  });

  it("collections can refer to entities", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = new EntityManager(knex);
    const a1 = await em.createOrUpdatePartial(Author, { firstName: "a2", books: [await em.load(Book, "1")] });
    expect((await a1.books.load())[0].title).toEqual("b1");
  });
});
