import { newEntityManager, queries } from "@src/setupDbTests";
import { newT1Book } from "./entities";

// T1: no cycles, t1_books.author_id is nullable
describe("T1Author", () => {
  it("can insert author then book", async () => {
    const em = newEntityManager();
    newT1Book(em);
    await em.flush();
    expect(queries).toEqual([
      `BEGIN;`,
      `select nextval('t1_authors_id_seq') from generate_series(1, 1) UNION ALL select nextval('t1_books_id_seq') from generate_series(1, 1)`,
      `INSERT INTO "t1_authors" ("id", "first_name") VALUES ($1, $2)`,
      `INSERT INTO "t1_books" ("id", "title", "author_id") VALUES ($1, $2, $3)`,
      `COMMIT;`,
    ]);
  });

  it("can flush prior test", () => {
    newEntityManager();
  });
});
