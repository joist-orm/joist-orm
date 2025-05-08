import { newAuthor } from "@src/entities";
import { newEntityManager, queries, resetQueryCount } from "@src/setupDbTests";

describe("Author", () => {
  it.withCtx("can save", async () => {
    const em = newEntityManager();
    // Given we create an author
    const a = newAuthor(em);
    // Then we auto-set the createdAt and updatedAt
    expect(a.createdAt).toBeDefined();
    expect(a.updatedAt).toBeDefined();
    // And when we flush
    await em.flush();
    // Then we generate an insert
    expect(queries).toMatchInlineSnapshot(`
     [
       "begin ",
       "select nextval('authors_id_seq') from generate_series(1, 1)",
       "WITH data AS ( SELECT unnest(?::int[]) as id, unnest(?::character varying[]) as "firstName", unnest(?::character varying[]) as "lastName", unnest(?::boolean[]) as "delete", unnest(?::timestamp with time zone[]) as "createdAt", unnest(?::timestamp with time zone[]) as "updatedAt" ) INSERT INTO authors (id, "firstName", "lastName", "delete", "createdAt", "updatedAt") SELECT * FROM data",
       "commit",
     ]
    `);

    // And when we update it
    resetQueryCount();
    a.lastName = "updated";
    a.delete = true;
    await em.flush();
    // Then we issued a valid SQL update
    expect(queries).toMatchInlineSnapshot(`
     [
       "begin ",
       "WITH data AS ( SELECT unnest(?::int[]) as id, unnest(?::character varying[]) as "lastName", unnest(?::boolean[]) as "delete", unnest(?::timestamp with time zone[]) as "updatedAt", unnest(?::timestamptz[]) as __original_updated_at ) UPDATE authors SET "lastName" = data."lastName", "delete" = data."delete", "updatedAt" = data."updatedAt" FROM data WHERE authors.id = data.id AND date_trunc('milliseconds', authors."updatedAt") = data.__original_updated_at RETURNING authors.id",
       "commit",
     ]
    `);
  });
});
