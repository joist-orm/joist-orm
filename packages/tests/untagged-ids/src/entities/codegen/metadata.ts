import { configureMetadata, DateSerde, type Entity as Entity2, EntityManager as EntityManager1, type EntityMetadata, KeySerde, PolymorphicKeySerde, PrimitiveSerde, setRuntimeConfig } from "joist-orm";
import type { Context } from "src/context";
import { Author } from "../Author";
import { Book } from "../Book";
import { BookReview } from "../BookReview";
import { Comment } from "../Comment";
import { authorConfig, bookConfig, bookReviewConfig, commentConfig, newAuthor, newBook, newBookReview, newComment } from "../entities";

setRuntimeConfig({ temporal: false });

export class EntityManager extends EntityManager1<Context, Entity, unknown> {}

export interface Entity extends Entity2 {
  id: string;
  em: EntityManager;
}

export const authorMeta: EntityMetadata<Author> = {
  cstr: Author,
  type: "Author",
  baseType: undefined,
  idType: "untagged-string",
  idDbType: "uuid",
  tagName: "a",
  tableName: "authors",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("a", "id", "id", "uuid"), immutable: true },
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("firstName", "first_name", "character varying"), immutable: false },
    "lastName": { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("lastName", "last_name", "character varying"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "books": { kind: "o2m", fieldName: "books", fieldIdName: "bookIds", required: false, otherMetadata: () => bookMeta, otherFieldName: "author", serde: undefined, immutable: false },
    "bookReviews": { kind: "o2m", fieldName: "bookReviews", fieldIdName: "bookReviewIds", required: false, otherMetadata: () => bookReviewMeta, otherFieldName: "book", serde: undefined, immutable: false },
    "comments": { kind: "o2m", fieldName: "comments", fieldIdName: "commentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "parent", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: authorConfig,
  factory: newAuthor,
  baseTypes: [],
  subTypes: [],
};

(Author as any).metadata = authorMeta;

export const bookMeta: EntityMetadata<Book> = {
  cstr: Book,
  type: "Book",
  baseType: undefined,
  idType: "untagged-string",
  idDbType: "uuid",
  tagName: "b",
  tableName: "books",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("b", "id", "id", "uuid"), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("title", "title", "character varying"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: true, otherMetadata: () => authorMeta, otherFieldName: "books", serde: new KeySerde("a", "author", "author_id", "uuid"), immutable: false },
    "comments": { kind: "o2m", fieldName: "comments", fieldIdName: "commentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "parent", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: bookConfig,
  factory: newBook,
  baseTypes: [],
  subTypes: [],
};

(Book as any).metadata = bookMeta;

export const bookReviewMeta: EntityMetadata<BookReview> = {
  cstr: BookReview,
  type: "BookReview",
  baseType: undefined,
  idType: "untagged-string",
  idDbType: "text",
  tagName: "br",
  tableName: "book_reviews",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("br", "id", "id", "text"), immutable: true },
    "rating": { kind: "primitive", fieldName: "rating", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde("rating", "rating", "smallint"), immutable: false },
    "book": { kind: "m2o", fieldName: "book", fieldIdName: "bookId", derived: false, required: true, otherMetadata: () => authorMeta, otherFieldName: "bookReviews", serde: new KeySerde("a", "book", "book_id", "uuid"), immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: undefined, updatedAt: undefined, deletedAt: undefined },
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
  idType: "untagged-string",
  idDbType: "uuid",
  tagName: "c",
  tableName: "comments",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("c", "id", "id", "uuid"), immutable: true },
    "text": { kind: "primitive", fieldName: "text", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("text", "text", "character varying"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "parent": { kind: "poly", fieldName: "parent", fieldIdName: "parentId", required: true, components: [{ otherMetadata: () => authorMeta, otherFieldName: "comments", columnName: "parent_author_id" }, { otherMetadata: () => bookMeta, otherFieldName: "comments", columnName: "parent_book_id" }], serde: new PolymorphicKeySerde(() => commentMeta, "parent"), immutable: false },
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

export const allMetadata = [authorMeta, bookMeta, bookReviewMeta, commentMeta];
configureMetadata(allMetadata);
