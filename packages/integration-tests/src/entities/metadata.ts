import { BaseEntity, configureMetadata, DecimalToNumberSerde, EntityManager as EntityManager1, EntityMetadata, EnumArrayFieldSerde, EnumFieldSerde, KeySerde, PolymorphicKeySerde, PrimitiveSerde, SuperstructSerde } from "joist-orm";
import { Context } from "src/context";
import { address } from "src/entities/types";
import {
  AdvanceStatuses,
  Author,
  authorConfig,
  AuthorStat,
  authorStatConfig,
  Book,
  BookAdvance,
  bookAdvanceConfig,
  bookConfig,
  BookReview,
  bookReviewConfig,
  Colors,
  Comment,
  commentConfig,
  Critic,
  CriticColumn,
  criticColumnConfig,
  criticConfig,
  Image,
  imageConfig,
  ImageTypes,
  LargePublisher,
  largePublisherConfig,
  newAuthor,
  newAuthorStat,
  newBook,
  newBookAdvance,
  newBookReview,
  newComment,
  newCritic,
  newCriticColumn,
  newImage,
  newLargePublisher,
  newPublisher,
  newPublisherGroup,
  newSmallPublisher,
  newTag,
  newUser,
  Publisher,
  publisherConfig,
  PublisherGroup,
  publisherGroupConfig,
  PublisherSizes,
  PublisherTypes,
  SmallPublisher,
  smallPublisherConfig,
  Tag,
  tagConfig,
  User,
  userConfig,
} from "./entities";

export class EntityManager extends EntityManager1<Context> {}

export function getEm(e: BaseEntity): EntityManager {
  return e.em as EntityManager;
}

export const authorMeta: EntityMetadata<Author> = {
  cstr: Author,
  type: "Author",
  baseType: undefined,
  idType: "int",
  idTagged: true,
  tagName: "a",
  tableName: "authors",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "int", tagName: "a" }), immutable: true },
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "firstName", columnName: "first_name", dbType: "character varying", tagName: "a" }), immutable: false },
    "lastName": { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "lastName", columnName: "last_name", dbType: "character varying", tagName: "a" }), immutable: false },
    "ssn": { kind: "primitive", fieldName: "ssn", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "ssn", columnName: "ssn", dbType: "character varying", tagName: "a" }), immutable: false },
    "initials": { kind: "primitive", fieldName: "initials", fieldIdName: undefined, derived: "sync", required: false, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "initials", columnName: "initials", dbType: "character varying", tagName: "a" }), immutable: false },
    "numberOfBooks": { kind: "primitive", fieldName: "numberOfBooks", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "number", serde: new PrimitiveSerde({ fieldName: "numberOfBooks", columnName: "number_of_books", dbType: "int", tagName: "a" }), immutable: false },
    "bookComments": { kind: "primitive", fieldName: "bookComments", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "bookComments", columnName: "book_comments", dbType: "text", tagName: "a" }), immutable: false },
    "isPopular": { kind: "primitive", fieldName: "isPopular", fieldIdName: undefined, derived: false, required: false, protected: false, type: "boolean", serde: new PrimitiveSerde({ fieldName: "isPopular", columnName: "is_popular", dbType: "boolean", tagName: "a" }), immutable: false },
    "age": { kind: "primitive", fieldName: "age", fieldIdName: undefined, derived: false, required: false, protected: false, type: "number", serde: new PrimitiveSerde({ fieldName: "age", columnName: "age", dbType: "int", tagName: "a" }), immutable: false },
    "graduated": { kind: "primitive", fieldName: "graduated", fieldIdName: undefined, derived: false, required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "graduated", columnName: "graduated", dbType: "date", tagName: "a" }), immutable: false },
    "wasEverPopular": { kind: "primitive", fieldName: "wasEverPopular", fieldIdName: undefined, derived: false, required: false, protected: true, type: "boolean", serde: new PrimitiveSerde({ fieldName: "wasEverPopular", columnName: "was_ever_popular", dbType: "boolean", tagName: "a" }), immutable: false },
    "address": { kind: "primitive", fieldName: "address", fieldIdName: undefined, derived: false, required: false, protected: false, type: "Object", serde: new SuperstructSerde({ fieldName: "address", columnName: "address", dbType: "jsonb", tagName: "a", superstruct: address }), immutable: false },
    "deletedAt": { kind: "primitive", fieldName: "deletedAt", fieldIdName: undefined, derived: false, required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "deletedAt", columnName: "deleted_at", dbType: "timestamp with time zone", tagName: "a" }), immutable: false },
    "numberOfPublicReviews": { kind: "primitive", fieldName: "numberOfPublicReviews", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "number", serde: new PrimitiveSerde({ fieldName: "numberOfPublicReviews", columnName: "number_of_public_reviews", dbType: "int", tagName: "a" }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "createdAt", columnName: "created_at", dbType: "timestamp with time zone", tagName: "a" }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "updatedAt", columnName: "updated_at", dbType: "timestamp with time zone", tagName: "a" }), immutable: false },
    "favoriteShape": { kind: "primitive", fieldName: "favoriteShape", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "favoriteShape", columnName: "favorite_shape", dbType: "FavoriteShape", tagName: "a" }), immutable: false },
    "favoriteColors": { kind: "enum", fieldName: "favoriteColors", fieldIdName: undefined, required: false, enumDetailType: Colors, serde: new EnumArrayFieldSerde({ fieldName: "favoriteColors", columnName: "favorite_colors", dbType: "Color", tagName: "a", enumObject: Colors }), immutable: false },
    "mentor": { kind: "m2o", fieldName: "mentor", fieldIdName: "mentorId", derived: false, required: false, otherMetadata: () => authorMeta, otherFieldName: "authors", serde: new KeySerde({ fieldName: "mentor", columnName: "mentor_id", dbType: "int", tagName: "a", otherTagName: "a" }), immutable: false },
    "currentDraftBook": { kind: "m2o", fieldName: "currentDraftBook", fieldIdName: "currentDraftBookId", derived: false, required: false, otherMetadata: () => bookMeta, otherFieldName: "currentDraftAuthor", serde: new KeySerde({ fieldName: "currentDraftBook", columnName: "current_draft_book_id", dbType: "int", tagName: "a", otherTagName: "b" }), immutable: false },
    "favoriteBook": { kind: "m2o", fieldName: "favoriteBook", fieldIdName: "favoriteBookId", derived: "async", required: false, otherMetadata: () => bookMeta, otherFieldName: "favoriteBookAuthors", serde: new KeySerde({ fieldName: "favoriteBook", columnName: "favorite_book_id", dbType: "int", tagName: "a", otherTagName: "b" }), immutable: false },
    "publisher": { kind: "m2o", fieldName: "publisher", fieldIdName: "publisherId", derived: false, required: false, otherMetadata: () => publisherMeta, otherFieldName: "authors", serde: new KeySerde({ fieldName: "publisher", columnName: "publisher_id", dbType: "int", tagName: "a", otherTagName: "p" }), immutable: false },
    "authors": { kind: "o2m", fieldName: "authors", fieldIdName: "authorIds", required: false, otherMetadata: () => authorMeta, otherFieldName: "mentor", serde: undefined, immutable: false },
    "books": { kind: "o2m", fieldName: "books", fieldIdName: "bookIds", required: false, otherMetadata: () => bookMeta, otherFieldName: "author", serde: undefined, immutable: false },
    "comments": { kind: "o2m", fieldName: "comments", fieldIdName: "commentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "parent", serde: undefined, immutable: false },
    "tags": { kind: "m2m", fieldName: "tags", fieldIdName: "tagIds", required: false, otherMetadata: () => tagMeta, otherFieldName: "authors", serde: undefined, immutable: false, joinTableName: "authors_to_tags", columnNames: ["author_id", "tag_id"] },
    "image": { kind: "o2o", fieldName: "image", fieldIdName: "imageId", required: false, otherMetadata: () => imageMeta, otherFieldName: "author", serde: undefined, immutable: false },
    "userOneToOne": { kind: "o2o", fieldName: "userOneToOne", fieldIdName: "userOneToOneId", required: false, otherMetadata: () => userMeta, otherFieldName: "authorManyToOne", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: "deletedAt" },
  config: authorConfig,
  factory: newAuthor,
  baseTypes: [],
  subTypes: [],
};

(Author as any).metadata = authorMeta;

export const authorStatMeta: EntityMetadata<AuthorStat> = {
  cstr: AuthorStat,
  type: "AuthorStat",
  baseType: undefined,
  idType: "int",
  idTagged: true,
  tagName: "as",
  tableName: "author_stats",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "int", tagName: "as" }), immutable: true },
    "smallint": { kind: "primitive", fieldName: "smallint", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde({ fieldName: "smallint", columnName: "smallint", dbType: "smallint", tagName: "as" }), immutable: false },
    "integer": { kind: "primitive", fieldName: "integer", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde({ fieldName: "integer", columnName: "integer", dbType: "int", tagName: "as" }), immutable: false },
    "nullableInteger": { kind: "primitive", fieldName: "nullableInteger", fieldIdName: undefined, derived: false, required: false, protected: false, type: "number", serde: new PrimitiveSerde({ fieldName: "nullableInteger", columnName: "nullable_integer", dbType: "int", tagName: "as" }), immutable: false },
    "bigint": { kind: "primitive", fieldName: "bigint", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde({ fieldName: "bigint", columnName: "bigint", dbType: "bigint", tagName: "as" }), immutable: false },
    "decimal": { kind: "primitive", fieldName: "decimal", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new DecimalToNumberSerde({ fieldName: "decimal", columnName: "decimal", dbType: "numeric", tagName: "as" }), immutable: false },
    "real": { kind: "primitive", fieldName: "real", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde({ fieldName: "real", columnName: "real", dbType: "real", tagName: "as" }), immutable: false },
    "smallserial": { kind: "primitive", fieldName: "smallserial", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde({ fieldName: "smallserial", columnName: "smallserial", dbType: "smallint", tagName: "as" }), immutable: false },
    "serial": { kind: "primitive", fieldName: "serial", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde({ fieldName: "serial", columnName: "serial", dbType: "int", tagName: "as" }), immutable: false },
    "bigserial": { kind: "primitive", fieldName: "bigserial", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde({ fieldName: "bigserial", columnName: "bigserial", dbType: "bigint", tagName: "as" }), immutable: false },
    "doublePrecision": { kind: "primitive", fieldName: "doublePrecision", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde({ fieldName: "doublePrecision", columnName: "double_precision", dbType: "double precision", tagName: "as" }), immutable: false },
    "nullableText": { kind: "primitive", fieldName: "nullableText", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "nullableText", columnName: "nullable_text", dbType: "text", tagName: "as" }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "createdAt", columnName: "created_at", dbType: "timestamp with time zone", tagName: "as" }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "updatedAt", columnName: "updated_at", dbType: "timestamp with time zone", tagName: "as" }), immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: authorStatConfig,
  factory: newAuthorStat,
  baseTypes: [],
  subTypes: [],
};

(AuthorStat as any).metadata = authorStatMeta;

export const bookMeta: EntityMetadata<Book> = {
  cstr: Book,
  type: "Book",
  baseType: undefined,
  idType: "int",
  idTagged: true,
  tagName: "b",
  tableName: "books",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "int", tagName: "b" }), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "title", columnName: "title", dbType: "character varying", tagName: "b" }), immutable: false },
    "order": { kind: "primitive", fieldName: "order", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde({ fieldName: "order", columnName: "order", dbType: "int", tagName: "b" }), immutable: false },
    "deletedAt": { kind: "primitive", fieldName: "deletedAt", fieldIdName: undefined, derived: false, required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "deletedAt", columnName: "deleted_at", dbType: "timestamp with time zone", tagName: "b" }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "createdAt", columnName: "created_at", dbType: "timestamp with time zone", tagName: "b" }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "updatedAt", columnName: "updated_at", dbType: "timestamp with time zone", tagName: "b" }), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: true, otherMetadata: () => authorMeta, otherFieldName: "books", serde: new KeySerde({ fieldName: "author", columnName: "author_id", dbType: "int", tagName: "b", otherTagName: "a" }), immutable: false },
    "advances": { kind: "o2m", fieldName: "advances", fieldIdName: "advanceIds", required: false, otherMetadata: () => bookAdvanceMeta, otherFieldName: "book", serde: undefined, immutable: false },
    "reviews": { kind: "o2m", fieldName: "reviews", fieldIdName: "reviewIds", required: false, otherMetadata: () => bookReviewMeta, otherFieldName: "book", serde: undefined, immutable: false },
    "comments": { kind: "o2m", fieldName: "comments", fieldIdName: "commentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "parent", serde: undefined, immutable: false },
    "tags": { kind: "m2m", fieldName: "tags", fieldIdName: "tagIds", required: false, otherMetadata: () => tagMeta, otherFieldName: "books", serde: undefined, immutable: false, joinTableName: "books_to_tags", columnNames: ["book_id", "tag_id"] },
    "currentDraftAuthor": { kind: "o2o", fieldName: "currentDraftAuthor", fieldIdName: "currentDraftAuthorId", required: false, otherMetadata: () => authorMeta, otherFieldName: "currentDraftBook", serde: undefined, immutable: false },
    "image": { kind: "o2o", fieldName: "image", fieldIdName: "imageId", required: false, otherMetadata: () => imageMeta, otherFieldName: "book", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: "title",
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: "deletedAt" },
  config: bookConfig,
  factory: newBook,
  baseTypes: [],
  subTypes: [],
};

(Book as any).metadata = bookMeta;

export const bookAdvanceMeta: EntityMetadata<BookAdvance> = {
  cstr: BookAdvance,
  type: "BookAdvance",
  baseType: undefined,
  idType: "int",
  idTagged: true,
  tagName: "ba",
  tableName: "book_advances",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "int", tagName: "ba" }), immutable: true },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "createdAt", columnName: "created_at", dbType: "timestamp with time zone", tagName: "ba" }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "updatedAt", columnName: "updated_at", dbType: "timestamp with time zone", tagName: "ba" }), immutable: false },
    "status": { kind: "enum", fieldName: "status", fieldIdName: undefined, required: true, enumDetailType: AdvanceStatuses, serde: new EnumFieldSerde({ fieldName: "status", columnName: "status_id", dbType: "AdvanceStatus", tagName: "ba", enumObject: AdvanceStatuses }), immutable: false },
    "book": { kind: "m2o", fieldName: "book", fieldIdName: "bookId", derived: false, required: true, otherMetadata: () => bookMeta, otherFieldName: "advances", serde: new KeySerde({ fieldName: "book", columnName: "book_id", dbType: "int", tagName: "ba", otherTagName: "b" }), immutable: false },
    "publisher": { kind: "m2o", fieldName: "publisher", fieldIdName: "publisherId", derived: false, required: true, otherMetadata: () => publisherMeta, otherFieldName: "bookAdvances", serde: new KeySerde({ fieldName: "publisher", columnName: "publisher_id", dbType: "int", tagName: "ba", otherTagName: "p" }), immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: bookAdvanceConfig,
  factory: newBookAdvance,
  baseTypes: [],
  subTypes: [],
};

(BookAdvance as any).metadata = bookAdvanceMeta;

export const bookReviewMeta: EntityMetadata<BookReview> = {
  cstr: BookReview,
  type: "BookReview",
  baseType: undefined,
  idType: "int",
  idTagged: true,
  tagName: "br",
  tableName: "book_reviews",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "int", tagName: "br" }), immutable: true },
    "rating": { kind: "primitive", fieldName: "rating", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde({ fieldName: "rating", columnName: "rating", dbType: "int", tagName: "br" }), immutable: false },
    "isPublic": { kind: "primitive", fieldName: "isPublic", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "boolean", serde: new PrimitiveSerde({ fieldName: "isPublic", columnName: "is_public", dbType: "boolean", tagName: "br" }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "createdAt", columnName: "created_at", dbType: "timestamp with time zone", tagName: "br" }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "updatedAt", columnName: "updated_at", dbType: "timestamp with time zone", tagName: "br" }), immutable: false },
    "book": { kind: "m2o", fieldName: "book", fieldIdName: "bookId", derived: false, required: true, otherMetadata: () => bookMeta, otherFieldName: "reviews", serde: new KeySerde({ fieldName: "book", columnName: "book_id", dbType: "int", tagName: "br", otherTagName: "b" }), immutable: false },
    "comment": { kind: "o2o", fieldName: "comment", fieldIdName: "commentId", required: false, otherMetadata: () => commentMeta, otherFieldName: "parent", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: bookReviewConfig,
  factory: newBookReview,
  baseTypes: [],
  subTypes: [],
};

(BookReview as any).metadata = bookReviewMeta;

export const commentMeta: EntityMetadata<Comment> = {
  cstr: Comment,
  type: "Comment",
  baseType: undefined,
  idType: "int",
  idTagged: true,
  tagName: "comment",
  tableName: "comments",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "int", tagName: "comment" }), immutable: true },
    "text": { kind: "primitive", fieldName: "text", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "text", columnName: "text", dbType: "text", tagName: "comment" }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "createdAt", columnName: "created_at", dbType: "timestamp with time zone", tagName: "comment" }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "updatedAt", columnName: "updated_at", dbType: "timestamp with time zone", tagName: "comment" }), immutable: false },
    "user": { kind: "m2o", fieldName: "user", fieldIdName: "userId", derived: false, required: false, otherMetadata: () => userMeta, otherFieldName: "createdComments", serde: new KeySerde({ fieldName: "user", columnName: "user_id", dbType: "int", tagName: "comment", otherTagName: "u" }), immutable: false },
    "likedByUsers": { kind: "m2m", fieldName: "likedByUsers", fieldIdName: "likedByUserIds", required: false, otherMetadata: () => userMeta, otherFieldName: "likedComments", serde: undefined, immutable: false, joinTableName: "users_to_comments", columnNames: ["comment_id", "liked_by_user_id"] },
    "parent": {
      kind: "poly",
      fieldName: "parent",
      fieldIdName: "parentId",
      required: true,
      components: [{ otherMetadata: () => authorMeta, otherFieldName: "comments", columnName: "parent_author_id" }, { otherMetadata: () => bookMeta, otherFieldName: "comments", columnName: "parent_book_id" }, {
        otherMetadata: () => bookReviewMeta,
        otherFieldName: "comment",
        columnName: "parent_book_review_id",
      }, { otherMetadata: () => publisherMeta, otherFieldName: "comments", columnName: "parent_publisher_id" }],
      serde: new PolymorphicKeySerde({ fieldName: "parent", columnName: undefined as never, dbType: undefined as never, tagName: "comment", meta: () => commentMeta }),
      immutable: false,
    },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: commentConfig,
  factory: newComment,
  baseTypes: [],
  subTypes: [],
};

(Comment as any).metadata = commentMeta;

export const criticMeta: EntityMetadata<Critic> = {
  cstr: Critic,
  type: "Critic",
  baseType: undefined,
  idType: "int",
  idTagged: true,
  tagName: "c",
  tableName: "critics",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "int", tagName: "c" }), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "name", columnName: "name", dbType: "character varying", tagName: "c" }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "createdAt", columnName: "created_at", dbType: "timestamp with time zone", tagName: "c" }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "updatedAt", columnName: "updated_at", dbType: "timestamp with time zone", tagName: "c" }), immutable: false },
    "favoriteLargePublisher": { kind: "m2o", fieldName: "favoriteLargePublisher", fieldIdName: "favoriteLargePublisherId", derived: false, required: false, otherMetadata: () => largePublisherMeta, otherFieldName: "critics", serde: new KeySerde({ fieldName: "favoriteLargePublisher", columnName: "favorite_large_publisher_id", dbType: "int", tagName: "c", otherTagName: "p" }), immutable: false },
    "group": { kind: "m2o", fieldName: "group", fieldIdName: "groupId", derived: false, required: false, otherMetadata: () => publisherGroupMeta, otherFieldName: "critics", serde: new KeySerde({ fieldName: "group", columnName: "group_id", dbType: "int", tagName: "c", otherTagName: "pg" }), immutable: false },
    "criticColumn": { kind: "o2o", fieldName: "criticColumn", fieldIdName: "criticColumnId", required: false, otherMetadata: () => criticColumnMeta, otherFieldName: "critic", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: criticConfig,
  factory: newCritic,
  baseTypes: [],
  subTypes: [],
};

(Critic as any).metadata = criticMeta;

export const criticColumnMeta: EntityMetadata<CriticColumn> = {
  cstr: CriticColumn,
  type: "CriticColumn",
  baseType: undefined,
  idType: "int",
  idTagged: true,
  tagName: "cc",
  tableName: "critic_columns",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "int", tagName: "cc" }), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "name", columnName: "name", dbType: "character varying", tagName: "cc" }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "createdAt", columnName: "created_at", dbType: "timestamp with time zone", tagName: "cc" }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "updatedAt", columnName: "updated_at", dbType: "timestamp with time zone", tagName: "cc" }), immutable: false },
    "critic": { kind: "m2o", fieldName: "critic", fieldIdName: "criticId", derived: false, required: true, otherMetadata: () => criticMeta, otherFieldName: "criticColumn", serde: new KeySerde({ fieldName: "critic", columnName: "critic_id", dbType: "int", tagName: "cc", otherTagName: "c" }), immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: criticColumnConfig,
  factory: newCriticColumn,
  baseTypes: [],
  subTypes: [],
};

(CriticColumn as any).metadata = criticColumnMeta;

export const imageMeta: EntityMetadata<Image> = {
  cstr: Image,
  type: "Image",
  baseType: undefined,
  idType: "int",
  idTagged: true,
  tagName: "i",
  tableName: "images",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "int", tagName: "i" }), immutable: true },
    "fileName": { kind: "primitive", fieldName: "fileName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "fileName", columnName: "file_name", dbType: "character varying", tagName: "i" }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "createdAt", columnName: "created_at", dbType: "timestamp with time zone", tagName: "i" }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "updatedAt", columnName: "updated_at", dbType: "timestamp with time zone", tagName: "i" }), immutable: false },
    "type": { kind: "enum", fieldName: "type", fieldIdName: undefined, required: true, enumDetailType: ImageTypes, serde: new EnumFieldSerde({ fieldName: "type", columnName: "type_id", dbType: "ImageType", tagName: "i", enumObject: ImageTypes }), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: false, otherMetadata: () => authorMeta, otherFieldName: "image", serde: new KeySerde({ fieldName: "author", columnName: "author_id", dbType: "int", tagName: "i", otherTagName: "a" }), immutable: false },
    "book": { kind: "m2o", fieldName: "book", fieldIdName: "bookId", derived: false, required: false, otherMetadata: () => bookMeta, otherFieldName: "image", serde: new KeySerde({ fieldName: "book", columnName: "book_id", dbType: "int", tagName: "i", otherTagName: "b" }), immutable: false },
    "publisher": { kind: "m2o", fieldName: "publisher", fieldIdName: "publisherId", derived: false, required: false, otherMetadata: () => publisherMeta, otherFieldName: "images", serde: new KeySerde({ fieldName: "publisher", columnName: "publisher_id", dbType: "int", tagName: "i", otherTagName: "p" }), immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: imageConfig,
  factory: newImage,
  baseTypes: [],
  subTypes: [],
};

(Image as any).metadata = imageMeta;

export const largePublisherMeta: EntityMetadata<LargePublisher> = {
  cstr: LargePublisher,
  type: "LargePublisher",
  baseType: "Publisher",
  idType: "int",
  idTagged: true,
  tagName: "p",
  tableName: "large_publishers",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "int", tagName: "p" }), immutable: true },
    "country": { kind: "primitive", fieldName: "country", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "country", columnName: "country", dbType: "text", tagName: "p" }), immutable: false },
    "critics": { kind: "o2m", fieldName: "critics", fieldIdName: "criticIds", required: false, otherMetadata: () => criticMeta, otherFieldName: "favoriteLargePublisher", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: undefined, updatedAt: undefined, deletedAt: undefined },
  config: largePublisherConfig,
  factory: newLargePublisher,
  baseTypes: [],
  subTypes: [],
};

(LargePublisher as any).metadata = largePublisherMeta;

export const publisherMeta: EntityMetadata<Publisher> = {
  cstr: Publisher,
  type: "Publisher",
  baseType: undefined,
  idType: "int",
  idTagged: true,
  tagName: "p",
  tableName: "publishers",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "int", tagName: "p" }), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "name", columnName: "name", dbType: "character varying", tagName: "p" }), immutable: false },
    "latitude": { kind: "primitive", fieldName: "latitude", fieldIdName: undefined, derived: false, required: false, protected: false, type: "number", serde: new DecimalToNumberSerde({ fieldName: "latitude", columnName: "latitude", dbType: "numeric", tagName: "p" }), immutable: false },
    "longitude": { kind: "primitive", fieldName: "longitude", fieldIdName: undefined, derived: false, required: false, protected: false, type: "number", serde: new DecimalToNumberSerde({ fieldName: "longitude", columnName: "longitude", dbType: "numeric", tagName: "p" }), immutable: false },
    "hugeNumber": { kind: "primitive", fieldName: "hugeNumber", fieldIdName: undefined, derived: false, required: false, protected: false, type: "number", serde: new DecimalToNumberSerde({ fieldName: "hugeNumber", columnName: "huge_number", dbType: "numeric", tagName: "p" }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "createdAt", columnName: "created_at", dbType: "timestamp with time zone", tagName: "p" }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "updatedAt", columnName: "updated_at", dbType: "timestamp with time zone", tagName: "p" }), immutable: false },
    "size": { kind: "enum", fieldName: "size", fieldIdName: undefined, required: false, enumDetailType: PublisherSizes, serde: new EnumFieldSerde({ fieldName: "size", columnName: "size_id", dbType: "PublisherSize", tagName: "p", enumObject: PublisherSizes }), immutable: false },
    "type": { kind: "enum", fieldName: "type", fieldIdName: undefined, required: true, enumDetailType: PublisherTypes, serde: new EnumFieldSerde({ fieldName: "type", columnName: "type_id", dbType: "PublisherType", tagName: "p", enumObject: PublisherTypes }), immutable: false },
    "group": { kind: "m2o", fieldName: "group", fieldIdName: "groupId", derived: false, required: false, otherMetadata: () => publisherGroupMeta, otherFieldName: "publishers", serde: new KeySerde({ fieldName: "group", columnName: "group_id", dbType: "int", tagName: "p", otherTagName: "pg" }), immutable: false },
    "authors": { kind: "o2m", fieldName: "authors", fieldIdName: "authorIds", required: false, otherMetadata: () => authorMeta, otherFieldName: "publisher", serde: undefined, immutable: false },
    "bookAdvances": { kind: "o2m", fieldName: "bookAdvances", fieldIdName: "bookAdvanceIds", required: false, otherMetadata: () => bookAdvanceMeta, otherFieldName: "publisher", serde: undefined, immutable: false },
    "comments": { kind: "o2m", fieldName: "comments", fieldIdName: "commentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "parent", serde: undefined, immutable: false },
    "images": { kind: "o2m", fieldName: "images", fieldIdName: "imageIds", required: false, otherMetadata: () => imageMeta, otherFieldName: "publisher", serde: undefined, immutable: false },
    "tags": { kind: "m2m", fieldName: "tags", fieldIdName: "tagIds", required: false, otherMetadata: () => tagMeta, otherFieldName: "publishers", serde: undefined, immutable: false, joinTableName: "publishers_to_tags", columnNames: ["publisher_id", "tag_id"] },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: publisherConfig,
  factory: newPublisher,
  baseTypes: [],
  subTypes: [],
};

(Publisher as any).metadata = publisherMeta;

export const publisherGroupMeta: EntityMetadata<PublisherGroup> = {
  cstr: PublisherGroup,
  type: "PublisherGroup",
  baseType: undefined,
  idType: "int",
  idTagged: true,
  tagName: "pg",
  tableName: "publisher_groups",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "int", tagName: "pg" }), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "name", columnName: "name", dbType: "text", tagName: "pg" }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "createdAt", columnName: "created_at", dbType: "timestamp with time zone", tagName: "pg" }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "updatedAt", columnName: "updated_at", dbType: "timestamp with time zone", tagName: "pg" }), immutable: false },
    "publishers": { kind: "o2m", fieldName: "publishers", fieldIdName: "publisherIds", required: false, otherMetadata: () => publisherMeta, otherFieldName: "group", serde: undefined, immutable: false },
    "critics": { kind: "lo2m", fieldName: "critics", fieldIdName: "criticIds", required: false, otherMetadata: () => criticMeta, otherFieldName: "group", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: publisherGroupConfig,
  factory: newPublisherGroup,
  baseTypes: [],
  subTypes: [],
};

(PublisherGroup as any).metadata = publisherGroupMeta;

export const smallPublisherMeta: EntityMetadata<SmallPublisher> = {
  cstr: SmallPublisher,
  type: "SmallPublisher",
  baseType: "Publisher",
  idType: "int",
  idTagged: true,
  tagName: "p",
  tableName: "small_publishers",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "int", tagName: "p" }), immutable: true },
    "city": { kind: "primitive", fieldName: "city", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "city", columnName: "city", dbType: "text", tagName: "p" }), immutable: false },
    "allAuthorNames": { kind: "primitive", fieldName: "allAuthorNames", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "allAuthorNames", columnName: "all_author_names", dbType: "text", tagName: "p" }), immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: undefined, updatedAt: undefined, deletedAt: undefined },
  config: smallPublisherConfig,
  factory: newSmallPublisher,
  baseTypes: [],
  subTypes: [],
};

(SmallPublisher as any).metadata = smallPublisherMeta;

export const tagMeta: EntityMetadata<Tag> = {
  cstr: Tag,
  type: "Tag",
  baseType: undefined,
  idType: "int",
  idTagged: true,
  tagName: "t",
  tableName: "tags",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "int", tagName: "t" }), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "name", columnName: "name", dbType: "character varying", tagName: "t" }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "createdAt", columnName: "created_at", dbType: "timestamp with time zone", tagName: "t" }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "updatedAt", columnName: "updated_at", dbType: "timestamp with time zone", tagName: "t" }), immutable: false },
    "books": { kind: "m2m", fieldName: "books", fieldIdName: "bookIds", required: false, otherMetadata: () => bookMeta, otherFieldName: "tags", serde: undefined, immutable: false, joinTableName: "books_to_tags", columnNames: ["tag_id", "book_id"] },
    "publishers": { kind: "m2m", fieldName: "publishers", fieldIdName: "publisherIds", required: false, otherMetadata: () => publisherMeta, otherFieldName: "tags", serde: undefined, immutable: false, joinTableName: "publishers_to_tags", columnNames: ["tag_id", "publisher_id"] },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: tagConfig,
  factory: newTag,
  baseTypes: [],
  subTypes: [],
};

(Tag as any).metadata = tagMeta;

export const userMeta: EntityMetadata<User> = {
  cstr: User,
  type: "User",
  baseType: undefined,
  idType: "int",
  idTagged: true,
  tagName: "u",
  tableName: "users",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "int", tagName: "u" }), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "name", columnName: "name", dbType: "character varying", tagName: "u" }), immutable: false },
    "email": { kind: "primitive", fieldName: "email", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "email", columnName: "email", dbType: "character varying", tagName: "u" }), immutable: false },
    "ipAddress": { kind: "primitive", fieldName: "ipAddress", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "ipAddress", columnName: "ip_address", dbType: "character varying", tagName: "u" }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "createdAt", columnName: "created_at", dbType: "timestamp with time zone", tagName: "u" }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "updatedAt", columnName: "updated_at", dbType: "timestamp with time zone", tagName: "u" }), immutable: false },
    "authorManyToOne": { kind: "m2o", fieldName: "authorManyToOne", fieldIdName: "authorManyToOneId", derived: false, required: false, otherMetadata: () => authorMeta, otherFieldName: "userOneToOne", serde: new KeySerde({ fieldName: "authorManyToOne", columnName: "author_id", dbType: "int", tagName: "u", otherTagName: "a" }), immutable: false },
    "createdComments": { kind: "o2m", fieldName: "createdComments", fieldIdName: "createdCommentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "user", serde: undefined, immutable: false },
    "likedComments": { kind: "m2m", fieldName: "likedComments", fieldIdName: "likedCommentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "likedByUsers", serde: undefined, immutable: false, joinTableName: "users_to_comments", columnNames: ["liked_by_user_id", "comment_id"] },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: userConfig,
  factory: newUser,
  baseTypes: [],
  subTypes: [],
};

(User as any).metadata = userMeta;

export const allMetadata = [authorMeta, authorStatMeta, bookMeta, bookAdvanceMeta, bookReviewMeta, commentMeta, criticMeta, criticColumnMeta, imageMeta, largePublisherMeta, publisherMeta, publisherGroupMeta, smallPublisherMeta, tagMeta, userMeta];
configureMetadata(allMetadata);
