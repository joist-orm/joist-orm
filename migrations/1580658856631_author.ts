import { MigrationBuilder } from "node-pg-migrate";
import { createEntityTable, createUpdatedAtFunction } from "./utils";

export function up(b: MigrationBuilder): void {
  createUpdatedAtFunction(b);
  createEntityTable(b, "author", {
    first_name: "varchar(255)",
  });
}
