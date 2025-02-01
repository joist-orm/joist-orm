import { describe, test } from "bun:test";
import { newBook } from "src/entities/index.js";
import { newEntityManager } from "src/setupDbTests.js";

describe("Book", () => {
  test("works", async () => {
    const em = newEntityManager();
    newBook(em);
    await em.flush();
  });
});
