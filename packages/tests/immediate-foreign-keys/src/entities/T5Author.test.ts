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
       "begin ",
       "select nextval('t5_authors_id_seq') from generate_series(1, 1) UNION ALL select nextval('t5_books_id_seq') from generate_series(1, 2) UNION ALL select nextval('t5_book_reviews_id_seq') from generate_series(1, 2)",
       "WITH data AS ( SELECT unnest(?::int[]) as id, unnest(?::character varying[]) as first_name ) INSERT INTO t5_authors (id, first_name) SELECT * FROM data",
       "WITH data AS ( SELECT unnest(?::int[]) as id, unnest(?::character varying[]) as title, unnest(?::int[]) as author_id ) INSERT INTO t5_books (id, title, author_id) SELECT * FROM data",
       "WITH data AS ( SELECT unnest(?::int[]) as id, unnest(?::character varying[]) as title, unnest(?::int[]) as book_id ) INSERT INTO t5_book_reviews (id, title, book_id) SELECT * FROM data",
       "commit",
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
       "begin ",
       "select nextval('t5_book_reviews_id_seq') from generate_series(1, 1) UNION ALL select nextval('t5_authors_id_seq') from generate_series(1, 1) UNION ALL select nextval('t5_books_id_seq') from generate_series(1, 1)",
       "WITH data AS ( SELECT unnest(?::int[]) as id, unnest(?::character varying[]) as first_name ) INSERT INTO t5_authors (id, first_name) SELECT * FROM data",
       "WITH data AS ( SELECT unnest(?::int[]) as id, unnest(?::character varying[]) as title, unnest(?::int[]) as author_id ) INSERT INTO t5_books (id, title, author_id) SELECT * FROM data",
       "WITH data AS ( SELECT unnest(?::int[]) as id, unnest(?::character varying[]) as title, unnest(?::int[]) as book_id ) INSERT INTO t5_book_reviews (id, title, book_id) SELECT * FROM data",
       "commit",
     ]
    `);
  });

  it("can flush prior test", () => {
    newEntityManager();
  });
});
