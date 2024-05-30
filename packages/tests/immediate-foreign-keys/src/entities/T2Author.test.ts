import { newEntityManager, queries, select } from "@src/setupDbTests";
import { newT2Author, newT2Book } from "./entities";

// T1: Author.favorite_book_id is a nullable cycle
describe("T2Author", () => {
  it("can insert author without a favorite book", async () => {
    const em = newEntityManager();
    const b = newT2Book(em);
    expect(b.author.get.favoriteBook.get).toBeUndefined();
    await em.flush();
    expect(queries).toEqual([
      `BEGIN;`,
      `select nextval('t2_authors_id_seq') from generate_series(1, 1) UNION ALL select nextval('t2_books_id_seq') from generate_series(1, 1)`,
      `INSERT INTO "t2_authors" ("id", "first_name", \"favorite_book_id") VALUES ($1, $2, $3)`,
      `INSERT INTO "t2_books" ("id", "title", "author_id") VALUES ($1, $2, $3)`,
      `COMMIT;`,
    ]);
  });

  it("can insert author with a favorite book and issue fixup UPDATEs", async () => {
    const em = newEntityManager();

    const [a1, a2] = [newT2Author(em), newT2Author(em)];
    const [b1, b2] = [a1, a2].map((a) => newT2Book(em, { author: a }));
    a1.favoriteBook.set(b1);
    a2.favoriteBook.set(b2);

    await em.flush();
    expect(queries).toEqual([
      `BEGIN;`,
      `select nextval('t2_authors_id_seq') from generate_series(1, 2) UNION ALL select nextval('t2_books_id_seq') from generate_series(1, 2)`,
      `INSERT INTO "t2_authors" ("id", "first_name", \"favorite_book_id") VALUES ($1, $2, $3),($4, $5, $6)`,
      `INSERT INTO "t2_books" ("id", "title", "author_id") VALUES ($1, $2, $3),($4, $5, $6)`,
      `WITH data (id, favorite_book_id) AS (VALUES ($1::int, $2::int), ($3, $4) ) UPDATE t2_authors SET favorite_book_id = data.favorite_book_id FROM data WHERE t2_authors.id = data.id RETURNING t2_authors.id`,
      `COMMIT;`,
    ]);
    const rows = await select("t2_authors");
    expect(rows[0].favorite_book_id).toBe(1);
    expect(rows[1].favorite_book_id).toBe(2);
  });

  it("can flush prior test", () => {
    newEntityManager();
  });
});
