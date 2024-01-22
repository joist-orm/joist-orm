import { MigrationBuilder } from "node-pg-migrate";

export function up(b: MigrationBuilder): void {
  b.createTable("authors", {
    id: { type: "uuid", primaryKey: true },
    first_name: { type: "varchar(255)", notNull: true },
    last_name: { type: "varchar(255)", notNull: false },
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });

  b.createTable("books", {
    id: { type: "uuid", primaryKey: true },
    title: { type: "varchar(255)", notNull: true },
    author_id: { type: "uuid", references: "authors", notNull: true, deferrable: true, deferred: true },
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });
  b.sql(`CREATE INDEX books_author_id_idx ON books USING btree (author_id)`);

  b.createTable("comments", {
    id: { type: "uuid", primaryKey: true },
    text: { type: "varchar(255)", notNull: true },
    parent_author_id: { type: "uuid", references: "authors", notNull: false, deferrable: true, deferred: true },
    parent_book_id: { type: "uuid", references: "books", notNull: false, deferrable: true, deferred: true },
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });
  b.sql(`CREATE INDEX comments_author_id_idx ON comments USING btree (parent_author_id)`);
  b.sql(`CREATE INDEX comments_book_id_idx ON comments USING btree (parent_book_id)`);
}
