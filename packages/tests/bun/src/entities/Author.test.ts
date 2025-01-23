import { describe, test } from "bun:test";
import { newAuthor } from "src/entities/index.js";
import { newEntityManager } from "src/setupDbTests.js";

describe("Author", () => {
  test("works", async () => {
    const em = newEntityManager();
    newAuthor(em);
    await em.flush();
  });
});
