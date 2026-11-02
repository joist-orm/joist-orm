import { addColumns, createEnumTable, foreignKey } from "joist-migration-utils";
import type { MigrationBuilder } from "node-pg-migrate";

/** Adds a publisher lifecycle state independent of its CTI subtype. */
export function up(b: MigrationBuilder): void {
  createEnumTable(b, "publisher_status", [
    ["DRAFT", "Draft"],
    ["ACTIVE", "Active"],
  ]);
  addColumns(b, "publishers", {
    status_id: foreignKey("publisher_status", { notNull: false }),
  });
}
