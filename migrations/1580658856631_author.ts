import { MigrationBuilder } from "node-pg-migrate";
import { createCreatedAtFunction, createEntityTable, createEnumTable, createUpdatedAtFunction } from "./utils";
import { ColumnDefinition } from "node-pg-migrate/dist/operations/tablesTypes";

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
    publisher_id: foreignKey("publishers"),
  });

  createEntityTable(b, "books", {
    title: { type: "varchar(255)", notNull: true },
    author_id: foreignKey("authors", { notNull: true }),
  });

  createEntityTable(b, "tags", {
    name: { type: "varchar(255)", notNull: true },
  });

  b.createTable("books_to_tags", {
    id: "id",
    book_id: foreignKey("books", { notNull: true }),
    tag_id: foreignKey("tags", { notNull: true }),
    created_at: { type: "timestamptz", notNull: true, default: b.func("NOW()") },
  });
  b.createIndex("books_to_tags", ["book_id", "tag_id"], { unique: true });
}

function foreignKey(otherTable: string, opts?: Partial<ColumnDefinition>): ColumnDefinition {
  return { type: "integer", references: otherTable, deferrable: true, deferred: true, ...opts };
}
