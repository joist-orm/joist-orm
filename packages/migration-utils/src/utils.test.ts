import { MigrationBuilder } from "node-pg-migrate";
import { Client } from "pg";

import { createManyToManyTable } from "./utils.ts";

// Needs a real Postgres, i.e. `yarn db`, because the bug is Postgres silently truncating identifiers to 63 chars.
describe("utils", () => {
  let client: Client;

  beforeAll(async () => {
    // Defaults are the `yarn db` database; set PGHOST, PGPORT, PGUSER, PGPASSWORD and PGDATABASE to override
    const env = process.env;
    client = new Client({
      host: env.PGHOST ?? "localhost",
      port: Number(env.PGPORT ?? 5435),
      user: env.PGUSER ?? "joist",
      password: env.PGPASSWORD ?? "local",
      database: env.PGDATABASE ?? "joist",
    });
    await client.connect();
  });

  afterAll(async () => {
    await client.query("DROP TABLE IF EXISTS change_requests_related_to_change_requests, change_requests CASCADE");
    await client.query("DROP TABLE IF EXISTS ms_authors_to_ms_tags, ms_authors, ms_tags CASCADE");
    await client.end();
  });

  async function indexNames(table: string): Promise<string[]> {
    const { rows } = await client.query("SELECT indexname FROM pg_indexes WHERE tablename = $1 ORDER BY indexname", [
      table,
    ]);
    return rows.map((r) => r.indexname);
  }

  async function migrate(fn: (b: MigrationBuilder) => void): Promise<void> {
    const b = new MigrationBuilder(client as any, undefined, false, console);
    fn(b);
    await client.query(b.getSql());
  }

  it("keeps the default index names when they fit in 63 chars", async () => {
    // Given a many-to-many table with short column names
    // When it is created
    await migrate((b) => {
      b.createTable("ms_authors", { id: "id" });
      b.createTable("ms_tags", { id: "id" });
      createManyToManyTable(b, "ms_authors_to_ms_tags", "ms_authors", "ms_tags");
    });
    // Then the indexes keep the node-pg-migrate default names, so existing schemas are unaffected
    expect(await indexNames("ms_authors_to_ms_tags")).toMatchInlineSnapshot(`
     [
       "ms_authors_to_ms_tags_ms_author_id_ms_tag_id_unique_index",
       "ms_authors_to_ms_tags_ms_tag_id_index",
       "ms_authors_to_ms_tags_pkey",
     ]
    `);
  });

  it("creates distinct indexes when the default names exceed 63 chars", async () => {
    // Given a self-referencing many-to-many table whose two columns share a long prefix
    // When it is created
    await migrate((b) => {
      b.createTable("change_requests", { id: "id" });
      createManyToManyTable(
        b,
        "change_requests_related_to_change_requests",
        { table: "change_requests", column: "change_request_related_from_id" },
        { table: "change_requests", column: "change_request_related_to_id" },
      );
    });
    // Then each index exists with its own name within Postgres' identifier limit
    const names = await indexNames("change_requests_related_to_change_requests");
    expect(names.every((n) => n.length <= 63)).toBe(true);
    expect(names).toMatchInlineSnapshot(`
     [
       "change_requests_related_to_change_requests_change_requ_a8ea0f5d",
       "change_requests_related_to_change_requests_change_requ_f08b5b62",
       "change_requests_related_to_change_requests_pkey",
     ]
    `);
  });
});
