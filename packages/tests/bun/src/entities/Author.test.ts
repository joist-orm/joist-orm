import { describe, test } from "bun:test";
import { newEntityManager } from "../setupDbTests";
import { newAuthor } from "./entities.js";

describe("Author", () => {
  test("works", async () => {
    const em = newEntityManager();
    newAuthor(em);
    await em.flush();
  });
});
