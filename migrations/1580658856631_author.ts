import { MigrationBuilder } from "node-pg-migrate";
import { createEntityTable, createUpdatedAtFunction } from "./utils";

export function up(b: MigrationBuilder): void {
  createUpdatedAtFunction(b);

  createEntityTable(b, "authors", {
    first_name: "varchar(255)",
  });

  createEntityTable(b, "books", {
    title: "varchar(255)",
    author_id: { type: "integer", references: "authors", notNull: true },
  });

  createEntityTable(b, "tags", {
    name: "varchar(255)",
  });

  b.createTable("books_to_tags", {
    id: "id",
    book_id: { type: "integer", references: "books", notNull: true },
    tag_id: { type: "integer", references: "tags", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: b.func("NOW()") },
  });
}
