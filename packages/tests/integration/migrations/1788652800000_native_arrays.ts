import { type MigrationBuilder } from "node-pg-migrate";

/** Adds native array storage for password history and numeric AuthorStat samples. */
export function up(b: MigrationBuilder): void {
  b.addColumns("users", {
    password_history: { type: "text[]", notNull: false },
  });
  b.addColumns("author_stats", {
    decimal_samples: { type: "numeric[]", notNull: false },
    bigint_samples: { type: "bigint[]", notNull: false },
  });
}
