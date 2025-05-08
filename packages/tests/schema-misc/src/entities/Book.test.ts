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
       "WITH data AS ( SELECT unnest(?::int[]) as id, unnest(?::character varying[]) as "firstName", unnest(?::character varying[]) as "lastName", unnest(?::boolean[]) as "delete", unnest(?::timestamp with time zone[]) as "createdAt", unnest(?::timestamp with time zone[]) as "updatedAt" ) INSERT INTO authors (id, "firstName", "lastName", "delete", "createdAt", "updatedAt") SELECT * FROM data",
       "WITH data AS ( SELECT unnest(?::int[]) as id, unnest(?::character varying[]) as title, unnest(?::int[]) as "authorId" ) INSERT INTO book (id, title, "authorId") SELECT * FROM data",
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
