import { MigrationBuilder } from "node-pg-migrate";
import {
  createCreatedAtFunction,
  createEntityTable,
  createEnumTable,
  createManyToManyTable,
  createUpdatedAtFunction,
  foreignKey,
} from "joist-migration-utils";

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

  createManyToManyTable(b, "books_to_tags", "books", "tags");
}
