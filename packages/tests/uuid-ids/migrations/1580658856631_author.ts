import { MigrationBuilder } from "node-pg-migrate";

export function up(b: MigrationBuilder): void {
  b.createTable("authors", {
    id: { type: "uuid", primaryKey: true },
    first_name: { type: "varchar(255)", notNull: true },
    last_name: { type: "varchar(255)", notNull: false },
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });
}
