import { MigrationBuilder } from "node-pg-migrate";

export function up(b: MigrationBuilder): void {
  b.createTable("authors", {
    id: { type: "uuid", primaryKey: true },
    first_name: { type: "varchar(255)", notNull: true },
    last_name: { type: "varchar(255)", notNull: false },
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });

  b.createTable("books", {
    id: { type: "uuid", primaryKey: true },
    title: { type: "varchar(255)", notNull: true },
    author_id: { type: "uuid", references: "authors", notNull: true, deferrable: true, deferred: true },
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });
  b.createIndex("books", ["author_id"], { method: "btree" });

  b.createTable("comments", {
    id: { type: "uuid", primaryKey: true },
    text: { type: "varchar(255)", notNull: true },
    parent_author_id: { type: "uuid", references: "authors", notNull: false, deferrable: true, deferred: true },
    parent_book_id: { type: "uuid", references: "books", notNull: false, deferrable: true, deferred: true },
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });
  b.addIndex("comments", ["parent_author_id"], { method: "btree" });
  b.addIndex("comments", ["parent_book_id"], { method: "btree" });

  // For testing cuid/etc ids
  b.createTable("book_reviews", {
    id: { type: "text", primaryKey: true },
    rating: { type: "smallint", notNull: true },
    book_id: { type: "uuid", references: "authors", notNull: true, deferrable: true, deferred: true },
  });
  b.createIndex("book_reviews", ["book_id"], { method: "btree" });
}
