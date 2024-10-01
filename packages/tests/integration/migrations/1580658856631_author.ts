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
  b.sql(`CREATE EXTENSION IF NOT EXISTS citext;`);

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
    // Used for testing `em.findOrCreate` on citext columns
    name: { type: "citext", notNull: true },
  });

  // Used for PublisherGroup.publishers to test table-per-class o2ms
  createEntityTable(b, "publisher_groups", {
    name: "text",
    // For testing ReactiveFields that depend on ReactiveQueryFields
    number_of_book_reviews: { type: "int", notNull: true },
  });

  createEntityTable(b, "publishers", {
    name: { type: "varchar(255)", notNull: true },
    size_id: { type: "integer", references: "publisher_size", notNull: false },
    type_id: { type: "integer", references: "publisher_type", notNull: true, default: 2 },
    latitude: { type: "numeric(9, 6)", notNull: false },
    longitude: { type: "numeric(9, 6)", notNull: false },
    huge_number: { type: "numeric(17, 0)", notNull: false },
    number_of_book_reviews: { type: "integer", notNull: true, default: 0 },
    // for testing table-per-class o2ms
    group_id: foreignKey("publisher_groups", { notNull: false }),
    // for testing soft-delete with CTI tables
    deleted_at: { type: "timestamptz", notNull: false },
    // for testing reactivity to ReactiveReferences that are o2os
    titles_of_favorite_books: { type: "text", notNull: false },
    // for testing a setDefault on the base class
    base_sync_default: { type: "text", notNull: true },
    base_async_default: { type: "text", notNull: true },
  });

  // Create two subclass tables
  createSubTable(b, "publishers", "small_publishers", {
    city: { type: "text", notNull: true },
    // For testing columns shared between CTI subtypes
    shared_column: { type: "text" },
    // Used to test reactive fields that only exist on a subtype
    all_author_names: { type: "text" },
    // For testing skipRecursiveRelations on a subclass field
    self_referential_id: foreignKey("small_publishers", { notNull: false }),
  });
  createSubTable(b, "publishers", "large_publishers", {
    // For testing columns shared between CTI subtypes
    shared_column: { type: "text" },
    country: "text",
  });

  createEnumTable(b, "color", [
    ["RED", "Red"],
    ["GREEN", "Green"],
    ["BLUE", "Blue"],
  ]);

  // For testing derived enums via Author.rangeOfBooks
  createEnumTable(b, "book_range", [
    ["FEW", "A Few"],
    ["LOT", "A Lot"],
  ]);

  // Testing native pg enums
  b.createType("favorite_shape", ["circle", "square", "triangle"]);

  createEntityTable(b, "authors", {
    first_name: { type: "varchar(255)", notNull: true },
    last_name: { type: "varchar(255)", notNull: false },
    // for testing findByUnique
    ssn: { type: "varchar(25)", notNull: false, unique: true },
    // for testing sync derived values
    initials: { type: "varchar(255)", notNull: true },
    // for testing async derived values
    number_of_books: { type: "integer", notNull: true },
    // for testing async derived enums
    range_of_books: foreignKey("book_range", { notNull: false }),
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
    // for testing string[] fields
    nick_names: { type: "varchar[]", notNull: false },
    // for testing derived string[] fields
    nick_names_upper: { type: "varchar[]", notNull: false },
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
    mentor_id: foreignKey("authors", { notNull: false, otherFieldName: "mentees" }),
    // for testing ReactiveReferences within a table that has recursive relations
    root_mentor_id: foreignKey("authors", { notNull: false }),
    // for testing ReactiveFields against recursive relations
    mentor_names: { type: "text", notNull: false },
    // for testing jsonb columns
    address: { type: "jsonb", notNull: false },
    business_address: { type: "jsonb", notNull: false },
    // for testing jsonb columns that are arrays
    quotes: { type: "jsonb", notNull: false },
    // for testing bigints
    number_of_atoms: { type: "bigint", notNull: false },
    deleted_at: { type: "timestamptz", notNull: false },
    // for testing derived fields using other derived fields
    number_of_public_reviews: { type: "int", notNull: false },
    // for testing derived fields using other derived fields ... also purposefully camel-case to test batch updates
    numberOfPublicReviews2: { type: "int", notNull: false },
    // for testing derived fields through m2ms
    tags_of_all_books: { type: "varchar", notNull: false },
    // for testing full-text-search fields that want to use `id`
    search: { type: "text", notNull: false },
    // for testing bytea fields
    certificate: { type: "bytea", notNull: false },
  });

  // For testing full-text-search
  b.sql(`
    ALTER TABLE authors ADD COLUMN ts_search tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(search, ''))) STORED;
    CREATE INDEX authors_ts_search_index ON authors USING GIN (ts_search);
  `);

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
    author_id: foreignKey("authors", { notNull: true, otherFieldName: "books" }),
    // For testing recursive keys with o2os
    prequel_id: foreignKey("books", { notNull: false, otherFieldName: "sequel", unique: true }),
    // for testing columns that are keywords (and testing default values)
    order: { type: "integer", notNull: true, default: 1 },
    // for testing required fields with `setDefault`s aren't required by em.create
    notes: { type: "text", notNull: true },
    // for testing nullable fields that don't have a default, i.e. query/em.find on `{ acknowledgements: null }`
    acknowledgements: { type: "text", notNull: false },
    // for testing cross-entity default dependencies
    authors_nick_names: { type: "text", notNull: false },
    // for testing setDefaults that do an em.find
    reviewer_id: foreignKey("authors", { notNull: false }),
    // for testing ReactiveFields that access undefined required fields
    search: { type: "text", notNull: false },
    deleted_at: { type: "timestamptz", notNull: false },
  });

  // For testing o2o and m2o w/overlapping names in Book.author
  addColumns(b, "authors", {
    current_draft_book_id: foreignKey("books", { notNull: false, unique: true }),
  });

  // for derived fks
  addColumns(b, "authors", {
    // For testing ReactiveReferences, where the opposite side is an o2o (the book can only
    // be the favorite of a single author at a time--it's author).
    // We should add another ReactiveReference that is not unique...
    favorite_book_id: foreignKey("books", { notNull: false }),
  });
  b.sql(
    "ALTER TABLE authors ADD CONSTRAINT authors_favorite_book_id_key UNIQUE (favorite_book_id) DEFERRABLE INITIALLY DEFERRED;",
  );

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
    // for testing factory fan-out/fan-in, optionaln to reduce churn in existing tests
    critic_id: foreignKey("critics", { notNull: false }),
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
    // For testing skipping recursive relations
    manager_id: foreignKey("users", { notNull: false, otherFieldName: "directs" }),
    // for testing o2o/m2o renames
    author_id: foreignKey("authors", {
      notNull: false,
      unique: true,
      fieldName: "authorManyToOne",
      otherFieldName: "userOneToOne",
    }),
    ip_address: { type: "varchar(255)", notNull: false },
    password: { type: "varchar(255)", notNull: false },
    // For testing `default: ""` should signal to keep empty strings
    bio: { type: "varchar(255)", notNull: true, default: "" },
    // For testing polymorphic references to subclasses
    favorite_publisher_small_id: foreignKey("small_publishers", { notNull: false }),
    favorite_publisher_large_id: foreignKey("large_publishers", { notNull: false }),
    // for testing default values of required-but-not-defaulted columns
    original_email: { type: "varchar(255)", notNull: true },
    // for testing tstzrange fields
    trial_period: { type: "tstzrange", notNull: false },
  });

  // For testing subclasses with their own rules...
  createSubTable(b, "users", "admin_users", {
    role: { type: "varchar(255)", notNull: true },
  });

  // for testing polymorphic references
  createEntityTable(b, "comments", {
    // inverse is o2m
    parent_book_id: foreignKey("books", { notNull: false }),
    // inverse is o2o
    parent_book_review_id: foreignKey("book_reviews", { notNull: false, unique: true }),
    parent_publisher_id: foreignKey("publishers", { notNull: false }),
    parent_author_id: foreignKey("authors", { notNull: false }),
    // for testing reactive fields that use poly ids
    parent_tagged_id: { type: "text", notNull: false },
    // for testing collection renames
    user_id: foreignKey("users", { notNull: false, otherFieldName: "createdComments" }),
    // for testing ReactiveFields that read through polymorphic references
    parent_tags: { type: "text", notNull: true },
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
    double_precision: { type: "double precision", notNull: true },
    nullable_text: { type: "text", notNull: false },
    json: { type: "jsonb", notNull: false },
  });

  // for testing abbreviations that are SQL keywords, i.s. `author_schedules` ==> `as`
  createEntityTable(b, "author_schedules", {
    author_id: foreignKey("authors", { notNull: true }),
    overview: "text",
  });

  createEnumTable(b, "task_type", [
    ["OLD", "Old"],
    ["NEW", "New"],
  ]);

  // For testing single-table inheritance
  createEntityTable(b, "tasks", {
    type_id: foreignKey("task_type", { notNull: false }),
    duration_in_days: { type: "int", notNull: true },
    // NewTask columns
    special_new_field: { type: "int", notNull: false },
    special_new_author_id: foreignKey("authors", { notNull: false }),
    // OldTask columns
    special_old_field: { type: "int", notNull: false },
    // Self-referential but only for a subtype
    parent_old_task_id: foreignKey("tasks", { notNull: false, otherFieldName: "tasks" }),
    // For testing soft-delete on STI tables
    deleted_at: { type: "timestamptz", notNull: false },
    // For testing defaults, where each subtype provides a different default
    sync_default: { type: "text", notNull: false },
    async_default_1: { type: "text", notNull: false },
    async_default_2: { type: "text", notNull: false },
    // For testing derived fields, where each subtype provides a different derived value
    sync_derived: { type: "text", notNull: false },
    async_derived: { type: "text", notNull: false },
    // For testing skipRecursiveRelations on a subclass field
    self_referential_id: foreignKey("tasks", { notNull: false }),
  });

  // For testing single-table inheritance
  createEntityTable(b, "task_items", {
    old_task_id: foreignKey("tasks", { notNull: false }),
    new_task_id: foreignKey("tasks", { notNull: false }),
    task_id: foreignKey("tasks", { notNull: false }),
  });

  // For testing m2m relations into STI tables
  createManyToManyTable(b, "tasks_to_publishers", "tasks", "publishers");

  // For testing polys to subtypes of STI tables
  addColumns(b, "comments", {
    parent_task_id: foreignKey("tasks", { notNull: false }),
  });

  // For testing factories discovering entities from opt literals
  addColumns(b, "books", {
    random_comment_id: foreignKey("comments", { notNull: false }),
  });

  // for testing ignore of m2m
  createManyToManyTable(b, "critics_to_tags", "critics", "tags");
  // for testing regular m2m
  createManyToManyTable(b, "books_to_tags", "books", "tags");
  // For testing polys Comment -> Parent -> Tags
  // export type CommentParent = Author | Book | BookReview | Publisher | TaskOld;
  createManyToManyTable(b, "authors_to_tags", "authors", "tags");
  createManyToManyTable(b, "book_reviews_to_tags", "book_reviews", "tags");
  createManyToManyTable(b, "task_to_tags", "tasks", "tags");
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
