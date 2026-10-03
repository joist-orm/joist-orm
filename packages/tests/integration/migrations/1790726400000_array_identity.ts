import { type MigrationBuilder } from "node-pg-migrate";

/** Gives AuthorStat a database-backed identity for the days its statistics cover. */
export function up(b: MigrationBuilder): void {
  b.addColumns("author_stats", {
    name: { type: "text", notNull: false },
    days: { type: "integer[]", notNull: false },
    deleted_at: { type: "timestamptz", notNull: false },
  });
  b.addConstraint("author_stats", "author_stats_name_days_unique", {
    unique: ["name", "days"],
  });
}
