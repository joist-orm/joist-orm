import { describe, test } from "bun:test";
import { newEntityManager } from "../setupDbTests";
import { newBook } from "./entities.js";

describe("Book", () => {
  test("works", async () => {
    const em = newEntityManager();
    newBook(em);
    await em.flush();
  });
});
