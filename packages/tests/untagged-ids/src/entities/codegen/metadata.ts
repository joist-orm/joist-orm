import { Column, type ColumnDescriptors, configureMetadata, DateSerde, type Entity as Entity2, EntityManager as EntityManager1, type EntityMetadata, KeySerde, PolyComponent, polymorphicField, PrimitiveSerde, setRuntimeConfig, SimpleFieldSerde } from "joist-orm";
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

const authorMetaColumns = {
  "id": new Column("id", false, false, false, false, true, () => authorMeta, new KeySerde("a", "uuid")),
  "firstName": new Column("first_name", false, false, false, false, true, undefined, new PrimitiveSerde("character varying")),
  "lastName": new Column("last_name", true, false, false, false, true, undefined, new PrimitiveSerde("character varying")),
  "createdAt": new Column("created_at", false, false, false, true, true, undefined, new DateSerde("timestamp with time zone")),
  "updatedAt": new Column("updated_at", false, false, false, true, true, undefined, new DateSerde("timestamp with time zone")),
} satisfies ColumnDescriptors;
const bookMetaColumns = {
  "id": new Column("id", false, false, false, false, true, () => bookMeta, new KeySerde("b", "uuid")),
  "title": new Column("title", false, false, false, false, true, undefined, new PrimitiveSerde("character varying")),
  "createdAt": new Column("created_at", false, false, false, true, true, undefined, new DateSerde("timestamp with time zone")),
  "updatedAt": new Column("updated_at", false, false, false, true, true, undefined, new DateSerde("timestamp with time zone")),
  "authorId": new Column("author_id", false, false, false, false, true, () => authorMeta, new KeySerde("a", "uuid")),
} satisfies ColumnDescriptors;
const bookReviewMetaColumns = { "id": new Column("id", false, false, false, false, true, () => bookReviewMeta, new KeySerde("br", "text")), "rating": new Column("rating", false, false, false, false, true, undefined, new PrimitiveSerde("smallint")), "bookId": new Column("book_id", false, false, false, false, true, () => authorMeta, new KeySerde("a", "uuid")) } satisfies ColumnDescriptors;
const commentMetaColumns = {
  "id": new Column("id", false, false, false, false, true, () => commentMeta, new KeySerde("c", "uuid")),
  "text": new Column("text", false, false, false, false, true, undefined, new PrimitiveSerde("character varying")),
  "createdAt": new Column("created_at", false, false, false, true, true, undefined, new DateSerde("timestamp with time zone")),
  "updatedAt": new Column("updated_at", false, false, false, true, true, undefined, new DateSerde("timestamp with time zone")),
  "parentAuthorId": new Column("parent_author_id", true, false, false, false, false, () => authorMeta, new KeySerde("a", "uuid")),
  "parentBookId": new Column("parent_book_id", true, false, false, false, false, () => bookMeta, new KeySerde("b", "uuid")),
} satisfies ColumnDescriptors;

export const authorMeta: EntityMetadata<Author> = {
  cstr: Author,
  type: "Author",
  baseType: undefined,
  idType: "untagged-string",
  idDbType: "uuid",
  tagName: "a",
  tableName: "authors",
  supportsEmExecute: true,
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new SimpleFieldSerde("id", authorMetaColumns["id"]), immutable: true },
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new SimpleFieldSerde("firstName", authorMetaColumns["firstName"]), immutable: false },
    "lastName": { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new SimpleFieldSerde("lastName", authorMetaColumns["lastName"]), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new SimpleFieldSerde("createdAt", authorMetaColumns["createdAt"]), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new SimpleFieldSerde("updatedAt", authorMetaColumns["updatedAt"]), immutable: false },
    "books": { kind: "o2m", fieldName: "books", fieldIdName: "bookIds", required: false, otherMetadata: () => bookMeta, otherFieldName: "author", otherColumnName: "author_id", serde: undefined, immutable: false },
    "comments": { kind: "o2m", fieldName: "comments", fieldIdName: "commentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "parent", otherColumnName: "parent_author_id", serde: undefined, immutable: false },
    "bookReviews": { kind: "o2m", fieldName: "bookReviews", fieldIdName: "bookReviewIds", required: false, otherMetadata: () => bookReviewMeta, otherFieldName: "book", otherColumnName: "book_id", serde: undefined, immutable: false },
  },
  columns: authorMetaColumns,
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
  supportsEmExecute: true,
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new SimpleFieldSerde("id", bookMetaColumns["id"]), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new SimpleFieldSerde("title", bookMetaColumns["title"]), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new SimpleFieldSerde("createdAt", bookMetaColumns["createdAt"]), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new SimpleFieldSerde("updatedAt", bookMetaColumns["updatedAt"]), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: true, otherMetadata: bookMetaColumns["authorId"].idMetadata!, otherFieldName: "books", serde: new SimpleFieldSerde("author", bookMetaColumns["authorId"]), immutable: false },
    "comments": { kind: "o2m", fieldName: "comments", fieldIdName: "commentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "parent", otherColumnName: "parent_book_id", serde: undefined, immutable: false },
  },
  columns: bookMetaColumns,
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
  supportsEmExecute: true,
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new SimpleFieldSerde("id", bookReviewMetaColumns["id"]), immutable: true },
    "rating": { kind: "primitive", fieldName: "rating", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new SimpleFieldSerde("rating", bookReviewMetaColumns["rating"]), immutable: false },
    "book": { kind: "m2o", fieldName: "book", fieldIdName: "bookId", derived: false, required: true, otherMetadata: bookReviewMetaColumns["bookId"].idMetadata!, otherFieldName: "bookReviews", serde: new SimpleFieldSerde("book", bookReviewMetaColumns["bookId"]), immutable: false },
  },
  columns: bookReviewMetaColumns,
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
  supportsEmExecute: true,
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new SimpleFieldSerde("id", commentMetaColumns["id"]), immutable: true },
    "text": { kind: "primitive", fieldName: "text", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new SimpleFieldSerde("text", commentMetaColumns["text"]), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new SimpleFieldSerde("createdAt", commentMetaColumns["createdAt"]), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new SimpleFieldSerde("updatedAt", commentMetaColumns["updatedAt"]), immutable: false },
    "parent": polymorphicField("parent", true, [new PolyComponent(commentMetaColumns["parentAuthorId"], "comments"), new PolyComponent(commentMetaColumns["parentBookId"], "comments")]),
  },
  columns: commentMetaColumns,
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
