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
}
