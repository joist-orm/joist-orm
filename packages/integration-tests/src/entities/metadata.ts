import {
  EntityManager as EntityManager1,
  BaseEntity,
  configureMetadata,
  EntityMetadata,
  PrimaryKeySerde,
  EnumArrayFieldSerde,
  SimpleSerde,
  SuperstructSerde,
  ForeignKeySerde,
  EnumFieldSerde,
  PolymorphicKeySerde,
  DecimalToNumberSerde,
} from "joist-orm";
import { Context } from "src/context";
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
  Comment,
  commentConfig,
  newComment,
  Critic,
  criticConfig,
  newCritic,
  Image,
  imageConfig,
  newImage,
  Publisher,
  publisherConfig,
  newPublisher,
  Tag,
  tagConfig,
  newTag,
  Colors,
  AdvanceStatuses,
  ImageTypes,
  PublisherSizes,
  PublisherTypes,
} from "./entities";
import { address } from "src/entities/types";

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
      fieldName: "favoriteColors",
      columnName: "favorite_colors",
      dbType: "int",
      serde: new EnumArrayFieldSerde("favoriteColors", "favorite_colors", Colors),
    },

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
      fieldName: "address",
      columnName: "address",
      dbType: "jsonb",
      serde: new SuperstructSerde("address", "address", address),
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
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true },
    firstName: {
      kind: "primitive",
      fieldName: "firstName",
      fieldIdName: undefined,
      derived: false,
      required: true,
      protected: false,
      type: "string",
    },
    lastName: {
      kind: "primitive",
      fieldName: "lastName",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: false,
      type: "string",
    },
    initials: {
      kind: "primitive",
      fieldName: "initials",
      fieldIdName: undefined,
      derived: "sync",
      required: false,
      protected: false,
      type: "string",
    },
    numberOfBooks: {
      kind: "primitive",
      fieldName: "numberOfBooks",
      fieldIdName: undefined,
      derived: "async",
      required: false,
      protected: false,
      type: "number",
    },
    isPopular: {
      kind: "primitive",
      fieldName: "isPopular",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: false,
      type: "boolean",
    },
    age: {
      kind: "primitive",
      fieldName: "age",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: false,
      type: "number",
    },
    graduated: {
      kind: "primitive",
      fieldName: "graduated",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: false,
      type: "Date",
    },
    wasEverPopular: {
      kind: "primitive",
      fieldName: "wasEverPopular",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: true,
      type: "boolean",
    },
    address: {
      kind: "primitive",
      fieldName: "address",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: false,
      type: "Object",
    },
    createdAt: {
      kind: "primitive",
      fieldName: "createdAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    updatedAt: {
      kind: "primitive",
      fieldName: "updatedAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    favoriteColors: {
      kind: "enum",
      fieldName: "favoriteColors",
      fieldIdName: undefined,
      required: false,
      enumDetailType: Colors,
    },
    mentor: {
      kind: "m2o",
      fieldName: "mentor",
      fieldIdName: "mentorId",
      required: false,
      otherMetadata: () => authorMeta,
      otherFieldName: "authors",
    },
    publisher: {
      kind: "m2o",
      fieldName: "publisher",
      fieldIdName: "publisherId",
      required: false,
      otherMetadata: () => publisherMeta,
      otherFieldName: "authors",
    },
    authors: {
      kind: "o2m",
      fieldName: "authors",
      fieldIdName: "authorIds",
      required: false,
      otherMetadata: () => authorMeta,
      otherFieldName: "mentor",
    },
    books: {
      kind: "o2m",
      fieldName: "books",
      fieldIdName: "bookIds",
      required: false,
      otherMetadata: () => bookMeta,
      otherFieldName: "author",
    },
    image: {
      kind: "o2o",
      fieldName: "image",
      fieldIdName: "imageId",
      required: false,
      otherMetadata: () => imageMeta,
      otherFieldName: "author",
    },
  },
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
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true },
    title: {
      kind: "primitive",
      fieldName: "title",
      fieldIdName: undefined,
      derived: false,
      required: true,
      protected: false,
      type: "string",
    },
    order: {
      kind: "primitive",
      fieldName: "order",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: false,
      type: "number",
    },
    createdAt: {
      kind: "primitive",
      fieldName: "createdAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    updatedAt: {
      kind: "primitive",
      fieldName: "updatedAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    author: {
      kind: "m2o",
      fieldName: "author",
      fieldIdName: "authorId",
      required: true,
      otherMetadata: () => authorMeta,
      otherFieldName: "books",
    },
    advances: {
      kind: "o2m",
      fieldName: "advances",
      fieldIdName: "advanceIds",
      required: false,
      otherMetadata: () => bookAdvanceMeta,
      otherFieldName: "book",
    },
    reviews: {
      kind: "o2m",
      fieldName: "reviews",
      fieldIdName: "reviewIds",
      required: false,
      otherMetadata: () => bookReviewMeta,
      otherFieldName: "book",
    },
    comments: {
      kind: "o2m",
      fieldName: "comments",
      fieldIdName: "commentIds",
      required: false,
      otherMetadata: () => commentMeta,
      otherFieldName: "parent",
    },
    tags: {
      kind: "m2m",
      fieldName: "tags",
      fieldIdName: "tagIds",
      required: false,
      otherMetadata: () => tagMeta,
      otherFieldName: "books",
    },
    image: {
      kind: "o2o",
      fieldName: "image",
      fieldIdName: "imageId",
      required: false,
      otherMetadata: () => imageMeta,
      otherFieldName: "book",
    },
  },
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
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true },
    createdAt: {
      kind: "primitive",
      fieldName: "createdAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    updatedAt: {
      kind: "primitive",
      fieldName: "updatedAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    status: {
      kind: "enum",
      fieldName: "status",
      fieldIdName: undefined,
      required: true,
      enumDetailType: AdvanceStatuses,
    },
    book: {
      kind: "m2o",
      fieldName: "book",
      fieldIdName: "bookId",
      required: true,
      otherMetadata: () => bookMeta,
      otherFieldName: "advances",
    },
    publisher: {
      kind: "m2o",
      fieldName: "publisher",
      fieldIdName: "publisherId",
      required: true,
      otherMetadata: () => publisherMeta,
      otherFieldName: "bookAdvances",
    },
  },
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
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true },
    rating: {
      kind: "primitive",
      fieldName: "rating",
      fieldIdName: undefined,
      derived: false,
      required: true,
      protected: false,
      type: "number",
    },
    isPublic: {
      kind: "primitive",
      fieldName: "isPublic",
      fieldIdName: undefined,
      derived: "async",
      required: false,
      protected: false,
      type: "boolean",
    },
    createdAt: {
      kind: "primitive",
      fieldName: "createdAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    updatedAt: {
      kind: "primitive",
      fieldName: "updatedAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    book: {
      kind: "m2o",
      fieldName: "book",
      fieldIdName: "bookId",
      required: true,
      otherMetadata: () => bookMeta,
      otherFieldName: "reviews",
    },
    comment: {
      kind: "o2o",
      fieldName: "comment",
      fieldIdName: "commentId",
      required: false,
      otherMetadata: () => commentMeta,
      otherFieldName: "parent",
    },
  },
  config: bookReviewConfig,
  factory: newBookReview,
};

(BookReview as any).metadata = bookReviewMeta;

export const commentMeta: EntityMetadata<Comment> = {
  cstr: Comment,
  type: "Comment",
  tagName: "comment",
  tableName: "comments",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde(() => commentMeta, "id", "id") },

    {
      fieldName: "text",
      columnName: "text",
      dbType: "text",
      serde: new SimpleSerde("text", "text"),
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
      fieldName: "parent",
      columnName: "parent_book_id",
      dbType: "int",
      serde: new PolymorphicKeySerde("parent", "parent_book_id", () => bookMeta),
    },

    {
      fieldName: "parent",
      columnName: "parent_book_review_id",
      dbType: "int",
      serde: new PolymorphicKeySerde("parent", "parent_book_review_id", () => bookReviewMeta),
    },
  ],
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true },
    text: {
      kind: "primitive",
      fieldName: "text",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: false,
      type: "string",
    },
    createdAt: {
      kind: "primitive",
      fieldName: "createdAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    updatedAt: {
      kind: "primitive",
      fieldName: "updatedAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    parent: {
      kind: "poly",
      fieldName: "parent",
      fieldIdName: "parentId",
      required: true,
      components: [
        {
          otherMetadata: () => bookMeta,
          otherFieldName: "comments",
          columnName: "parent_book_id",
        },
        {
          otherMetadata: () => bookReviewMeta,
          otherFieldName: "comment",
          columnName: "parent_book_review_id",
        },
      ],
    },
  },
  config: commentConfig,
  factory: newComment,
};

(Comment as any).metadata = commentMeta;

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
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true },
    name: {
      kind: "primitive",
      fieldName: "name",
      fieldIdName: undefined,
      derived: false,
      required: true,
      protected: false,
      type: "string",
    },
    createdAt: {
      kind: "primitive",
      fieldName: "createdAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    updatedAt: {
      kind: "primitive",
      fieldName: "updatedAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
  },
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
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true },
    fileName: {
      kind: "primitive",
      fieldName: "fileName",
      fieldIdName: undefined,
      derived: false,
      required: true,
      protected: false,
      type: "string",
    },
    createdAt: {
      kind: "primitive",
      fieldName: "createdAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    updatedAt: {
      kind: "primitive",
      fieldName: "updatedAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    type: {
      kind: "enum",
      fieldName: "type",
      fieldIdName: undefined,
      required: true,
      enumDetailType: ImageTypes,
    },
    author: {
      kind: "m2o",
      fieldName: "author",
      fieldIdName: "authorId",
      required: false,
      otherMetadata: () => authorMeta,
      otherFieldName: "image",
    },
    book: {
      kind: "m2o",
      fieldName: "book",
      fieldIdName: "bookId",
      required: false,
      otherMetadata: () => bookMeta,
      otherFieldName: "image",
    },
    publisher: {
      kind: "m2o",
      fieldName: "publisher",
      fieldIdName: "publisherId",
      required: false,
      otherMetadata: () => publisherMeta,
      otherFieldName: "images",
    },
  },
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
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true },
    name: {
      kind: "primitive",
      fieldName: "name",
      fieldIdName: undefined,
      derived: false,
      required: true,
      protected: false,
      type: "string",
    },
    latitude: {
      kind: "primitive",
      fieldName: "latitude",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: false,
      type: "number",
    },
    longitude: {
      kind: "primitive",
      fieldName: "longitude",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: false,
      type: "number",
    },
    hugeNumber: {
      kind: "primitive",
      fieldName: "hugeNumber",
      fieldIdName: undefined,
      derived: false,
      required: false,
      protected: false,
      type: "number",
    },
    createdAt: {
      kind: "primitive",
      fieldName: "createdAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    updatedAt: {
      kind: "primitive",
      fieldName: "updatedAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    size: {
      kind: "enum",
      fieldName: "size",
      fieldIdName: undefined,
      required: false,
      enumDetailType: PublisherSizes,
    },
    type: {
      kind: "enum",
      fieldName: "type",
      fieldIdName: undefined,
      required: false,
      enumDetailType: PublisherTypes,
    },
    authors: {
      kind: "o2m",
      fieldName: "authors",
      fieldIdName: "authorIds",
      required: false,
      otherMetadata: () => authorMeta,
      otherFieldName: "publisher",
    },
    bookAdvances: {
      kind: "o2m",
      fieldName: "bookAdvances",
      fieldIdName: "bookAdvanceIds",
      required: false,
      otherMetadata: () => bookAdvanceMeta,
      otherFieldName: "publisher",
    },
    images: {
      kind: "o2m",
      fieldName: "images",
      fieldIdName: "imageIds",
      required: false,
      otherMetadata: () => imageMeta,
      otherFieldName: "publisher",
    },
  },
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
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true },
    name: {
      kind: "primitive",
      fieldName: "name",
      fieldIdName: undefined,
      derived: false,
      required: true,
      protected: false,
      type: "string",
    },
    createdAt: {
      kind: "primitive",
      fieldName: "createdAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    updatedAt: {
      kind: "primitive",
      fieldName: "updatedAt",
      fieldIdName: undefined,
      derived: "orm",
      required: false,
      protected: false,
      type: "Date",
    },
    books: {
      kind: "m2m",
      fieldName: "books",
      fieldIdName: "bookIds",
      required: false,
      otherMetadata: () => bookMeta,
      otherFieldName: "tags",
    },
  },
  config: tagConfig,
  factory: newTag,
};

(Tag as any).metadata = tagMeta;

export const allMetadata = [
  authorMeta,
  bookMeta,
  bookAdvanceMeta,
  bookReviewMeta,
  commentMeta,
  criticMeta,
  imageMeta,
  publisherMeta,
  tagMeta,
];
configureMetadata(allMetadata);
