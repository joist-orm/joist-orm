import type { MigrationBuilder } from "node-pg-migrate";

/** Adds pgvector columns for testing `vector(N)` <-> `number[]` round-trips, as both lazy and non-lazy fields. */
export function up(b: MigrationBuilder): void {
  // The extension is untrusted, so the db's reset.sh creates it as a superuser; this is a no-op guard.
  b.sql(`CREATE EXTENSION IF NOT EXISTS vector`);
  b.addColumns("parent_groups", {
    lazy_embedding: { type: "vector(3)", notNull: false },
    // Non-lazy, so the default SELECT reads it, i.e. via the binary wire parser when JOIST_ROW_DATA=1
    eager_embedding: { type: "vector(3)", notNull: false },
  });
}
