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
       "BEGIN;",
       "select nextval('authors_id_seq') from generate_series(1, 1)",
       "WITH data AS (SELECT unnest($1::int[]) as id, unnest($2::character varying[]) as "firstName", unnest($3::character varying[]) as "lastName", unnest($4::boolean[]) as "delete", unnest($5::timestamp with time zone[]) as "createdAt", unnest($6::timestamp with time zone[]) as "updatedAt") INSERT INTO authors (id, "firstName", "lastName", "delete", "createdAt", "updatedAt") SELECT * FROM data",
       "COMMIT;",
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
       "BEGIN;",
       "WITH data AS (SELECT unnest($1::int[]) as id, unnest($2::character varying[]) as "lastName", unnest($3::boolean[]) as "delete", unnest($4::timestamp with time zone[]) as "updatedAt", unnest($5::timestamptz[]) as __original_updated_at) UPDATE authors SET "lastName" = data."lastName", "delete" = data."delete", "updatedAt" = data."updatedAt" FROM data WHERE authors.id = data.id AND date_trunc('milliseconds', authors."updatedAt") = data.__original_updated_at RETURNING authors.id",
       "COMMIT;",
     ]
    `);
  });
});
