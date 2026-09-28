import { type MigrationBuilder } from "node-pg-migrate";

export function up(b: MigrationBuilder): void {
  b.createTable("authors", {
    id: { type: "int", primaryKey: true, sequenceGenerated: { precedence: "BY DEFAULT" } },
    first_name: { type: "varchar(255)", notNull: true },
    last_name: { type: "varchar(255)", notNull: false },
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });

  b.createTable("books", {
    id: { type: "bigint", primaryKey: true, sequenceGenerated: { precedence: "BY DEFAULT" } },
    title: { type: "varchar(255)", notNull: true },
    author_id: { type: "int", references: "authors", notNull: true, deferrable: true, deferred: true },
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });
  b.addIndex("books", ["author_id"], { method: "btree" });

  b.createTable("comments", {
    id: { type: "int", primaryKey: true, sequenceGenerated: { precedence: "BY DEFAULT" } },
    text: { type: "varchar(255)", notNull: true },
    parent_author_id: { type: "int", references: "authors", notNull: false, deferrable: true, deferred: true },
    parent_book_id: {
      type: "bigint",
      references: "books",
      notNull: false,
      deferrable: true,
      deferred: true,
    },
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });
  b.addIndex("comments", ["parent_author_id"], { method: "btree" });
  b.addIndex("comments", ["parent_book_id"], { method: "btree" });
}
