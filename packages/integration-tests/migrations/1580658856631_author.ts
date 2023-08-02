import {
  addColumns,
  createCreatedAtFunction,
  createEntityTable,
  createEnumTable,
  createManyToManyTable,
  createSubTable,
  createUpdatedAtFunction,
  enumArrayColumn,
  foreignKey,
} from "joist-migration-utils";
import { MigrationBuilder } from "node-pg-migrate";

export function up(b: MigrationBuilder): void {
  createUpdatedAtFunction(b);
  createCreatedAtFunction(b);

  createEnumTable(b, "publisher_size", [
    ["SMALL", "Small"],
    ["LARGE", "Large"],
  ]);

  // tests enum accessor codegen name collision
  createEnumTable(b, "publisher_type", [
    ["SMALL", "Small"],
    ["BIG", "Big"],
  ]);

  // Used for:
  // - Tag.books is a regular m2m
  // - Tag.authors is a large m2m
  // - Tag.publishers is a table-per-class m2m
  createEntityTable(b, "tags", {
    name: { type: "varchar(255)", notNull: true },
  });

  // Used for PublisherGroup.publishers to test table-per-class o2ms
  createEntityTable(b, "publisher_groups", { name: "text" });

  createEntityTable(b, "publishers", {
    name: { type: "varchar(255)", notNull: true },
    size_id: { type: "integer", references: "publisher_size", notNull: false },
    type_id: { type: "integer", references: "publisher_type", notNull: true, default: 2 },
    latitude: { type: "numeric(9, 6)", notNull: false },
    longitude: { type: "numeric(9, 6)", notNull: false },
    huge_number: { type: "numeric(17, 0)", notNull: false },
    // for testing table-per-class o2ms
    group_id: foreignKey("publisher_groups", { notNull: false }),
  });

  // Create two subclass tables
  createSubTable(b, "publishers", "small_publishers", {
    city: { type: "text", notNull: true },
    // Used to test reactive fields that only exist on a subtype
    all_author_names: { type: "text" },
  });
  createSubTable(b, "publishers", "large_publishers", {
    country: "text",
  });

  createEnumTable(b, "color", [
    ["RED", "Red"],
    ["GREEN", "Green"],
    ["BLUE", "Blue"],
  ]);

  // Testing native pg enums
  b.createType("favorite_shape", ["circle", "square", "triangle"]);

  createEntityTable(b, "authors", {
    first_name: { type: "varchar(255)", notNull: true },
    last_name: { type: "varchar(255)", notNull: false },
    ssn: { type: "varchar(25)", notNull: false, unique: true },
    // for testing sync derived values
    initials: { type: "varchar(255)", notNull: true },
    // for testing async derived values
    number_of_books: { type: "integer", notNull: true },
    // for testing async derived value via a polymorphic reference
    book_comments: { type: "text", notNull: false },
    // for testing nullable booleans
    is_popular: { type: "boolean", notNull: false },
    // for testing integers
    age: { type: "integer", notNull: false },
    // for testing dates
    graduated: { type: "date", notNull: false },
    // for testing enum[] fields
    favorite_colors: enumArrayColumn("color"),
    // for testing native enum fields
    favorite_shape: { type: "favorite_shape", notNull: false },
    // for testing protected fields
    was_ever_popular: { type: "boolean", notNull: false },
    // for testing FieldConfig.ignore
    ignore_used_to_be_useful: { type: "boolean", notNull: false, default: true },
    ignore_used_to_be_useful_required_with_default: { type: "boolean", notNull: true, default: true },
    ignore_enum_fk_id: foreignKey("publisher_size", { notNull: false }),
    ignore_enum_fk_id_required_with_default: foreignKey("publisher_size", { notNull: true, default: 1 }),
    // for foreign key tests
    publisher_id: foreignKey("publishers", { notNull: false }),
    mentor_id: foreignKey("authors", { notNull: false }),
    // for testing jsbon columns
    address: { type: "jsonb", notNull: false },
    business_address: { type: "jsonb", notNull: false },
    quotes: { type: "jsonb", notNull: false },
    number_of_atoms: { type: "bigint", notNull: false },
    deleted_at: { type: "timestamptz", notNull: false },
    // for testing derived fields using other derived fields
    number_of_public_reviews: { type: "int", notNull: false },
    // for testing derived fields using other derived fields
    number_of_public_reviews2: { type: "int", notNull: false },
  });

  // A publisher can only have one author named `Jim`, but still have other authors
  // Verifies that partial unique indexes do not result in o2o collections
  b.createIndex("authors", ["publisher_id"], { unique: true, where: "first_name = 'Jim'" });

  // for testing required enums
  createEnumTable(b, "advance_status", [
    ["PENDING", "Pending"],
    ["SIGNED", "Signed"],
    ["PAID", "Paid"],
  ]);

  createEntityTable(b, "books", {
    title: { type: "varchar(255)", notNull: true },
    author_id: foreignKey("authors", { notNull: true }),
    // for testing columns that are keywords (and testing default values)
    order: { type: "integer", notNull: true, default: 1 },
    deleted_at: { type: "timestamptz", notNull: false },
  });

  // For testing o2o and m2o w/overlapping names in Book.author
  addColumns(b, "authors", {
    current_draft_book_id: foreignKey("books", { notNull: false, unique: true }),
  });

  // for derived fks
  addColumns(b, "authors", {
    favorite_book_id: foreignKey("books", { notNull: false }),
  });

  createEntityTable(b, "book_advances", {
    // for testing required enums
    status_id: foreignKey("advance_status", { notNull: true }),
    publisher_id: foreignKey("publishers", { notNull: true }),
    book_id: foreignKey("books", { notNull: true }),
  });

  // for testing m2m w/tags (iirc)
  createEntityTable(b, "critics", {
    name: { type: "varchar(255)", notNull: true },
    // ignore test
    ignore_favourite_book_id: foreignKey("books", { notNull: false }),
    ignore_worst_book_id: foreignKey("books", { notNull: false, unique: true }),
    // for testing large o2ms
    group_id: foreignKey("publisher_groups", { notNull: false }),
    // for testing `em.find` filtered on base table columns
    favorite_large_publisher_id: foreignKey("large_publishers", { notNull: false }),
  });

  // for testing a required m2o -> o2o
  createEntityTable(b, "critic_columns", {
    name: { type: "varchar(255)", notNull: true },
    critic_id: foreignKey("critics", { notNull: true, unique: true }),
  });

  // for testing children that are named a prefix of their parent
  createEntityTable(b, "book_reviews", {
    rating: { type: "integer", notNull: true },
    book_id: foreignKey("books", { notNull: true }),
    is_public: { type: "boolean", notNull: true },
    is_test: { type: "boolean", notNull: true },
  });

  createEnumTable(b, "image_type", [
    ["BOOK_IMAGE", "Book Image"],
    ["AUTHOR_IMAGE", "Author Image"],
    ["PUBLISHER_IMAGE", "Publisher Image"],
  ]);

  b.addColumn("image_type", { sort_order: { type: "integer", notNull: true, default: 1_000_000 } });
  b.addColumn("image_type", { visible: { type: "boolean", notNull: true, default: true } });
  b.addColumn("image_type", { nickname: { type: "string", notNull: true, default: "" } });
  Object.entries({ BOOK_IMAGE: 100, AUTHOR_IMAGE: 200, PUBLISHER_IMAGE: 300 }).forEach(([code, sortOrder]) =>
    b.sql(`UPDATE image_type SET sort_order=${sortOrder}, nickname='${code.toLowerCase()}' WHERE code='${code}'`),
  );

  createEntityTable(b, "images", {
    type_id: foreignKey("image_type", { notNull: true }),
    file_name: { type: "varchar(255)", notNull: true },
    book_id: foreignKey("books", { notNull: false, unique: true }),
    author_id: foreignKey("authors", { notNull: false, unique: true }),
    publisher_id: foreignKey("publishers", { notNull: false }),
  });

  createEntityTable(b, "users", {
    name: { type: "varchar(255)", notNull: true },
    email: { type: "varchar(255)", notNull: true },
    // for testing o2o/m2o renames
    author_id: foreignKey("authors", {
      notNull: false,
      unique: true,
      fieldName: "authorManyToOne",
      otherFieldName: "userOneToOne",
    }),
    ip_address: { type: "varchar(255)", notNull: false },
    password: { type: "varchar(255)", notNull: false },

    bio: { type: "varchar(255)", notNull: true, default: "" },
  });

  // for testing polymorphic references
  createEntityTable(b, "comments", {
    // inverse is o2m
    parent_book_id: foreignKey("books", { notNull: false }),
    // inverse is o2o
    parent_book_review_id: foreignKey("book_reviews", { notNull: false, unique: true }),
    parent_publisher_id: foreignKey("publishers", { notNull: false }),
    parent_author_id: foreignKey("authors", { notNull: false }),
    // for testing collection renames
    user_id: foreignKey("users", { notNull: false, otherFieldName: "createdComments" }),
    text: "text",
  });

  createEntityTable(b, "author_stats", {
    smallint: { type: "smallint", notNull: true },
    integer: { type: "integer", notNull: true },
    nullable_integer: { type: "integer", notNull: false },
    bigint: { type: "bigint", notNull: true },
    decimal: { type: "decimal", notNull: true },
    real: { type: "real", notNull: true },
    smallserial: { type: "smallserial", notNull: true },
    serial: { type: "serial", notNull: true },
    bigserial: { type: "bigserial", notNull: true },
    doublePrecision: { type: "double precision", notNull: true },
    nullable_text: { type: "text", notNull: false },
    json: { type: "jsonb", notNull: false },
  });

  // for testing ignore of m2m
  createManyToManyTable(b, "critics_to_tags", "critics", "tags");
  // for testing large m2m
  createManyToManyTable(b, "authors_to_tags", "authors", "tags");
  // for testing regular m2m
  createManyToManyTable(b, "books_to_tags", "books", "tags");
  // for testing table-per-class m2m
  createManyToManyTable(b, "publishers_to_tags", "publishers", "tags");
  // for testing m2m renames and name inference
  createManyToManyTable(
    b,
    "users_to_comments",
    { table: "users", column: "liked_by_user_id" },
    { table: "comments", collectionName: "likedComments" },
  );
}
