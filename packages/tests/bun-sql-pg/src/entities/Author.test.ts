import { describe, expect, test } from "bun:test";
import { newAuthor } from "src/entities/index.ts";
import { newEntityManager } from "src/setupDbTests.ts";

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
