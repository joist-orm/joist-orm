import type { MigrationBuilder } from "node-pg-migrate";

/** Lets books persist their author's numeric key as a derived value. */
export function up(b: MigrationBuilder): void {
  b.addColumns("books", { author_id_snapshot: { type: "int" } });
}
