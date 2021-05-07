import {
  BaseEntity,
  configureMetadata,
  DecimalToNumberSerde,
  EntityManager as EntityManager1,
  EntityMetadata,
  EnumFieldSerde,
  ForeignKeySerde,
  PrimaryKeySerde,
  SimpleSerde,
} from "joist-orm";
import { Context } from "src/context";
import {
  AdvanceStatuses,
  Author,
  authorConfig,
  Book,
  BookAdvance,
  bookAdvanceConfig,
  bookConfig,
  BookReview,
  bookReviewConfig,
  Critic,
  criticConfig,
  Image,
  imageConfig,
  ImageTypes,
  newAuthor,
  newBook,
  newBookAdvance,
  newBookReview,
  newCritic,
  newImage,
  newPublisher,
  newTag,
  Publisher,
  publisherConfig,
  PublisherSizes,
  PublisherTypes,
  Tag,
  tagConfig,
} from "./entities";

export class EntityManager extends EntityManager1<Context> {}

export function getEm(e: BaseEntity): EntityManager {
  return e.__orm.em as EntityManager;
}

export const authorMeta: EntityMetadata<Author> = {
  cstr: Author,
  type: "Author",
  tagName: "a",
  tableName: "authors",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde(() => authorMeta, "id", "id") },

    {
      fieldName: "firstName",
      columnName: "first_name",
      dbType: "character varying",
      serde: new SimpleSerde("firstName", "first_name"),
    },
    {
      fieldName: "lastName",
      columnName: "last_name",
      dbType: "character varying",
      serde: new SimpleSerde("lastName", "last_name"),
    },
    {
      fieldName: "initials",
      columnName: "initials",
      dbType: "character varying",
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
      dbType: "boolean",
      serde: new SimpleSerde("isPopular", "is_popular"),
    },
    {
      fieldName: "age",
      columnName: "age",
      dbType: "int",
      serde: new SimpleSerde("age", "age"),
    },
    {
      fieldName: "graduated",
      columnName: "graduated",
      dbType: "date",
      serde: new SimpleSerde("graduated", "graduated"),
    },
    {
      fieldName: "wasEverPopular",
      columnName: "was_ever_popular",
      dbType: "boolean",
      serde: new SimpleSerde("wasEverPopular", "was_ever_popular"),
    },
    {
      fieldName: "createdAt",
      columnName: "created_at",
      dbType: "timestamp with time zone",
      serde: new SimpleSerde("createdAt", "created_at"),
    },
    {
      fieldName: "updatedAt",
      columnName: "updated_at",
      dbType: "timestamp with time zone",
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
    { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true },

    {
      kind: "primitive",
      fieldName: "firstName",
      fieldIdName: undefined,
      derived: false,
      required: true,
      protected: false,
      type: "string",
    },
    {
      kind: "primitive",
      fieldName: "lastName",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: false,
      type: "string",
    },
    {
      kind: "primitive",
      fieldName: "initials",
      fieldIdName: undefined,
      derived: "sync",
      required: false,
      protected: false,
      type: "string",
    },
    {
      kind: "primitive",
      fieldName: "numberOfBooks",
      fieldIdName: undefined,
      derived: "async",
      required: false,
      protected: false,
      type: "number",
    },
    {
      kind: "primitive",
      fieldName: "isPopular",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: false,
      type: "boolean",
    },
    {
      kind: "primitive",
      fieldName: "age",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: false,
      type: "number",
    },
    {
      kind: "primitive",
      fieldName: "graduated",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "primitive",
      fieldName: "wasEverPopular",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: true,
      type: "boolean",
    },
    {
      kind: "primitive",
      fieldName: "createdAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "m2o",
      fieldName: "mentor",
      fieldIdName: "mentorId",
      required: false,
      otherMetadata: () => authorMeta,
      otherFieldName: "authors",
    },

    {
      kind: "m2o",
      fieldName: "publisher",
      fieldIdName: "publisherId",
      required: false,
      otherMetadata: () => publisherMeta,
      otherFieldName: "authors",
    },

    {
      kind: "o2m",
      fieldName: "authors",
      fieldIdName: "authorIds",
      required: false,
      otherMetadata: () => authorMeta,
      otherFieldName: "mentor",
    },

    {
      kind: "o2m",
      fieldName: "books",
      fieldIdName: "bookIds",
      required: false,
      otherMetadata: () => bookMeta,
      otherFieldName: "author",
    },

    {
      kind: "o2o",
      fieldName: "image",
      fieldIdName: "imageId",
      required: false,
      otherMetadata: () => imageMeta,
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
  tagName: "b",
  tableName: "books",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde(() => bookMeta, "id", "id") },

    {
      fieldName: "title",
      columnName: "title",
      dbType: "character varying",
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
      dbType: "timestamp with time zone",
      serde: new SimpleSerde("createdAt", "created_at"),
    },
    {
      fieldName: "updatedAt",
      columnName: "updated_at",
      dbType: "timestamp with time zone",
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
    { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true },

    {
      kind: "primitive",
      fieldName: "title",
      fieldIdName: undefined,
      derived: false,
      required: true,
      protected: false,
      type: "string",
    },
    {
      kind: "primitive",
      fieldName: "order",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: false,
      type: "number",
    },
    {
      kind: "primitive",
      fieldName: "createdAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "m2o",
      fieldName: "author",
      fieldIdName: "authorId",
      required: true,
      otherMetadata: () => authorMeta,
      otherFieldName: "books",
    },

    {
      kind: "o2m",
      fieldName: "advances",
      fieldIdName: "advanceIds",
      required: false,
      otherMetadata: () => bookAdvanceMeta,
      otherFieldName: "book",
    },

    {
      kind: "o2m",
      fieldName: "reviews",
      fieldIdName: "reviewIds",
      required: false,
      otherMetadata: () => bookReviewMeta,
      otherFieldName: "book",
    },

    {
      kind: "m2m",
      fieldName: "tags",
      fieldIdName: "tagIds",
      required: false,
      otherMetadata: () => tagMeta,
      otherFieldName: "books",
    },

    {
      kind: "o2o",
      fieldName: "image",
      fieldIdName: "imageId",
      required: false,
      otherMetadata: () => imageMeta,
      otherFieldName: "book",
    },
  ],
  config: bookConfig,
  factory: newBook,
};

(Book as any).metadata = bookMeta;

export const bookAdvanceMeta: EntityMetadata<BookAdvance> = {
  cstr: BookAdvance,
  type: "BookAdvance",
  tagName: "ba",
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
      dbType: "timestamp with time zone",
      serde: new SimpleSerde("createdAt", "created_at"),
    },
    {
      fieldName: "updatedAt",
      columnName: "updated_at",
      dbType: "timestamp with time zone",
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
    { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true },

    {
      kind: "enum",
      fieldName: "status",
      fieldIdName: undefined,
      required: true,
      enumDetailType: AdvanceStatuses,
    },

    {
      kind: "primitive",
      fieldName: "createdAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "m2o",
      fieldName: "book",
      fieldIdName: "bookId",
      required: true,
      otherMetadata: () => bookMeta,
      otherFieldName: "advances",
    },

    {
      kind: "m2o",
      fieldName: "publisher",
      fieldIdName: "publisherId",
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
  tagName: "br",
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
      dbType: "boolean",
      serde: new SimpleSerde("isPublic", "is_public"),
    },
    {
      fieldName: "createdAt",
      columnName: "created_at",
      dbType: "timestamp with time zone",
      serde: new SimpleSerde("createdAt", "created_at"),
    },
    {
      fieldName: "updatedAt",
      columnName: "updated_at",
      dbType: "timestamp with time zone",
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
    { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true },

    {
      kind: "primitive",
      fieldName: "rating",
      fieldIdName: undefined,
      derived: false,
      required: true,
      protected: false,
      type: "number",
    },
    {
      kind: "primitive",
      fieldName: "isPublic",
      fieldIdName: undefined,
      derived: "async",
      required: false,
      protected: false,
      type: "boolean",
    },
    {
      kind: "primitive",
      fieldName: "createdAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "m2o",
      fieldName: "book",
      fieldIdName: "bookId",
      required: true,
      otherMetadata: () => bookMeta,
      otherFieldName: "reviews",
    },
  ],
  config: bookReviewConfig,
  factory: newBookReview,
};

(BookReview as any).metadata = bookReviewMeta;

export const criticMeta: EntityMetadata<Critic> = {
  cstr: Critic,
  type: "Critic",
  tagName: "c",
  tableName: "critics",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde(() => criticMeta, "id", "id") },

    {
      fieldName: "name",
      columnName: "name",
      dbType: "character varying",
      serde: new SimpleSerde("name", "name"),
    },
    {
      fieldName: "createdAt",
      columnName: "created_at",
      dbType: "timestamp with time zone",
      serde: new SimpleSerde("createdAt", "created_at"),
    },
    {
      fieldName: "updatedAt",
      columnName: "updated_at",
      dbType: "timestamp with time zone",
      serde: new SimpleSerde("updatedAt", "updated_at"),
    },
  ],
  fields: [
    { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true },

    {
      kind: "primitive",
      fieldName: "name",
      fieldIdName: undefined,
      derived: false,
      required: true,
      protected: false,
      type: "string",
    },
    {
      kind: "primitive",
      fieldName: "createdAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
  ],
  config: criticConfig,
  factory: newCritic,
};

(Critic as any).metadata = criticMeta;

export const imageMeta: EntityMetadata<Image> = {
  cstr: Image,
  type: "Image",
  tagName: "i",
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
      dbType: "character varying",
      serde: new SimpleSerde("fileName", "file_name"),
    },
    {
      fieldName: "createdAt",
      columnName: "created_at",
      dbType: "timestamp with time zone",
      serde: new SimpleSerde("createdAt", "created_at"),
    },
    {
      fieldName: "updatedAt",
      columnName: "updated_at",
      dbType: "timestamp with time zone",
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
    { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true },

    {
      kind: "enum",
      fieldName: "type",
      fieldIdName: undefined,
      required: true,
      enumDetailType: ImageTypes,
    },

    {
      kind: "primitive",
      fieldName: "fileName",
      fieldIdName: undefined,
      derived: false,
      required: true,
      protected: false,
      type: "string",
    },
    {
      kind: "primitive",
      fieldName: "createdAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "m2o",
      fieldName: "author",
      fieldIdName: "authorId",
      required: false,
      otherMetadata: () => authorMeta,
      otherFieldName: "image",
    },

    {
      kind: "m2o",
      fieldName: "book",
      fieldIdName: "bookId",
      required: false,
      otherMetadata: () => bookMeta,
      otherFieldName: "image",
    },

    {
      kind: "m2o",
      fieldName: "publisher",
      fieldIdName: "publisherId",
      required: false,
      otherMetadata: () => publisherMeta,
      otherFieldName: "images",
    },
  ],
  config: imageConfig,
  factory: newImage,
};

(Image as any).metadata = imageMeta;

export const publisherMeta: EntityMetadata<Publisher> = {
  cstr: Publisher,
  type: "Publisher",
  tagName: "p",
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
      fieldName: "type",
      columnName: "type_id",
      dbType: "int",
      serde: new EnumFieldSerde("type", "type_id", PublisherTypes),
    },

    {
      fieldName: "name",
      columnName: "name",
      dbType: "character varying",
      serde: new SimpleSerde("name", "name"),
    },
    {
      fieldName: "latitude",
      columnName: "latitude",
      dbType: "numeric",
      serde: new DecimalToNumberSerde("latitude", "latitude"),
    },
    {
      fieldName: "longitude",
      columnName: "longitude",
      dbType: "numeric",
      serde: new DecimalToNumberSerde("longitude", "longitude"),
    },
    {
      fieldName: "hugeNumber",
      columnName: "huge_number",
      dbType: "numeric",
      serde: new DecimalToNumberSerde("hugeNumber", "huge_number"),
    },
    {
      fieldName: "createdAt",
      columnName: "created_at",
      dbType: "timestamp with time zone",
      serde: new SimpleSerde("createdAt", "created_at"),
    },
    {
      fieldName: "updatedAt",
      columnName: "updated_at",
      dbType: "timestamp with time zone",
      serde: new SimpleSerde("updatedAt", "updated_at"),
    },
  ],
  fields: [
    { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true },

    {
      kind: "enum",
      fieldName: "size",
      fieldIdName: undefined,
      required: false,
      enumDetailType: PublisherSizes,
    },

    {
      kind: "enum",
      fieldName: "type",
      fieldIdName: undefined,
      required: false,
      enumDetailType: PublisherTypes,
    },

    {
      kind: "primitive",
      fieldName: "name",
      fieldIdName: undefined,
      derived: false,
      required: true,
      protected: false,
      type: "string",
    },
    {
      kind: "primitive",
      fieldName: "latitude",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: false,
      type: "number",
    },
    {
      kind: "primitive",
      fieldName: "longitude",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: false,
      type: "number",
    },
    {
      kind: "primitive",
      fieldName: "hugeNumber",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: false,
      type: "number",
    },
    {
      kind: "primitive",
      fieldName: "createdAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "o2m",
      fieldName: "authors",
      fieldIdName: "authorIds",
      required: false,
      otherMetadata: () => authorMeta,
      otherFieldName: "publisher",
    },

    {
      kind: "o2m",
      fieldName: "bookAdvances",
      fieldIdName: "bookAdvanceIds",
      required: false,
      otherMetadata: () => bookAdvanceMeta,
      otherFieldName: "publisher",
    },

    {
      kind: "o2m",
      fieldName: "images",
      fieldIdName: "imageIds",
      required: false,
      otherMetadata: () => imageMeta,
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
  tagName: "t",
  tableName: "tags",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde(() => tagMeta, "id", "id") },

    {
      fieldName: "name",
      columnName: "name",
      dbType: "character varying",
      serde: new SimpleSerde("name", "name"),
    },
    {
      fieldName: "createdAt",
      columnName: "created_at",
      dbType: "timestamp with time zone",
      serde: new SimpleSerde("createdAt", "created_at"),
    },
    {
      fieldName: "updatedAt",
      columnName: "updated_at",
      dbType: "timestamp with time zone",
      serde: new SimpleSerde("updatedAt", "updated_at"),
    },
  ],
  fields: [
    { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true },

    {
      kind: "primitive",
      fieldName: "name",
      fieldIdName: undefined,
      derived: false,
      required: true,
      protected: false,
      type: "string",
    },
    {
      kind: "primitive",
      fieldName: "createdAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "primitive",
      fieldName: "updatedAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    {
      kind: "m2m",
      fieldName: "books",
      fieldIdName: "bookIds",
      required: false,
      otherMetadata: () => bookMeta,
      otherFieldName: "tags",
    },
  ],
  config: tagConfig,
  factory: newTag,
};

(Tag as any).metadata = tagMeta;

export const allMetadata = [
  authorMeta,
  bookMeta,
  bookAdvanceMeta,
  bookReviewMeta,
  criticMeta,
  imageMeta,
  publisherMeta,
  tagMeta,
];
configureMetadata(allMetadata);
