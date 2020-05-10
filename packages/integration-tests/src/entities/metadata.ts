import { EntityMetadata, PrimaryKeySerde, SimpleSerde, ForeignKeySerde, EnumFieldSerde } from "joist-orm";
import { Author, Book, BookReview, Publisher, Tag, PublisherSizes } from "./entities";

export const authorMeta: EntityMetadata<Author> = {
  cstr: Author,
  type: "Author",
  tableName: "authors",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde("id", "id") },

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
      required: true,
    },
    {
      kind: "primitive",
      fieldName: "lastName",
      required: false,
    },
    {
      kind: "primitive",
      fieldName: "initials",
      derived: true,
      required: false,
    },
    {
      kind: "primitive",
      fieldName: "isPopular",
      required: false,
    },
    {
      kind: "primitive",
      fieldName: "age",
      required: false,
    },
    {
      kind: "primitive",
      fieldName: "wasEverPopular",
      required: false,
    },
    {
      kind: "primitive",
      fieldName: "createdAt",
      required: true,
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      required: true,
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
};

(Author as any).metadata = authorMeta;

export const bookMeta: EntityMetadata<Book> = {
  cstr: Book,
  type: "Book",
  tableName: "books",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde("id", "id") },

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
      required: true,
    },
    {
      kind: "primitive",
      fieldName: "order",
      required: false,
    },
    {
      kind: "primitive",
      fieldName: "createdAt",
      required: true,
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      required: true,
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
};

(Book as any).metadata = bookMeta;

export const bookReviewMeta: EntityMetadata<BookReview> = {
  cstr: BookReview,
  type: "BookReview",
  tableName: "book_reviews",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde("id", "id") },

    {
      fieldName: "rating",
      columnName: "rating",
      dbType: "int",
      serde: new SimpleSerde("rating", "rating"),
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
      required: true,
    },
    {
      kind: "primitive",
      fieldName: "createdAt",
      required: true,
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      required: true,
    },
    {
      kind: "m2o",
      fieldName: "book",
      required: true,
      otherMetadata: () => bookMeta,
      otherFieldName: "reviews",
    },
  ],
};

(BookReview as any).metadata = bookReviewMeta;

export const publisherMeta: EntityMetadata<Publisher> = {
  cstr: Publisher,
  type: "Publisher",
  tableName: "publishers",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde("id", "id") },

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
    },

    {
      kind: "primitive",
      fieldName: "name",
      required: true,
    },
    {
      kind: "primitive",
      fieldName: "createdAt",
      required: true,
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      required: true,
    },
    {
      kind: "o2m",
      fieldName: "authors",
      required: false,
      otherMetadata: () => authorMeta,
      otherFieldName: "publisher",
    },
  ],
};

(Publisher as any).metadata = publisherMeta;

export const tagMeta: EntityMetadata<Tag> = {
  cstr: Tag,
  type: "Tag",
  tableName: "tags",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde("id", "id") },

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
      required: true,
    },
    {
      kind: "primitive",
      fieldName: "createdAt",
      required: true,
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      required: true,
    },
    {
      kind: "m2m",
      fieldName: "books",
      required: false,
      otherMetadata: () => bookMeta,
      otherFieldName: "tags",
    },
  ],
};

(Tag as any).metadata = tagMeta;
