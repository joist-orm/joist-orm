import { createEntityTable, foreignKey } from "joist-migration-utils";
import { MigrationBuilder } from "node-pg-migrate";

export function up(b: MigrationBuilder): void {
  createEntityTable(b, "children", {
    name: "text",
  });
  // for testing multi-path relationships, i.e.
  //          ParentGroup <-- ParentItem
  //                |              |
  //  Child <-  ChildGroup  <-- ChildItem
  createEntityTable(b, "parent_groups", { name: "text" });
  createEntityTable(b, "parent_items", {
    name: "text",
    parent_group_id: foreignKey("parent_groups", { notNull: true }),
  });
  createEntityTable(b, "child_groups", {
    name: "text",
    parent_group_id: foreignKey("parent_groups", { notNull: true }),
    child_id_group_id: foreignKey("children", { notNull: true }),
  });
  createEntityTable(b, "child_items", {
    name: "text",
    parent_item_id: foreignKey("parent_items", { notNull: true }),
    child_group_id: foreignKey("child_groups", { notNull: true }),
  });
}
