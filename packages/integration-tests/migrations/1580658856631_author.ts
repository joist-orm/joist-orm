import { MigrationBuilder } from "node-pg-migrate";
import {
  createCreatedAtFunction,
  createEntityTable,
  createEnumTable,
  createManyToManyTable,
  createUpdatedAtFunction,
  foreignKey,
} from "joist-migration-utils";

export function up(b: MigrationBuilder): void {
  createUpdatedAtFunction(b);
  createCreatedAtFunction(b);

  createEnumTable(b, "publisher_size", [
    ["SMALL", "Small"],
    ["LARGE", "Large"],
  ]);

  createEntityTable(b, "publishers", {
    name: { type: "varchar(255)", notNull: true },
    size_id: { type: "integer", references: "publisher_size", notNull: false },
  });

  createEntityTable(b, "authors", {
    first_name: { type: "varchar(255)", notNull: true },
    last_name: { type: "varchar(255)", notNull: false },
    // for testing sync derived values
    initials: { type: "varchar(255)", notNull: true },
    // for testing async derived values
    number_of_books: { type: "integer", notNull: true },
    // for testing nullable booleans
    is_popular: { type: "boolean", notNull: false },
    // for testing integers
    age: { type: "integer", notNull: false },
    // for testing protected fields
    was_ever_popular: { type: "boolean", notNull: false },
    publisher_id: foreignKey("publishers", { notNull: false }),
    mentor_id: foreignKey("authors", { notNull: false }),
  });

  // for testing required enums
  createEnumTable(b, "advance_status", [
    ["PENDING", "Pending"],
    ["SIGNED", "Signed"],
    ["PAID", "Paid"],
  ]);

  createEntityTable(b, "books", {
    title: { type: "varchar(255)", notNull: true },
    author_id: foreignKey("authors", { notNull: true }),
    // for testing columns that are keywords
    order: { type: "integer", notNull: false, default: 0 },
  });

  createEntityTable(b, "book_advances", {
    // for testing required enums
    status_id: foreignKey("advance_status", { notNull: true }),
    publisher_id: foreignKey("publishers", { notNull: true }),
    book_id: foreignKey("books", { notNull: true }),
  });

  // for testing children that are named a prefix of their parent
  createEntityTable(b, "book_reviews", {
    rating: { type: "integer", notNull: true },
    book_id: foreignKey("books", { notNull: true }),
    is_public: { type: "boolean", notNull: true },
  });

  createEntityTable(b, "tags", {
    name: { type: "varchar(255)", notNull: true },
  });

  createManyToManyTable(b, "books_to_tags", "books", "tags");

  createEnumTable(b, "image_type", [
    ["BOOK_IMAGE", "Book Image"],
    ["AUTHOR_IMAGE", "Author Image"],
    ["PUBLISHER_IMAGE", "Publisher Image"],
  ]);

  b.addColumn("image_type", { sort_order: { type: "integer", notNull: true, default: 1_000_000 } });
  Object.entries({ BOOK_IMAGE: 100, AUTHOR_IMAGE: 200, PUBLISHER_IMAGE: 300 }).forEach(([code, sortOrder]) =>
    b.sql(`UPDATE image_type SET sort_order=${sortOrder} WHERE code='${code}'`),
  );

  createEntityTable(b, "images", {
    type_id: foreignKey("image_type", { notNull: true }),
    file_name: { type: "varchar(255)", notNull: true },
    book_id: foreignKey("books", { notNull: false, unique: true }),
    author_id: foreignKey("authors", { notNull: false, unique: true }),
    publisher_id: foreignKey("publishers", { notNull: false }),
  });
}
