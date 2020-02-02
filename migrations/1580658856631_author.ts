import { MigrationBuilder } from "node-pg-migrate";

export function up(b: MigrationBuilder): void {
  b.createTable("author", {
    id: "id",
    first_name: "varchar(255)",
  });
}
