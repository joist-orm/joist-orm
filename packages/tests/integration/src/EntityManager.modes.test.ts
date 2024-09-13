import { expect } from "@jest/globals";
import { ReadOnlyError } from "joist-orm";
import { Author } from "src/entities";
import { insertAuthor, select } from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

describe("EntityManager.modes", () => {
  it("read-only cannot em.flush", async () => {
    const em = newEntityManager();
    em.mode = "read-only";
    await expect(em.flush()).rejects.toThrow(ReadOnlyError);
  });

  it("read-only cannot mutate entities", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    em.mode = "read-only";
    const a1 = await em.load(Author, "a:1");
    expect(() => {
      a1.firstName = "a2";
    }).toThrow(ReadOnlyError);
  });

  it("in-memory writes does not commit", async () => {
    // Given an author
    await insertAuthor({ first_name: "a1" });
    // When we change it
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    a1.firstName = "a2";
    em.mode = "in-memory-writes";
    await em.flush();
    // Then it didn't actually change
    const rows = await select("authors");
    expect(rows).toMatchObject([{ first_name: "a1" }]);
  });
});
