import { loadPgMetadata } from "joist-codegen/pgMetadata";
import { newPgConnectionConfig } from "joist-utils";
import { Client } from "pg";

describe("Author.schema / PostgreSQL", () => {
  it("has an index on the publisher_id foreign key", async () => {
    // Given the public Authors table also has an archived table with the same name
    const db = await loadSchema();

    // When inspecting the public Authors table's publisher index
    const t = db.tables.find((t) => t.name === "authors" && t.schema.name === "public")!;
    const i = t.indexes.find((i) => i.name === "authors_publisher_id_index")!;

    // Then createEntityTable has indexed the publisher foreign key
    expect(i).toBeDefined();
  });

  it("creates a unique composite index for m2m authors_to_tags", async () => {
    // Given the migrated Authors-to-Tags relationship
    const db = await loadSchema();

    // When inspecting its composite index
    const t = db.tables.find((t) => t.name === "authors_to_tags")!;
    const i = t.indexes.find((i) => i.name === "authors_to_tags_author_id_tag_id_unique_index")!;

    // Then a unique index covers both relationship columns
    expect(i).toMatchObject({ columns: [{ name: "author_id" }, { name: "tag_id" }], isUnique: true });
  });

  it("creates an index for the second column of an m2m relationship", async () => {
    // Given the migrated Authors-to-Tags relationship
    const db = await loadSchema();

    // When inspecting its inverse lookup index
    const t = db.tables.find((t) => t.name === "authors_to_tags")!;
    const i = t.indexes.find((i) => i.name === "authors_to_tags_tag_id_index")!;

    // Then the Tag foreign key is indexed independently
    expect(i).toMatchObject({ columns: [{ name: "tag_id" }] });
  });

  it("introspects Authors with a trigger function in another schema", async () => {
    // Given Authors has a trigger whose function lives outside the public schema
    const client = new Client(newPgConnectionConfig());
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE SCHEMA joist_audit_test");
      await client.query(`CREATE FUNCTION joist_audit_test.on_author_change() RETURNS trigger
        LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END'`);
      await client.query(`CREATE TRIGGER author_audit_test BEFORE INSERT ON public.authors
        FOR EACH ROW EXECUTE FUNCTION joist_audit_test.on_author_change()`);

      // When codegen introspects the schema
      const db = await loadPgMetadata(client);

      // Then the Authors columns and relations are still available
      expect(
        db.tables.find((table) => table.name === "authors" && table.schema.name === "public")?.columns.get("id")
          .isPrimaryKey,
      ).toBe(true);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});

/** Introspects the real integration schema with the same catalog reader as codegen. */
async function loadSchema() {
  const client = new Client(newPgConnectionConfig());
  await client.connect();
  try {
    return await loadPgMetadata(client);
  } finally {
    await client.end();
  }
}
