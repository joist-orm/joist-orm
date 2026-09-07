import { configureMetadata, type Entity as Entity2, EntityManager as EntityManager1, type EntityMetadata, EnumArrayFieldSerde, KeySerde, PrimitiveSerde, setRuntimeConfig, Temporal, ZonedDateTimeSerde } from "joist-orm";
import type { Context } from "../../context.js";
import { Author } from "../Author.js";
import { Book } from "../Book.js";
import { authorConfig, bookConfig, Colors, newAuthor, newBook } from "../entities.js";

setRuntimeConfig({ temporal: { "timeZone": "UTC" } });

export class EntityManager extends EntityManager1<Context, Entity, unknown> {}

export interface Entity extends Entity2 {
  id: string;
  em: EntityManager;
}

export const authorMeta: EntityMetadata<Author> = {
  cstr: Author,
  type: "Author",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "a",
  tableName: "authors",
  supportsEmExecute: true,
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("a", "id", "id", "int", { sqlNullable: false, hasDefault: true, isGenerated: false }), immutable: true },
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("firstName", "firstName", "character varying", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "lastName": { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("lastName", "lastName", "character varying", false, false, { sqlNullable: true, hasDefault: false, isGenerated: false }), immutable: false },
    "delete": { kind: "primitive", fieldName: "delete", fieldIdName: undefined, derived: false, required: false, protected: false, type: "boolean", serde: new PrimitiveSerde("delete", "delete", "boolean", false, false, { sqlNullable: true, hasDefault: false, isGenerated: false }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Temporal.ZonedDateTime, serde: new ZonedDateTimeSerde("createdAt", "createdAt", "timestamp with time zone", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Temporal.ZonedDateTime, serde: new ZonedDateTimeSerde("updatedAt", "updatedAt", "timestamp with time zone", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "favoriteColors": { kind: "enum", fieldName: "favoriteColors", fieldIdName: undefined, required: false, derived: false, enumDetailType: Colors, serde: new EnumArrayFieldSerde("favoriteColors", "favorite_colors", "int[]", true, Colors, { sqlNullable: true, hasDefault: true, isGenerated: false }), immutable: false, default: "schema" },
    "books": { kind: "o2m", fieldName: "books", fieldIdName: "bookIds", required: false, otherMetadata: () => bookMeta, otherFieldName: "author", otherColumnName: "authorId", serde: undefined, immutable: false },
  },
  columns: { "id": { "fieldName": "id" }, "firstName": { "fieldName": "firstName" }, "lastName": { "fieldName": "lastName" }, "delete": { "fieldName": "delete" }, "createdAt": { "fieldName": "createdAt" }, "updatedAt": { "fieldName": "updatedAt" }, "favorite_colors": { "fieldName": "favoriteColors" } },
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
  idType: "tagged-string",
  idDbType: "int",
  tagName: "b",
  tableName: "book",
  supportsEmExecute: true,
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("b", "id", "id", "int", { sqlNullable: false, hasDefault: true, isGenerated: false }), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("title", "title", "character varying", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: true, otherMetadata: () => authorMeta, otherFieldName: "books", serde: new KeySerde("a", "author", "authorId", "int", { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
  },
  columns: { "id": { "fieldName": "id" }, "title": { "fieldName": "title" }, "authorId": { "fieldName": "author" } },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: undefined, updatedAt: undefined, deletedAt: undefined },
  config: bookConfig,
  factory: newBook,
  baseTypes: [],
  subTypes: [],
};

(Book as any).metadata = bookMeta;

export const allMetadata = [authorMeta, bookMeta];
configureMetadata(allMetadata);
