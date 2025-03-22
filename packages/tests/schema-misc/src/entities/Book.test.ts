import { newBook } from "@src/entities";
import { newEntityManager, queries } from "@src/setupDbTests";
import { getInstanceData } from "joist-orm";

describe("Book", () => {
  it.withCtx("can save", async () => {
    const em = newEntityManager();
    // Given we make a book
    const b = newBook(em);
    // Then we did not set any updatedAt/createdAt values
    expect(getInstanceData(b).data).toEqual({
      author: expect.anything(),
      title: "title",
    });
    // And after we flush
    await em.flush();
    expect(queries).toMatchInlineSnapshot(`
     [
       "begin ",
       "select nextval('authors_id_seq') from generate_series(1, 1) UNION ALL select nextval('book_id_seq') from generate_series(1, 1)",
       "INSERT INTO authors (id, "firstName", "lastName", "delete", "createdAt", "updatedAt") SELECT unnest(?::int[]), unnest(?::character varying[]), unnest(?::character varying[]), unnest(?::boolean[]), unnest(?::timestamp with time zone[]), unnest(?::timestamp with time zone[])",
       "INSERT INTO book (id, title, "authorId") SELECT unnest(?::int[]), unnest(?::character varying[]), unnest(?::int[])",
       "commit",
     ]
    `);
    // Then we still don't see any values
    expect(getInstanceData(b).data).toEqual({
      id: "b:1",
      author: expect.anything(),
      title: "title",
    });
  });

  it.withCtx("can update", async () => {
    const em = newEntityManager();
    // Given we make a book
    const b = newBook(em);
    await em.flush();
    // When we update it
    b.title = "title2";
    await em.flush();
  });
});
