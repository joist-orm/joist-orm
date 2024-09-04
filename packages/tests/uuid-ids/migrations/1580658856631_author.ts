import { MigrationBuilder } from "node-pg-migrate";

export function up(b: MigrationBuilder): void {
  b.createTable("authors", {
    id: { type: "uuid", primaryKey: true },
    first_name: { type: "varchar(255)", notNull: true },
    last_name: { type: "varchar(255)", notNull: false },
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });

  b.createTable("book_status", {
    id: { type: "uuid", primaryKey: true },
    code: { type: "text", notNull: true },
    name: { type: "text", notNull: true },
  });
  b.addConstraint("book_status", "book_status_unique_enum_code_constraint", "UNIQUE (code)");
  b.sql(`INSERT INTO book_status (id, code, name) VALUES ('00000000-0000-0000-0000-000000000001', 'DRAFT', 'Draft');`);

  b.sql(
    `INSERT INTO book_status (id, code, name) VALUES ('00000000-0000-0000-0000-000000000002', 'PUBLISHED', 'Published');`,
  );

  b.createTable("books", {
    id: { type: "uuid", primaryKey: true },
    title: { type: "varchar(255)", notNull: true },
    status_id: { type: "uuid", references: "book_status", notNull: true, deferrable: true, deferred: true },
    author_id: { type: "uuid", references: "authors", notNull: true, deferrable: true, deferred: true },
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });
  b.addIndex("books", ["author_id"], { method: "btree" });
}
