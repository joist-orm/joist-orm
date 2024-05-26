import { MigrationBuilder } from "node-pg-migrate";

export function up(b: MigrationBuilder): void {
  // case 1, no cycles
  b.createTable("t1_authors", {
    id: { type: "int", primaryKey: true, sequenceGenerated: { precedence: "BY DEFAULT" } },
    first_name: { type: "varchar(255)", notNull: true },
  });
  b.createTable("t1_books", {
    id: { type: "int", primaryKey: true, sequenceGenerated: { precedence: "BY DEFAULT" } },
    title: { type: "varchar(255)", notNull: true },
    author_id: { type: "int", references: "t1_authors", notNull: true },
  });

  // case 2, author.favorite_book_id is nullable, no cascade behavior
  b.createTable("t2_authors", {
    id: { type: "int", primaryKey: true, sequenceGenerated: { precedence: "BY DEFAULT" } },
    first_name: { type: "varchar(255)", notNull: true },
  });
  b.createTable("t2_books", {
    id: { type: "int", primaryKey: true, sequenceGenerated: { precedence: "BY DEFAULT" } },
    title: { type: "varchar(255)", notNull: true },
    author_id: { type: "int", references: "t2_authors", notNull: true },
  });
  b.addColumns("t2_authors", {
    favorite_book_id: { type: "int", references: "t2_books", notNull: false },
  });

  // case 3, author.favorite_book_id is not-null (hard insert cycle), but cascade set null (no flush cycle)
  b.createTable("t3_authors", {
    id: { type: "int", primaryKey: true, sequenceGenerated: { precedence: "BY DEFAULT" } },
    first_name: { type: "varchar(255)", notNull: true },
  });
  b.createTable("t3_books", {
    id: { type: "int", primaryKey: true, sequenceGenerated: { precedence: "BY DEFAULT" } },
    title: { type: "varchar(255)", notNull: true },
    author_id: { type: "int", references: "t3_authors", notNull: true },
  });
  b.addColumns("t3_authors", {
    favorite_book_id: { type: "int", references: "t3_books", notNull: true, onDelete: "SET NULL" },
  });

  // case 4, author.favorite_book_id is not-null (hard insert cycle), and no (hard flush cycle)
  b.createTable("t4_authors", {
    id: { type: "int", primaryKey: true, sequenceGenerated: { precedence: "BY DEFAULT" } },
    first_name: { type: "varchar(255)", notNull: true },
  });
  b.createTable("t4_books", {
    id: { type: "int", primaryKey: true, sequenceGenerated: { precedence: "BY DEFAULT" } },
    title: { type: "varchar(255)", notNull: true },
    author_id: { type: "int", references: "t4_authors", notNull: true },
  });
  b.addColumns("t4_authors", {
    favorite_book_id: { type: "int", references: "t4_books", notNull: true },
  });

  // Add test with Author -> Book -> BookReview, and book review has a nullable book column,
  // that doesn't cause cycles--we still want it to sort after book
  b.createTable("t5_authors", {
    id: { type: "int", primaryKey: true, sequenceGenerated: { precedence: "BY DEFAULT" } },
    first_name: { type: "varchar(255)", notNull: true },
  });
  b.createTable("t5_books", {
    id: { type: "int", primaryKey: true, sequenceGenerated: { precedence: "BY DEFAULT" } },
    title: { type: "varchar(255)", notNull: true },
    author_id: { type: "int", references: "t5_authors", notNull: true },
  });
  b.createTable("t5_book_reviews", {
    id: { type: "int", primaryKey: true, sequenceGenerated: { precedence: "BY DEFAULT" } },
    title: { type: "varchar(255)", notNull: true },
    book_id: { type: "int", references: "t5_books", notNull: false },
  });
}
