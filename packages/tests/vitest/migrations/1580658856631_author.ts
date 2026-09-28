import { MigrationBuilder } from "node-pg-migrate";

export function up(b: MigrationBuilder): void {
  b.createTable("authors", {
    id: { type: "int", primaryKey: true, sequenceGenerated: { precedence: "BY DEFAULT" } },
    first_name: { type: "varchar(255)", notNull: true },
    last_name: { type: "varchar(255)", notNull: false },
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });

  // `deleted_at` makes Book soft-deletable, so we can exercise `toMatchEntity`'s
  // getWithSoftDeleted handling from Vitest.
  b.createTable("books", {
    id: { type: "int", primaryKey: true, sequenceGenerated: { precedence: "BY DEFAULT" } },
    title: { type: "varchar(255)", notNull: true },
    author_id: { type: "int", references: "authors", notNull: true, deferrable: true, deferred: true },
    deleted_at: { type: "timestamptz", notNull: false },
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });
  b.addIndex("books", ["author_id"], { method: "btree" });
}
