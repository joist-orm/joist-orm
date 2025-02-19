import { describe, it } from "@jest/globals";
import { newEntityManager } from "../testEm.js";
import { newAuthor } from "./entities.js";

describe("Author", () => {
  it("works", async () => {
    const em = newEntityManager();
    newAuthor(em);
    await em.flush();
  });
});
