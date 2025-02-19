import { newEntityManager, queries, select } from "@src/setupDbTests";
import { newT2Author, newT2Book } from "./entities";

// T1: Author.favorite_book_id is a nullable cycle
describe("T2Author", () => {
  it("can insert author without a favorite book", async () => {
    const em = newEntityManager();
    const b = newT2Book(em);
    expect(b.author.get.favoriteBook.get).toBeUndefined();
    await em.flush();
    expect(queries).toMatchInlineSnapshot(`
     [
       "begin ",
       "select nextval('t2_authors_id_seq') from generate_series(1, 1) UNION ALL select nextval('t2_books_id_seq') from generate_series(1, 1)",
       "WITH data AS ( SELECT unnest(?::int[]) as id, unnest(?::character varying[]) as first_name, unnest(?::int[]) as favorite_book_id ) INSERT INTO t2_authors (id, first_name, favorite_book_id) SELECT * FROM data",
       "WITH data AS ( SELECT unnest(?::int[]) as id, unnest(?::character varying[]) as title, unnest(?::int[]) as author_id ) INSERT INTO t2_books (id, title, author_id) SELECT * FROM data",
       "commit",
     ]
    `);
  });

  it("can insert author with a favorite book and issue fixup UPDATEs", async () => {
    const em = newEntityManager();

    const [a1, a2] = [newT2Author(em), newT2Author(em)];
    const [b1, b2] = [a1, a2].map((a) => newT2Book(em, { author: a }));
    a1.favoriteBook.set(b1);
    a2.favoriteBook.set(b2);

    await em.flush();
    expect(queries).toMatchInlineSnapshot(`
     [
       "begin ",
       "select nextval('t2_authors_id_seq') from generate_series(1, 2) UNION ALL select nextval('t2_books_id_seq') from generate_series(1, 2)",
       "WITH data AS ( SELECT unnest(?::int[]) as id, unnest(?::character varying[]) as first_name, unnest(?::int[]) as favorite_book_id ) INSERT INTO t2_authors (id, first_name, favorite_book_id) SELECT * FROM data",
       "WITH data AS ( SELECT unnest(?::int[]) as id, unnest(?::character varying[]) as title, unnest(?::int[]) as author_id ) INSERT INTO t2_books (id, title, author_id) SELECT * FROM data",
       "WITH data AS ( SELECT unnest(?::int[]) as id, unnest(?::int[]) as favorite_book_id ) UPDATE t2_authors SET favorite_book_id = data.favorite_book_id FROM data WHERE t2_authors.id = data.id RETURNING t2_authors.id",
       "commit",
     ]
    `);
    const rows = await select("t2_authors");
    expect(rows[0].favorite_book_id).toBe(1);
    expect(rows[1].favorite_book_id).toBe(2);
  });

  it("can flush prior test", () => {
    newEntityManager();
  });
});
