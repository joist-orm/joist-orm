import { configureMetadata, type Entity as Entity2, EntityManager as EntityManager1, type EntityMetadata, KeySerde, PrimitiveSerde, setRuntimeConfig } from "joist-orm";
import { type Context } from "src/context";
import { T1Author } from "../T1Author";
import { T1Book } from "../T1Book";
import { T2Author } from "../T2Author";
import { T2Book } from "../T2Book";
import { T3Author } from "../T3Author";
import { T3Book } from "../T3Book";
import { T4Author } from "../T4Author";
import { T4Book } from "../T4Book";
import { T5Author } from "../T5Author";
import { T5Book } from "../T5Book";
import { T5BookReview } from "../T5BookReview";
import { newT1Author, newT1Book, newT2Author, newT2Book, newT3Author, newT3Book, newT4Author, newT4Book, newT5Author, newT5Book, newT5BookReview, t1AuthorConfig, t1BookConfig, t2AuthorConfig, t2BookConfig, t3AuthorConfig, t3BookConfig, t4AuthorConfig, t4BookConfig, t5AuthorConfig, t5BookConfig, t5BookReviewConfig } from "../entities";

setRuntimeConfig({ temporal: false });

export class EntityManager extends EntityManager1<Context, Entity> {}

export interface Entity extends Entity2 {
  id: number;
  em: EntityManager;
}

export const t1AuthorMeta: EntityMetadata<T1Author> = {
  cstr: T1Author,
  type: "T1Author",
  baseType: undefined,
  idType: "number",
  idDbType: "int",
  tagName: "ta",
  tableName: "t1_authors",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("ta", "id", "id", "int"), immutable: true },
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("firstName", "first_name", "character varying"), immutable: false },
    "t1Books": { kind: "o2m", fieldName: "t1Books", fieldIdName: "t1BookIds", required: false, otherMetadata: () => t1BookMeta, otherFieldName: "author", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: undefined, updatedAt: undefined, deletedAt: undefined },
  config: t1AuthorConfig,
  factory: newT1Author,
  baseTypes: [],
  subTypes: [],
  nonDeferredFkOrder: 1,
};

(T1Author as any).metadata = t1AuthorMeta;

export const t1BookMeta: EntityMetadata<T1Book> = {
  cstr: T1Book,
  type: "T1Book",
  baseType: undefined,
  idType: "number",
  idDbType: "int",
  tagName: "tb",
  tableName: "t1_books",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("tb", "id", "id", "int"), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("title", "title", "character varying"), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: true, otherMetadata: () => t1AuthorMeta, otherFieldName: "t1Books", serde: new KeySerde("ta", "author", "author_id", "int"), immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: undefined, updatedAt: undefined, deletedAt: undefined },
  config: t1BookConfig,
  factory: newT1Book,
  baseTypes: [],
  subTypes: [],
  nonDeferredFkOrder: 2,
};

(T1Book as any).metadata = t1BookMeta;

export const t2AuthorMeta: EntityMetadata<T2Author> = {
  cstr: T2Author,
  type: "T2Author",
  baseType: undefined,
  idType: "number",
  idDbType: "int",
  tagName: "t2Author",
  tableName: "t2_authors",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("t2Author", "id", "id", "int"), immutable: true },
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("firstName", "first_name", "character varying"), immutable: false },
    "favoriteBook": { kind: "m2o", fieldName: "favoriteBook", fieldIdName: "favoriteBookId", derived: false, required: false, otherMetadata: () => t2BookMeta, otherFieldName: "t2Authors", serde: new KeySerde("t2Book", "favoriteBook", "favorite_book_id", "int"), immutable: false },
    "t2Books": { kind: "o2m", fieldName: "t2Books", fieldIdName: "t2BookIds", required: false, otherMetadata: () => t2BookMeta, otherFieldName: "author", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: undefined, updatedAt: undefined, deletedAt: undefined },
  config: t2AuthorConfig,
  factory: newT2Author,
  baseTypes: [],
  subTypes: [],
  nonDeferredFkOrder: 1,
};

(T2Author as any).metadata = t2AuthorMeta;

export const t2BookMeta: EntityMetadata<T2Book> = {
  cstr: T2Book,
  type: "T2Book",
  baseType: undefined,
  idType: "number",
  idDbType: "int",
  tagName: "t2Book",
  tableName: "t2_books",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("t2Book", "id", "id", "int"), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("title", "title", "character varying"), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: true, otherMetadata: () => t2AuthorMeta, otherFieldName: "t2Books", serde: new KeySerde("t2Author", "author", "author_id", "int"), immutable: false },
    "t2Authors": { kind: "o2m", fieldName: "t2Authors", fieldIdName: "t2AuthorIds", required: false, otherMetadata: () => t2AuthorMeta, otherFieldName: "favoriteBook", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: undefined, updatedAt: undefined, deletedAt: undefined },
  config: t2BookConfig,
  factory: newT2Book,
  baseTypes: [],
  subTypes: [],
  nonDeferredFkOrder: 2,
};

(T2Book as any).metadata = t2BookMeta;

export const t3AuthorMeta: EntityMetadata<T3Author> = {
  cstr: T3Author,
  type: "T3Author",
  baseType: undefined,
  idType: "number",
  idDbType: "int",
  tagName: "t3Author",
  tableName: "t3_authors",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("t3Author", "id", "id", "int"), immutable: true },
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("firstName", "first_name", "character varying"), immutable: false },
    "favoriteBook": { kind: "m2o", fieldName: "favoriteBook", fieldIdName: "favoriteBookId", derived: false, required: true, otherMetadata: () => t3BookMeta, otherFieldName: "t3Authors", serde: new KeySerde("t3Book", "favoriteBook", "favorite_book_id", "int"), immutable: false },
    "t3Books": { kind: "o2m", fieldName: "t3Books", fieldIdName: "t3BookIds", required: false, otherMetadata: () => t3BookMeta, otherFieldName: "author", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: undefined, updatedAt: undefined, deletedAt: undefined },
  config: t3AuthorConfig,
  factory: newT3Author,
  baseTypes: [],
  subTypes: [],
  nonDeferredFkOrder: 2,
};

(T3Author as any).metadata = t3AuthorMeta;

export const t3BookMeta: EntityMetadata<T3Book> = {
  cstr: T3Book,
  type: "T3Book",
  baseType: undefined,
  idType: "number",
  idDbType: "int",
  tagName: "t3Book",
  tableName: "t3_books",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("t3Book", "id", "id", "int"), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("title", "title", "character varying"), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: true, otherMetadata: () => t3AuthorMeta, otherFieldName: "t3Books", serde: new KeySerde("t3Author", "author", "author_id", "int"), immutable: false },
    "t3Authors": { kind: "o2m", fieldName: "t3Authors", fieldIdName: "t3AuthorIds", required: false, otherMetadata: () => t3AuthorMeta, otherFieldName: "favoriteBook", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: undefined, updatedAt: undefined, deletedAt: undefined },
  config: t3BookConfig,
  factory: newT3Book,
  baseTypes: [],
  subTypes: [],
  nonDeferredFkOrder: 1,
};

(T3Book as any).metadata = t3BookMeta;

export const t4AuthorMeta: EntityMetadata<T4Author> = {
  cstr: T4Author,
  type: "T4Author",
  baseType: undefined,
  idType: "number",
  idDbType: "int",
  tagName: "t4Author",
  tableName: "t4_authors",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("t4Author", "id", "id", "int"), immutable: true },
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("firstName", "first_name", "character varying"), immutable: false },
    "favoriteBook": { kind: "m2o", fieldName: "favoriteBook", fieldIdName: "favoriteBookId", derived: false, required: true, otherMetadata: () => t4BookMeta, otherFieldName: "t4Authors", serde: new KeySerde("t4Book", "favoriteBook", "favorite_book_id", "int"), immutable: false },
    "t4Books": { kind: "o2m", fieldName: "t4Books", fieldIdName: "t4BookIds", required: false, otherMetadata: () => t4BookMeta, otherFieldName: "author", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: undefined, updatedAt: undefined, deletedAt: undefined },
  config: t4AuthorConfig,
  factory: newT4Author,
  baseTypes: [],
  subTypes: [],
  nonDeferredFkOrder: 2,
};

(T4Author as any).metadata = t4AuthorMeta;

export const t4BookMeta: EntityMetadata<T4Book> = {
  cstr: T4Book,
  type: "T4Book",
  baseType: undefined,
  idType: "number",
  idDbType: "int",
  tagName: "t4Book",
  tableName: "t4_books",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("t4Book", "id", "id", "int"), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("title", "title", "character varying"), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: true, otherMetadata: () => t4AuthorMeta, otherFieldName: "t4Books", serde: new KeySerde("t4Author", "author", "author_id", "int"), immutable: false },
    "t4Authors": { kind: "o2m", fieldName: "t4Authors", fieldIdName: "t4AuthorIds", required: false, otherMetadata: () => t4AuthorMeta, otherFieldName: "favoriteBook", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: undefined, updatedAt: undefined, deletedAt: undefined },
  config: t4BookConfig,
  factory: newT4Book,
  baseTypes: [],
  subTypes: [],
  nonDeferredFkOrder: 1,
};

(T4Book as any).metadata = t4BookMeta;

export const t5AuthorMeta: EntityMetadata<T5Author> = {
  cstr: T5Author,
  type: "T5Author",
  baseType: undefined,
  idType: "number",
  idDbType: "int",
  tagName: "t5Author",
  tableName: "t5_authors",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("t5Author", "id", "id", "int"), immutable: true },
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("firstName", "first_name", "character varying"), immutable: false },
    "t5Books": { kind: "o2m", fieldName: "t5Books", fieldIdName: "t5BookIds", required: false, otherMetadata: () => t5BookMeta, otherFieldName: "author", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: undefined, updatedAt: undefined, deletedAt: undefined },
  config: t5AuthorConfig,
  factory: newT5Author,
  baseTypes: [],
  subTypes: [],
  nonDeferredFkOrder: 1,
};

(T5Author as any).metadata = t5AuthorMeta;

export const t5BookMeta: EntityMetadata<T5Book> = {
  cstr: T5Book,
  type: "T5Book",
  baseType: undefined,
  idType: "number",
  idDbType: "int",
  tagName: "t5Book",
  tableName: "t5_books",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("t5Book", "id", "id", "int"), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("title", "title", "character varying"), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: true, otherMetadata: () => t5AuthorMeta, otherFieldName: "t5Books", serde: new KeySerde("t5Author", "author", "author_id", "int"), immutable: false },
    "reviews": { kind: "o2m", fieldName: "reviews", fieldIdName: "reviewIds", required: false, otherMetadata: () => t5BookReviewMeta, otherFieldName: "book", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: undefined, updatedAt: undefined, deletedAt: undefined },
  config: t5BookConfig,
  factory: newT5Book,
  baseTypes: [],
  subTypes: [],
  nonDeferredFkOrder: 2,
};

(T5Book as any).metadata = t5BookMeta;

export const t5BookReviewMeta: EntityMetadata<T5BookReview> = {
  cstr: T5BookReview,
  type: "T5BookReview",
  baseType: undefined,
  idType: "number",
  idDbType: "int",
  tagName: "tbr",
  tableName: "t5_book_reviews",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("tbr", "id", "id", "int"), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("title", "title", "character varying"), immutable: false },
    "book": { kind: "m2o", fieldName: "book", fieldIdName: "bookId", derived: false, required: false, otherMetadata: () => t5BookMeta, otherFieldName: "reviews", serde: new KeySerde("t5Book", "book", "book_id", "int"), immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: undefined, updatedAt: undefined, deletedAt: undefined },
  config: t5BookReviewConfig,
  factory: newT5BookReview,
  baseTypes: [],
  subTypes: [],
  nonDeferredFkOrder: 3,
};

(T5BookReview as any).metadata = t5BookReviewMeta;

export const allMetadata = [t1AuthorMeta, t1BookMeta, t2AuthorMeta, t2BookMeta, t3AuthorMeta, t3BookMeta, t4AuthorMeta, t4BookMeta, t5AuthorMeta, t5BookMeta, t5BookReviewMeta];
configureMetadata(allMetadata);
