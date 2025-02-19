import { describe, expect, test } from "bun:test";
import { newAuthor } from "src/entities/index.ts";
import { newEntityManager, sql } from "src/setupDbTests.ts";

describe.skip("Author", () => {
  test("unnest", async () => {
    console.log(await sql`select unnest(${[1, 2]}::int[])`);
  });

  test.skip("works", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    await em.flush();
    expect(a).toMatchEntity({
      firstName: "firstName",
    });
  });
});
