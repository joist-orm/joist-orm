import { MigrationBuilder } from "node-pg-migrate";
import { createCreatedAtFunction, createEntityTable, createEnumTable, createUpdatedAtFunction } from "./utils";

export function up(b: MigrationBuilder): void {
  createUpdatedAtFunction(b);
  createCreatedAtFunction(b);

  createEnumTable(b, "publisher_size", [
    ["SMALL", "Small"],
    ["LARGE", "Large"],
  ]);

  createEntityTable(b, "publishers", {
    name: { type: "varchar(255)", notNull: true },
    size_id: { type: "integer", references: "publisher_size", notNull: false },
  });

  createEntityTable(b, "authors", {
    first_name: { type: "varchar(255)", notNull: true },
    publisher_id: { type: "integer", references: "publishers", deferrable: true, deferred: true }, // keep nullable for existing test data
  });

  createEntityTable(b, "books", {
    title: { type: "varchar(255)", notNull: true },
    author_id: { type: "integer", references: "authors", notNull: true, deferrable: true, deferred: true },
  });

  createEntityTable(b, "tags", {
    name: { type: "varchar(255)", notNull: true },
  });

  b.createTable("books_to_tags", {
    id: "id",
    book_id: { type: "integer", references: "books", notNull: true, deferrable: true, deferred: true },
    tag_id: { type: "integer", references: "tags", notNull: true, deferrable: true, deferred: true },
    created_at: { type: "timestamptz", notNull: true, default: b.func("NOW()") },
  });
  b.createIndex("books_to_tags", ["book_id", "tag_id"], { unique: true });
}
