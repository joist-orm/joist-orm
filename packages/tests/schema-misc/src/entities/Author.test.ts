import { newAuthor } from "@src/entities";
import { newEntityManager, queries } from "@src/setupDbTests";

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
Array [
  "BEGIN;",
  "select nextval('authors_id_seq') from generate_series(1, 1)",
  "INSERT INTO \\"authors\\" (\\"id\\", \\"firstName\\", \\"lastName\\", \\"createdAt\\", \\"updatedAt\\") VALUES ($1, $2, $3, $4, $5)",
  "COMMIT;",
]
`);
  });
});
