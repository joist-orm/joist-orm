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
       "INSERT INTO authors (id, "firstName", "lastName", "delete", "createdAt", "updatedAt") SELECT unnest(?::int[]), unnest(?::character varying[]), unnest(?::character varying[]), unnest(?::boolean[]), unnest(?::timestamp with time zone[]), unnest(?::timestamp with time zone[])",
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
       "WITH data (id, "lastName", "delete", "updatedAt", __original_updated_at) AS (VALUES (?::int, ?::character varying, ?::boolean, ?::timestamp with time zone, ?::timestamptz) ) UPDATE authors SET "lastName" = data."lastName", "delete" = data."delete", "updatedAt" = data."updatedAt" FROM data WHERE authors.id = data.id AND date_trunc('milliseconds', authors."updatedAt") = data.__original_updated_at RETURNING authors.id",
       "commit",
     ]
    `);
  });
});
