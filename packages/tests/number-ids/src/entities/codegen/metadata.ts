import { Column, type ColumnDescriptors, configureMetadata, DateSerde, type Entity as Entity2, EntityManager as EntityManager1, type EntityMetadata, KeySerde, PrimitiveSerde, setRuntimeConfig, SimpleFieldSerde } from "joist-orm";
import type { Context } from "src/context";
import { Author } from "../Author";
import { Book } from "../Book";
import { authorConfig, bookConfig, newAuthor, newBook } from "../entities";

setRuntimeConfig({ temporal: false });

export class EntityManager extends EntityManager1<Context, Entity, unknown> {}

export interface Entity extends Entity2 {
  id: number;
  em: EntityManager;
}

const authorMetaColumns = {
  "id": new Column("id", false, false, false, false, true, () => authorMeta, new KeySerde("a", "int")),
  "firstName": new Column("first_name", false, false, false, false, true, undefined, new PrimitiveSerde("character varying")),
  "lastName": new Column("last_name", true, false, false, false, true, undefined, new PrimitiveSerde("character varying")),
  "createdAt": new Column("created_at", false, false, false, true, true, undefined, new DateSerde("timestamp with time zone")),
  "updatedAt": new Column("updated_at", false, false, false, true, true, undefined, new DateSerde("timestamp with time zone")),
} satisfies ColumnDescriptors;
const bookMetaColumns = {
  "id": new Column("id", false, false, false, false, true, () => bookMeta, new KeySerde("b", "bigint")),
  "title": new Column("title", false, false, false, false, true, undefined, new PrimitiveSerde("character varying")),
  "createdAt": new Column("created_at", false, false, false, true, true, undefined, new DateSerde("timestamp with time zone")),
  "updatedAt": new Column("updated_at", false, false, false, true, true, undefined, new DateSerde("timestamp with time zone")),
  "authorId": new Column("author_id", false, false, false, false, true, () => authorMeta, new KeySerde("a", "int")),
} satisfies ColumnDescriptors;

export const authorMeta: EntityMetadata<Author> = {
  cstr: Author,
  type: "Author",
  baseType: undefined,
  idType: "number",
  idDbType: "int",
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
  idType: "number",
  idDbType: "bigint",
  tagName: "b",
  tableName: "books",
  supportsEmExecute: true,
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new SimpleFieldSerde("id", bookMetaColumns["id"]), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new SimpleFieldSerde("title", bookMetaColumns["title"]), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new SimpleFieldSerde("createdAt", bookMetaColumns["createdAt"]), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new SimpleFieldSerde("updatedAt", bookMetaColumns["updatedAt"]), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: true, otherMetadata: bookMetaColumns["authorId"].idMetadata!, otherFieldName: "books", serde: new SimpleFieldSerde("author", bookMetaColumns["authorId"]), immutable: false },
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

export const allMetadata = [authorMeta, bookMeta];
configureMetadata(allMetadata);
