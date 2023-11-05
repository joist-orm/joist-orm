import { MigrationBuilder } from "node-pg-migrate";

export function up(b: MigrationBuilder): void {
  b.createTable("authors", {
    id: { type: "int", primaryKey: true, sequenceGenerated: { precedence: "BY DEFAULT" } },
    first_name: { type: "varchar(255)", notNull: true },
    last_name: { type: "varchar(255)", notNull: false },
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });

  b.createTable("books", {
    id: { type: "bigint", primaryKey: true, sequenceGenerated: { precedence: "BY DEFAULT" } },
    title: { type: "varchar(255)", notNull: true },
    author_id: { type: "int", references: "authors", notNull: true, deferrable: true, deferred: true },
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });
  b.sql(`CREATE INDEX books_author_id_idx ON books USING btree (author_id)`);
}
