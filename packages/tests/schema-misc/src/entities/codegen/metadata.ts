import { configureMetadata, DateSerde, type Entity as Entity2, EntityManager as EntityManager1, type EntityMetadata, KeySerde, PrimitiveSerde, setRuntimeConfig } from "joist-orm";
import type { Context } from "src/context";
import { Artist } from "../Artist";
import { Author } from "../Author";
import { Book } from "../Book";
import { DatabaseOwner } from "../DatabaseOwner";
import { Painting } from "../Painting";
import { Tag } from "../Tag";
import { artistConfig, authorConfig, bookConfig, databaseOwnerConfig, newArtist, newAuthor, newBook, newDatabaseOwner, newPainting, newTag, paintingConfig, tagConfig } from "../entities";

setRuntimeConfig({ temporal: false });

export class EntityManager extends EntityManager1<Context, Entity, unknown> {}

export interface Entity extends Entity2 {
  id: string;
  em: EntityManager;
}

export const artistMeta: EntityMetadata<Artist> = {
  cstr: Artist,
  type: "Artist",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "uuid",
  tagName: "artist",
  tableName: "artists",
  supportsEmExecute: true,
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("artist", "id", "id", "uuid", { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: true },
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("firstName", "firstName", "character varying", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "lastName": { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("lastName", "lastName", "character varying", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "createdAt", "timestamp without time zone", false, false, { sqlNullable: false, hasDefault: true, isGenerated: false }), immutable: false, default: "schema" },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updatedAt", "timestamp without time zone", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "paintings": { kind: "o2m", fieldName: "paintings", fieldIdName: "paintingIds", required: false, otherMetadata: () => paintingMeta, otherFieldName: "artist", otherColumnName: "artistId", serde: undefined, immutable: false },
  },
  columns: { "id": { "fieldName": "id" }, "firstName": { "fieldName": "firstName" }, "lastName": { "fieldName": "lastName" }, "createdAt": { "fieldName": "createdAt" }, "updatedAt": { "fieldName": "updatedAt" } },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: artistConfig,
  factory: newArtist,
  baseTypes: [],
  subTypes: [],
};

(Artist as any).metadata = artistMeta;

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
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "createdAt", "timestamp with time zone", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updatedAt", "timestamp with time zone", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "books": { kind: "o2m", fieldName: "books", fieldIdName: "bookIds", required: false, otherMetadata: () => bookMeta, otherFieldName: "author", otherColumnName: "authorId", serde: undefined, immutable: false },
    "tags": { kind: "m2m", fieldName: "tags", fieldIdName: "tagIds", required: false, derived: false, otherMetadata: () => tagMeta, otherFieldName: "authors", serde: undefined, immutable: false, joinTableName: "author_to_tags", columnNames: ["authorId", "tagId"], hasJoinTableId: true },
  },
  columns: { "id": { "fieldName": "id" }, "firstName": { "fieldName": "firstName" }, "lastName": { "fieldName": "lastName" }, "delete": { "fieldName": "delete" }, "createdAt": { "fieldName": "createdAt" }, "updatedAt": { "fieldName": "updatedAt" } },
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
    "tags": { kind: "m2m", fieldName: "tags", fieldIdName: "tagIds", required: false, derived: false, otherMetadata: () => tagMeta, otherFieldName: "books", serde: undefined, immutable: false, joinTableName: "book_to_tags", columnNames: ["bookId", "tagId"], hasJoinTableId: false },
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

export const databaseOwnerMeta: EntityMetadata<DatabaseOwner> = {
  cstr: DatabaseOwner,
  type: "DatabaseOwner",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "do",
  tableName: "database_owners",
  supportsEmExecute: true,
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("do", "id", "id", "int", { sqlNullable: false, hasDefault: true, isGenerated: false }), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("name", "name", "character varying", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "tags": { kind: "m2m", fieldName: "tags", fieldIdName: "tagIds", required: false, derived: false, otherMetadata: () => tagMeta, otherFieldName: "databaseOwners", serde: undefined, immutable: false, joinTableName: "database_owner_to_tags", columnNames: ["databaseOwnerId", "tagId"], hasJoinTableId: false },
  },
  columns: { "id": { "fieldName": "id" }, "name": { "fieldName": "name" } },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: undefined, updatedAt: undefined, deletedAt: undefined },
  config: databaseOwnerConfig,
  factory: newDatabaseOwner,
  baseTypes: [],
  subTypes: [],
};

(DatabaseOwner as any).metadata = databaseOwnerMeta;

export const paintingMeta: EntityMetadata<Painting> = {
  cstr: Painting,
  type: "Painting",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "uuid",
  tagName: "p",
  tableName: "paintings",
  supportsEmExecute: true,
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("p", "id", "id", "uuid", { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("title", "title", "character varying", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "createdAt", "timestamp without time zone", false, false, { sqlNullable: false, hasDefault: true, isGenerated: false }), immutable: false, default: "schema" },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updatedAt", "timestamp without time zone", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "artist": { kind: "m2o", fieldName: "artist", fieldIdName: "artistId", derived: false, required: true, otherMetadata: () => artistMeta, otherFieldName: "paintings", serde: new KeySerde("artist", "artist", "artistId", "uuid", { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
  },
  columns: { "id": { "fieldName": "id" }, "title": { "fieldName": "title" }, "createdAt": { "fieldName": "createdAt" }, "updatedAt": { "fieldName": "updatedAt" }, "artistId": { "fieldName": "artist" } },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: paintingConfig,
  factory: newPainting,
  baseTypes: [],
  subTypes: [],
};

(Painting as any).metadata = paintingMeta;

export const tagMeta: EntityMetadata<Tag> = {
  cstr: Tag,
  type: "Tag",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "t",
  tableName: "tags",
  supportsEmExecute: true,
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("t", "id", "id", "int", { sqlNullable: false, hasDefault: true, isGenerated: false }), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("title", "title", "character varying", false, false, { sqlNullable: false, hasDefault: false, isGenerated: false }), immutable: false },
    "authors": { kind: "m2m", fieldName: "authors", fieldIdName: "authorIds", required: false, derived: false, otherMetadata: () => authorMeta, otherFieldName: "tags", serde: undefined, immutable: false, joinTableName: "author_to_tags", columnNames: ["tagId", "authorId"], hasJoinTableId: true },
    "books": { kind: "m2m", fieldName: "books", fieldIdName: "bookIds", required: false, derived: false, otherMetadata: () => bookMeta, otherFieldName: "tags", serde: undefined, immutable: false, joinTableName: "book_to_tags", columnNames: ["tagId", "bookId"], hasJoinTableId: false },
    "databaseOwners": { kind: "m2m", fieldName: "databaseOwners", fieldIdName: "databaseOwnerIds", required: false, derived: false, otherMetadata: () => databaseOwnerMeta, otherFieldName: "tags", serde: undefined, immutable: false, joinTableName: "database_owner_to_tags", columnNames: ["tagId", "databaseOwnerId"], hasJoinTableId: false },
  },
  columns: { "id": { "fieldName": "id" }, "title": { "fieldName": "title" } },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: undefined, updatedAt: undefined, deletedAt: undefined },
  config: tagConfig,
  factory: newTag,
  baseTypes: [],
  subTypes: [],
};

(Tag as any).metadata = tagMeta;

export const allMetadata = [artistMeta, authorMeta, bookMeta, databaseOwnerMeta, paintingMeta, tagMeta];
configureMetadata(allMetadata);
