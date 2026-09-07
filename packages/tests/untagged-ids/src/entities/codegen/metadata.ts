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
  supportsEmExecute: true,
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("a", "id", "id", "uuid", { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: true },
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("firstName", "first_name", "character varying", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "lastName": { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("lastName", "last_name", "character varying", false, false, { sqlNullable: true, hasDefault: false, isGenerated: false }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "books": { kind: "o2m", fieldName: "books", fieldIdName: "bookIds", required: false, otherMetadata: () => bookMeta, otherFieldName: "author", otherColumnName: "author_id", serde: undefined, immutable: false },
    "bookReviews": { kind: "o2m", fieldName: "bookReviews", fieldIdName: "bookReviewIds", required: false, otherMetadata: () => bookReviewMeta, otherFieldName: "book", otherColumnName: "book_id", serde: undefined, immutable: false },
    "comments": { kind: "o2m", fieldName: "comments", fieldIdName: "commentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "parent", otherColumnName: "parent_author_id", serde: undefined, immutable: false },
  },
  columns: {},
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: authorConfig,
  factory: newAuthor,
  baseTypes: [],
  subTypes: [],
};

authorMeta.columns["id"] = { fieldName: "id", field: authorMeta.fields["id"] };
authorMeta.columns["first_name"] = { fieldName: "firstName", field: authorMeta.fields["firstName"] };
authorMeta.columns["last_name"] = { fieldName: "lastName", field: authorMeta.fields["lastName"] };
authorMeta.columns["created_at"] = { fieldName: "createdAt", field: authorMeta.fields["createdAt"] };
authorMeta.columns["updated_at"] = { fieldName: "updatedAt", field: authorMeta.fields["updatedAt"] };

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
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("b", "id", "id", "uuid", { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("title", "title", "character varying", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: true, otherMetadata: () => authorMeta, otherFieldName: "books", serde: new KeySerde("a", "author", "author_id", "uuid", { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "comments": { kind: "o2m", fieldName: "comments", fieldIdName: "commentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "parent", otherColumnName: "parent_book_id", serde: undefined, immutable: false },
  },
  columns: {},
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: bookConfig,
  factory: newBook,
  baseTypes: [],
  subTypes: [],
};

bookMeta.columns["id"] = { fieldName: "id", field: bookMeta.fields["id"] };
bookMeta.columns["title"] = { fieldName: "title", field: bookMeta.fields["title"] };
bookMeta.columns["created_at"] = { fieldName: "createdAt", field: bookMeta.fields["createdAt"] };
bookMeta.columns["updated_at"] = { fieldName: "updatedAt", field: bookMeta.fields["updatedAt"] };
bookMeta.columns["author_id"] = { fieldName: "author", field: bookMeta.fields["author"] };

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
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("br", "id", "id", "text", { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: true },
    "rating": { kind: "primitive", fieldName: "rating", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde("rating", "rating", "smallint", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "book": { kind: "m2o", fieldName: "book", fieldIdName: "bookId", derived: false, required: true, otherMetadata: () => authorMeta, otherFieldName: "bookReviews", serde: new KeySerde("a", "book", "book_id", "uuid", { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
  },
  columns: {},
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: undefined, updatedAt: undefined, deletedAt: undefined },
  config: bookReviewConfig,
  factory: newBookReview,
  baseTypes: [],
  subTypes: [],
};

bookReviewMeta.columns["id"] = { fieldName: "id", field: bookReviewMeta.fields["id"] };
bookReviewMeta.columns["rating"] = { fieldName: "rating", field: bookReviewMeta.fields["rating"] };
bookReviewMeta.columns["book_id"] = { fieldName: "book", field: bookReviewMeta.fields["book"] };

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
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("c", "id", "id", "uuid", { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: true },
    "text": { kind: "primitive", fieldName: "text", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("text", "text", "character varying", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "parent": { kind: "poly", fieldName: "parent", fieldIdName: "parentId", required: true, components: [{ otherMetadata: () => authorMeta, otherFieldName: "comments", columnName: "parent_author_id" }, { otherMetadata: () => bookMeta, otherFieldName: "comments", columnName: "parent_book_id" }], serde: new PolymorphicKeySerde(() => commentMeta, "parent"), immutable: false },
  },
  columns: {},
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: commentConfig,
  factory: newComment,
  baseTypes: [],
  subTypes: [],
};

commentMeta.columns["id"] = { fieldName: "id", field: commentMeta.fields["id"] };
commentMeta.columns["text"] = { fieldName: "text", field: commentMeta.fields["text"] };
commentMeta.columns["created_at"] = { fieldName: "createdAt", field: commentMeta.fields["createdAt"] };
commentMeta.columns["updated_at"] = { fieldName: "updatedAt", field: commentMeta.fields["updatedAt"] };
commentMeta.columns["parent_author_id"] = {
  fieldName: "parent",
  field: { kind: "poly", fieldName: "parent", fieldIdName: "parentId", required: true, components: [{ otherMetadata: () => authorMeta, otherFieldName: "comments", columnName: "parent_author_id" }, { otherMetadata: () => bookMeta, otherFieldName: "comments", columnName: "parent_book_id" }], serde: new PolymorphicKeySerde(() => commentMeta, "parent", "parent_author_id"), immutable: false },
};
commentMeta.columns["parent_book_id"] = { fieldName: "parent", field: commentMeta.columns["parent_author_id"].field };

(Comment as any).metadata = commentMeta;

export const allMetadata = [authorMeta, bookMeta, bookReviewMeta, commentMeta];
configureMetadata(allMetadata);
