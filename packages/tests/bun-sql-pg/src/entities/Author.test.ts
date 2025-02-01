import { describe, expect, test } from "@jest/globals";
import { newAuthor } from "src/entities/index.js";
import { newEntityManager } from "src/setupDbTests.js";

describe("Author", () => {
  test("works", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    await em.flush();
    expect(a).toMatchEntity({
      firstName: "firstName",
    });
  });
});
