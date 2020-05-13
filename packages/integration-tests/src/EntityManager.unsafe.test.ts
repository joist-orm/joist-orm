import { EntityManager } from "joist-orm";
import { knex } from "./setupDbTests";
import { Author } from "./entities";
import { insertAuthor } from "./entities/factories";

describe("EntityManager", () => {
  it("can create new entity with valid data", async () => {
    const em = new EntityManager(knex);
    const a1 = await em.createOrUpdateUnsafe(Author, { firstName: "a1" });
    expect(a1.firstName).toEqual("a1");
  });

  it("fails to create new entity with invalid data", async () => {
    const em = new EntityManager(knex);
    await expect(em.createOrUpdateUnsafe(Author, { id: null, firstName: null })).rejects.toThrow(
      "firstName is required",
    );
  });

  it("can update an entity with valid data", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = new EntityManager(knex);
    const a1 = await em.createOrUpdateUnsafe(Author, { id: "1", firstName: "a2" });
    expect(a1.firstName).toEqual("a2");
  });

  it("fails to update an entity with valid data", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = new EntityManager(knex);
    await expect(em.createOrUpdateUnsafe(Author, { id: "1", firstName: null })).rejects.toThrow(
      "firstName is required",
    );
  });

  it("can create new children with valid data", async () => {
    const em = new EntityManager(knex);
    const a1 = await em.createOrUpdateUnsafe(Author, {
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
    const a1 = await em.createOrUpdateUnsafe(Author, {
      firstName: "a1",
      mentor: { id: "1", firstName: "m2" },
    });
    expect(a1.firstName).toEqual("a1");
    expect((await a1.mentor.load())!.firstName).toEqual("m2");
    await em.flush();
    expect((await knex.count().from("authors"))[0]).toEqual({ count: "2" });
  });
});
