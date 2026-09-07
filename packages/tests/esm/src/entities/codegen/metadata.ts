import { Column, type ColumnDescriptors, configureMetadata, type Entity as Entity2, EntityManager as EntityManager1, type EntityMetadata, EnumArrayFieldSerde, KeySerde, PrimitiveSerde, setRuntimeConfig, SimpleFieldSerde, Temporal, ZonedDateTimeSerde } from "joist-orm";
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

const authorMetaColumns = {
  "id": new Column("id", false, true, false, false, true, () => authorMeta, new KeySerde("a", "int")),
  "firstName": new Column("firstName", false, false, false, false, true, undefined, new PrimitiveSerde("character varying")),
  "lastName": new Column("lastName", true, false, false, false, true, undefined, new PrimitiveSerde("character varying")),
  "delete": new Column("delete", true, false, false, false, true, undefined, new PrimitiveSerde("boolean")),
  "createdAt": new Column("createdAt", false, false, false, true, true, undefined, new ZonedDateTimeSerde("timestamp with time zone")),
  "updatedAt": new Column("updatedAt", false, false, false, true, true, undefined, new ZonedDateTimeSerde("timestamp with time zone")),
  "favorite_colors": new Column("favorite_colors", true, true, false, false, true, undefined, new EnumArrayFieldSerde("int[]", Colors)),
} satisfies ColumnDescriptors;
const bookMetaColumns = { "id": new Column("id", false, true, false, false, true, () => bookMeta, new KeySerde("b", "int")), "title": new Column("title", false, false, false, false, true, undefined, new PrimitiveSerde("character varying")), "authorId": new Column("authorId", false, false, false, false, true, () => authorMeta, new KeySerde("a", "int")) } satisfies ColumnDescriptors;

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
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new SimpleFieldSerde("id", authorMetaColumns["id"]), immutable: true },
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new SimpleFieldSerde("firstName", authorMetaColumns["firstName"]), immutable: false },
    "lastName": { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new SimpleFieldSerde("lastName", authorMetaColumns["lastName"]), immutable: false },
    "delete": { kind: "primitive", fieldName: "delete", fieldIdName: undefined, derived: false, required: false, protected: false, type: "boolean", serde: new SimpleFieldSerde("delete", authorMetaColumns["delete"]), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Temporal.ZonedDateTime, serde: new SimpleFieldSerde("createdAt", authorMetaColumns["createdAt"]), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Temporal.ZonedDateTime, serde: new SimpleFieldSerde("updatedAt", authorMetaColumns["updatedAt"]), immutable: false },
    "favoriteColors": { kind: "enum", fieldName: "favoriteColors", fieldIdName: undefined, required: false, derived: false, enumDetailType: Colors, serde: new SimpleFieldSerde("favoriteColors", authorMetaColumns["favorite_colors"]), immutable: false, default: "schema" },
    "books": { kind: "o2m", fieldName: "books", fieldIdName: "bookIds", required: false, otherMetadata: () => bookMeta, otherFieldName: "author", otherColumnName: "authorId", serde: undefined, immutable: false },
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
  idType: "tagged-string",
  idDbType: "int",
  tagName: "b",
  tableName: "book",
  supportsEmExecute: true,
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new SimpleFieldSerde("id", bookMetaColumns["id"]), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new SimpleFieldSerde("title", bookMetaColumns["title"]), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: true, otherMetadata: bookMetaColumns["authorId"].idMetadata!, otherFieldName: "books", serde: new SimpleFieldSerde("author", bookMetaColumns["authorId"]), immutable: false },
  },
  columns: bookMetaColumns,
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
