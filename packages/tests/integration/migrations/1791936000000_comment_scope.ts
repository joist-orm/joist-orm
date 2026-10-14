import { addColumns, foreignKey } from "joist-migration-utils";
import type { MigrationBuilder } from "node-pg-migrate";

/** Adds an optional group scope to comments. */
export function up(b: MigrationBuilder): void {
  addColumns(b, "comments", {
    scope_parent_group_id: foreignKey("parent_groups", { notNull: false }),
    scope_child_group_id: foreignKey("child_groups", { notNull: false }),
  });
}
