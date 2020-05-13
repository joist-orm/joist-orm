import { createOrUpdateUnsafe, EntityManager } from "joist-orm";
import { knex } from "./setupDbTests";
import { Author } from "./entities";
import { insertAuthor } from "./entities/factories";

describe("EntityManager", () => {
  it("can create new entity with valid data", async () => {
    const em = new EntityManager(knex);
    const a1 = await createOrUpdateUnsafe(em, Author, null, { firstName: "a1" });
    expect(a1.firstName).toEqual("a1");
  });

  it("fails to create new entity with invalid data", async () => {
    const em = new EntityManager(knex);
    await expect(createOrUpdateUnsafe(em, Author, null, { firstName: null })).rejects.toThrow("firstName is required");
  });

  it("can update an entity with valid data", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = new EntityManager(knex);
    const a1 = await createOrUpdateUnsafe(em, Author, "1", { firstName: "a2" });
    expect(a1.firstName).toEqual("a2");
  });

  it("fails to update an entity with valid data", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = new EntityManager(knex);
    await expect(createOrUpdateUnsafe(em, Author, "1", { firstName: null })).rejects.toThrow("firstName is required");
  });
});
