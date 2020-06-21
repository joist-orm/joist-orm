import {
  configureMetadata,
  EntityMetadata,
  PrimaryKeySerde,
  SimpleSerde,
  ForeignKeySerde,
  EnumFieldSerde,
} from "joist-orm";
import {
  Author,
  authorConfig,
  newAuthor,
  Book,
  bookConfig,
  newBook,
  BookAdvance,
  bookAdvanceConfig,
  newBookAdvance,
  BookReview,
  bookReviewConfig,
  newBookReview,
  Image,
  imageConfig,
  newImage,
  Publisher,
  publisherConfig,
  newPublisher,
  Tag,
  tagConfig,
  newTag,
  AdvanceStatuses,
  ImageTypes,
  PublisherSizes,
} from "./entities";

export const authorMeta: EntityMetadata<Author> = {
  cstr: Author,
  type: "Author",
  tagName: "author",
  tableName: "authors",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde(() => authorMeta, "id", "id") },

    {
      fieldName: "firstName",
      columnName: "first_name",
      dbType: "varchar",
      serde: new SimpleSerde("firstName", "first_name"),
    },
    {
      fieldName: "lastName",
      columnName: "last_name",
      dbType: "varchar",
      serde: new SimpleSerde("lastName", "last_name"),
    },
    {
      fieldName: "initials",
      columnName: "initials",
      dbType: "varchar",
      serde: new SimpleSerde("initials", "initials"),
    },
    {
      fieldName: "numberOfBooks",
      columnName: "number_of_books",
      dbType: "int",
      serde: new SimpleSerde("numberOfBooks", "number_of_books"),
    },
    {
      fieldName: "isPopular",
      columnName: "is_popular",
      dbType: "bool",
      serde: new SimpleSerde("isPopular", "is_popular"),
    },
    {
      fieldName: "age",
      columnName: "age",
      dbType: "int",
      serde: new SimpleSerde("age", "age"),
    },
    {
      fieldName: "wasEverPopular",
      columnName: "was_ever_popular",
      dbType: "bool",
      serde: new SimpleSerde("wasEverPopular", "was_ever_popular"),
    },
    {
      fieldName: "createdAt",
      columnName: "created_at",
      dbType: "timestamptz",
      serde: new SimpleSerde("createdAt", "created_at"),
    },
    {
      fieldName: "updatedAt",
      columnName: "updated_at",
      dbType: "timestamptz",
      serde: new SimpleSerde("updatedAt", "updated_at"),
    },
    {
      fieldName: "mentor",
      columnName: "mentor_id",
      dbType: "int",
      serde: new ForeignKeySerde("mentor", "mentor_id", () => authorMeta),
    },

    {
      fieldName: "publisher",
      columnName: "publisher_id",
      dbType: "int",
      serde: new ForeignKeySerde("publisher", "publisher_id", () => publisherMeta),
    },
  ],
  fields: [
    { kind: "primaryKey", fieldName: "id", required: true },

    {
      kind: "primitive",
      fieldName: "firstName",
      derived: false,
      required: true,
      protected: false,
      type: "string",
    },
    {
      kind: "primitive",
      fieldName: "lastName",
      derived: false,
      required: false,
      protected: false,
      type: "string",
    },
    {
      kind: "primitive",
      fieldName: "initials",
      derived: "sync",
      required: false,
      protected: false,
      type: "string",
    },
    {
      kind: "primitive",
      fieldName: "numberOfBooks",
      derived: "async",
      required: false,
      protected: false,
      type: "number",
    },
    {
      kind: "primitive",
      fieldName: "isPopular",
      derived: false,
      required: false,
      protected: false,
      type: "boolean",
    },
    {
      kind: "primitive",
      fieldName: "age",
      derived: false,
      required: false,
      protected: false,
      type: "number",
    },
    {
      kind: "primitive",
      fieldName: "wasEverPopular",
      derived: false,
      required: false,
      protected: true,
      type: "boolean",
    },
    {
      kind: "primitive",
      fieldName: "createdAt",
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "m2o",
      fieldName: "mentor",
      required: false,
      otherMetadata: () => authorMeta,
      otherFieldName: "authors",
    },

    {
      kind: "m2o",
      fieldName: "publisher",
      required: false,
      otherMetadata: () => publisherMeta,
      otherFieldName: "authors",
    },

    {
      kind: "o2m",
      fieldName: "authors",
      required: false,
      otherMetadata: () => authorMeta,
      otherFieldName: "mentor",
    },

    {
      kind: "o2m",
      fieldName: "books",
      required: false,
      otherMetadata: () => bookMeta,
      otherFieldName: "author",
    },
  ],
  config: authorConfig,
  factory: newAuthor,
};

(Author as any).metadata = authorMeta;

export const bookMeta: EntityMetadata<Book> = {
  cstr: Book,
  type: "Book",
  tagName: "book",
  tableName: "books",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde(() => bookMeta, "id", "id") },

    {
      fieldName: "title",
      columnName: "title",
      dbType: "varchar",
      serde: new SimpleSerde("title", "title"),
    },
    {
      fieldName: "order",
      columnName: "order",
      dbType: "int",
      serde: new SimpleSerde("order", "order"),
    },
    {
      fieldName: "createdAt",
      columnName: "created_at",
      dbType: "timestamptz",
      serde: new SimpleSerde("createdAt", "created_at"),
    },
    {
      fieldName: "updatedAt",
      columnName: "updated_at",
      dbType: "timestamptz",
      serde: new SimpleSerde("updatedAt", "updated_at"),
    },
    {
      fieldName: "author",
      columnName: "author_id",
      dbType: "int",
      serde: new ForeignKeySerde("author", "author_id", () => authorMeta),
    },
  ],
  fields: [
    { kind: "primaryKey", fieldName: "id", required: true },

    {
      kind: "primitive",
      fieldName: "title",
      derived: false,
      required: true,
      protected: false,
      type: "string",
    },
    {
      kind: "primitive",
      fieldName: "order",
      derived: false,
      required: false,
      protected: false,
      type: "number",
    },
    {
      kind: "primitive",
      fieldName: "createdAt",
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "m2o",
      fieldName: "author",
      required: true,
      otherMetadata: () => authorMeta,
      otherFieldName: "books",
    },

    {
      kind: "o2m",
      fieldName: "advances",
      required: false,
      otherMetadata: () => bookAdvanceMeta,
      otherFieldName: "book",
    },

    {
      kind: "o2m",
      fieldName: "reviews",
      required: false,
      otherMetadata: () => bookReviewMeta,
      otherFieldName: "book",
    },

    {
      kind: "m2m",
      fieldName: "tags",
      required: false,
      otherMetadata: () => tagMeta,
      otherFieldName: "books",
    },
  ],
  config: bookConfig,
  factory: newBook,
};

(Book as any).metadata = bookMeta;

export const bookAdvanceMeta: EntityMetadata<BookAdvance> = {
  cstr: BookAdvance,
  type: "BookAdvance",
  tagName: "bookAdvance",
  tableName: "book_advances",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde(() => bookAdvanceMeta, "id", "id") },

    {
      fieldName: "status",
      columnName: "status_id",
      dbType: "int",
      serde: new EnumFieldSerde("status", "status_id", AdvanceStatuses),
    },

    {
      fieldName: "createdAt",
      columnName: "created_at",
      dbType: "timestamptz",
      serde: new SimpleSerde("createdAt", "created_at"),
    },
    {
      fieldName: "updatedAt",
      columnName: "updated_at",
      dbType: "timestamptz",
      serde: new SimpleSerde("updatedAt", "updated_at"),
    },
    {
      fieldName: "book",
      columnName: "book_id",
      dbType: "int",
      serde: new ForeignKeySerde("book", "book_id", () => bookMeta),
    },

    {
      fieldName: "publisher",
      columnName: "publisher_id",
      dbType: "int",
      serde: new ForeignKeySerde("publisher", "publisher_id", () => publisherMeta),
    },
  ],
  fields: [
    { kind: "primaryKey", fieldName: "id", required: true },

    {
      kind: "enum",
      fieldName: "status",
      required: true,
      enumDetailType: AdvanceStatuses,
    },

    {
      kind: "primitive",
      fieldName: "createdAt",
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "m2o",
      fieldName: "book",
      required: true,
      otherMetadata: () => bookMeta,
      otherFieldName: "advances",
    },

    {
      kind: "m2o",
      fieldName: "publisher",
      required: true,
      otherMetadata: () => publisherMeta,
      otherFieldName: "bookAdvances",
    },
  ],
  config: bookAdvanceConfig,
  factory: newBookAdvance,
};

(BookAdvance as any).metadata = bookAdvanceMeta;

export const bookReviewMeta: EntityMetadata<BookReview> = {
  cstr: BookReview,
  type: "BookReview",
  tagName: "bookReview",
  tableName: "book_reviews",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde(() => bookReviewMeta, "id", "id") },

    {
      fieldName: "rating",
      columnName: "rating",
      dbType: "int",
      serde: new SimpleSerde("rating", "rating"),
    },
    {
      fieldName: "isPublic",
      columnName: "is_public",
      dbType: "bool",
      serde: new SimpleSerde("isPublic", "is_public"),
    },
    {
      fieldName: "createdAt",
      columnName: "created_at",
      dbType: "timestamptz",
      serde: new SimpleSerde("createdAt", "created_at"),
    },
    {
      fieldName: "updatedAt",
      columnName: "updated_at",
      dbType: "timestamptz",
      serde: new SimpleSerde("updatedAt", "updated_at"),
    },
    {
      fieldName: "book",
      columnName: "book_id",
      dbType: "int",
      serde: new ForeignKeySerde("book", "book_id", () => bookMeta),
    },
  ],
  fields: [
    { kind: "primaryKey", fieldName: "id", required: true },

    {
      kind: "primitive",
      fieldName: "rating",
      derived: false,
      required: true,
      protected: false,
      type: "number",
    },
    {
      kind: "primitive",
      fieldName: "isPublic",
      derived: "async",
      required: false,
      protected: false,
      type: "boolean",
    },
    {
      kind: "primitive",
      fieldName: "createdAt",
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "m2o",
      fieldName: "book",
      required: true,
      otherMetadata: () => bookMeta,
      otherFieldName: "reviews",
    },
  ],
  config: bookReviewConfig,
  factory: newBookReview,
};

(BookReview as any).metadata = bookReviewMeta;

export const imageMeta: EntityMetadata<Image> = {
  cstr: Image,
  type: "Image",
  tagName: "image",
  tableName: "images",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde(() => imageMeta, "id", "id") },

    {
      fieldName: "type",
      columnName: "type_id",
      dbType: "int",
      serde: new EnumFieldSerde("type", "type_id", ImageTypes),
    },

    {
      fieldName: "fileName",
      columnName: "file_name",
      dbType: "varchar",
      serde: new SimpleSerde("fileName", "file_name"),
    },
    {
      fieldName: "createdAt",
      columnName: "created_at",
      dbType: "timestamptz",
      serde: new SimpleSerde("createdAt", "created_at"),
    },
    {
      fieldName: "updatedAt",
      columnName: "updated_at",
      dbType: "timestamptz",
      serde: new SimpleSerde("updatedAt", "updated_at"),
    },
    {
      fieldName: "author",
      columnName: "author_id",
      dbType: "int",
      serde: new ForeignKeySerde("author", "author_id", () => authorMeta),
    },

    {
      fieldName: "book",
      columnName: "book_id",
      dbType: "int",
      serde: new ForeignKeySerde("book", "book_id", () => bookMeta),
    },

    {
      fieldName: "publisher",
      columnName: "publisher_id",
      dbType: "int",
      serde: new ForeignKeySerde("publisher", "publisher_id", () => publisherMeta),
    },
  ],
  fields: [
    { kind: "primaryKey", fieldName: "id", required: true },

    {
      kind: "enum",
      fieldName: "type",
      required: true,
      enumDetailType: ImageTypes,
    },

    {
      kind: "primitive",
      fieldName: "fileName",
      derived: false,
      required: true,
      protected: false,
      type: "string",
    },
    {
      kind: "primitive",
      fieldName: "createdAt",
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "m2o",
      fieldName: "author",
      required: false,
      otherMetadata: () => authorMeta,
      otherFieldName: "image",
    },

    {
      kind: "m2o",
      fieldName: "book",
      required: false,
      otherMetadata: () => bookMeta,
      otherFieldName: "image",
    },

    {
      kind: "m2o",
      fieldName: "publisher",
      required: false,
      otherMetadata: () => publisherMeta,
      otherFieldName: "image",
    },
  ],
  config: imageConfig,
  factory: newImage,
};

(Image as any).metadata = imageMeta;

export const publisherMeta: EntityMetadata<Publisher> = {
  cstr: Publisher,
  type: "Publisher",
  tagName: "publisher",
  tableName: "publishers",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde(() => publisherMeta, "id", "id") },

    {
      fieldName: "size",
      columnName: "size_id",
      dbType: "int",
      serde: new EnumFieldSerde("size", "size_id", PublisherSizes),
    },

    {
      fieldName: "name",
      columnName: "name",
      dbType: "varchar",
      serde: new SimpleSerde("name", "name"),
    },
    {
      fieldName: "createdAt",
      columnName: "created_at",
      dbType: "timestamptz",
      serde: new SimpleSerde("createdAt", "created_at"),
    },
    {
      fieldName: "updatedAt",
      columnName: "updated_at",
      dbType: "timestamptz",
      serde: new SimpleSerde("updatedAt", "updated_at"),
    },
  ],
  fields: [
    { kind: "primaryKey", fieldName: "id", required: true },

    {
      kind: "enum",
      fieldName: "size",
      required: false,
      enumDetailType: PublisherSizes,
    },

    {
      kind: "primitive",
      fieldName: "name",
      derived: false,
      required: true,
      protected: false,
      type: "string",
    },
    {
      kind: "primitive",
      fieldName: "createdAt",
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "o2m",
      fieldName: "authors",
      required: false,
      otherMetadata: () => authorMeta,
      otherFieldName: "publisher",
    },

    {
      kind: "o2m",
      fieldName: "bookAdvances",
      required: false,
      otherMetadata: () => bookAdvanceMeta,
      otherFieldName: "publisher",
    },
  ],
  config: publisherConfig,
  factory: newPublisher,
};

(Publisher as any).metadata = publisherMeta;

export const tagMeta: EntityMetadata<Tag> = {
  cstr: Tag,
  type: "Tag",
  tagName: "tag",
  tableName: "tags",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde(() => tagMeta, "id", "id") },

    {
      fieldName: "name",
      columnName: "name",
      dbType: "varchar",
      serde: new SimpleSerde("name", "name"),
    },
    {
      fieldName: "createdAt",
      columnName: "created_at",
      dbType: "timestamptz",
      serde: new SimpleSerde("createdAt", "created_at"),
    },
    {
      fieldName: "updatedAt",
      columnName: "updated_at",
      dbType: "timestamptz",
      serde: new SimpleSerde("updatedAt", "updated_at"),
    },
  ],
  fields: [
    { kind: "primaryKey", fieldName: "id", required: true },

    {
      kind: "primitive",
      fieldName: "name",
      derived: false,
      required: true,
      protected: false,
      type: "string",
    },
    {
      kind: "primitive",
      fieldName: "createdAt",
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "m2m",
      fieldName: "books",
      required: false,
      otherMetadata: () => bookMeta,
      otherFieldName: "tags",
    },
  ],
  config: tagConfig,
  factory: newTag,
};

(Tag as any).metadata = tagMeta;

const allMetadata = [authorMeta, bookMeta, bookAdvanceMeta, bookReviewMeta, imageMeta, publisherMeta, tagMeta];
configureMetadata(allMetadata);
