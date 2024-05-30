import { newEntityManager, queries } from "@src/setupDbTests";
import { T5BookReview, newT5Book, newT5BookReview } from "./entities";

// T5: Three levels with 1st not-null and 2nd nullable
describe("T5Author", () => {
  it("can insert book reviews", async () => {
    const em = newEntityManager();
    newT5BookReview(em, { book: {} });
    newT5BookReview(em, { book: {} });
    await em.flush();
    expect(queries).toMatchInlineSnapshot(`
     [
       "BEGIN;",
       "select nextval('t5_authors_id_seq') from generate_series(1, 1) UNION ALL select nextval('t5_books_id_seq') from generate_series(1, 2) UNION ALL select nextval('t5_book_reviews_id_seq') from generate_series(1, 2)",
       "INSERT INTO "t5_authors" ("id", "first_name") VALUES ($1, $2)",
       "INSERT INTO "t5_books" ("id", "title", "author_id") VALUES ($1, $2, $3),($4, $5, $6)",
       "INSERT INTO "t5_book_reviews" ("id", "title", "book_id") VALUES ($1, $2, $3),($4, $5, $6)",
       "COMMIT;",
     ]
    `);
  });

  it("can insert book reviews when createPartial-d first", async () => {
    const em = newEntityManager();
    const br = em.createPartial(T5BookReview, { title: "br1" });
    br.book.set(newT5Book(em));
    await em.flush();
    expect(queries).toMatchInlineSnapshot(`
     [
       "BEGIN;",
       "select nextval('t5_book_reviews_id_seq') from generate_series(1, 1) UNION ALL select nextval('t5_authors_id_seq') from generate_series(1, 1) UNION ALL select nextval('t5_books_id_seq') from generate_series(1, 1)",
       "INSERT INTO "t5_authors" ("id", "first_name") VALUES ($1, $2)",
       "INSERT INTO "t5_books" ("id", "title", "author_id") VALUES ($1, $2, $3)",
       "INSERT INTO "t5_book_reviews" ("id", "title", "book_id") VALUES ($1, $2, $3)",
       "COMMIT;",
     ]
    `);
  });

  it("can flush prior test", () => {
    newEntityManager();
  });
});
