import { dropUpdatedAtTriggers } from "joist-migration-utils";
import type { MigrationBuilder } from "node-pg-migrate";

/** Makes ORM and explicit SQL writers responsible for advancing their own row versions. */
export function up(b: MigrationBuilder): void {
  dropUpdatedAtTriggers(b);
}
