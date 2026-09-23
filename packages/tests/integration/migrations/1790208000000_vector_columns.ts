import type { MigrationBuilder } from "node-pg-migrate";

/** Adds a pgvector column for testing `vector(N)` <-> `number[]` round-trips as a lazy field. */
export function up(b: MigrationBuilder): void {
  // The extension is untrusted, so the db's reset.sh creates it as a superuser; this is a no-op guard.
  b.sql(`CREATE EXTENSION IF NOT EXISTS vector`);
  b.addColumns("parent_groups", {
    embedding: { type: "vector(3)", notNull: false },
  });
}
