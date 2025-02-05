import { describe, test } from "bun:test";
import { newBook } from "src/entities/index.ts";
import { newEntityManager } from "src/setupDbTests.ts";

describe("Book", () => {
  test("works", async () => {
    const em = newEntityManager();
    newBook(em);
    await em.flush();
  });
});
