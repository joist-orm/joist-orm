import { Column, type ColumnDescriptors, configureMetadata, DateSerde, type Entity as Entity2, EntityManager as EntityManager1, type EntityMetadata, KeySerde, PrimitiveSerde, setRuntimeConfig, SimpleFieldSerde } from "joist-orm";
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

const artistMetaColumns = {
  "id": new Column("id", false, false, false, false, true, () => artistMeta, new KeySerde("artist", "uuid")),
  "firstName": new Column("firstName", false, false, false, false, true, undefined, new PrimitiveSerde("character varying")),
  "lastName": new Column("lastName", false, false, false, false, true, undefined, new PrimitiveSerde("character varying")),
  "createdAt": new Column("createdAt", false, true, false, true, true, undefined, new DateSerde("timestamp without time zone")),
  "updatedAt": new Column("updatedAt", false, false, false, true, true, undefined, new DateSerde("timestamp without time zone")),
} satisfies ColumnDescriptors;
const authorMetaColumns = {
  "id": new Column("id", false, true, false, false, true, () => authorMeta, new KeySerde("a", "int")),
  "firstName": new Column("firstName", false, false, false, false, true, undefined, new PrimitiveSerde("character varying")),
  "lastName": new Column("lastName", true, false, false, false, true, undefined, new PrimitiveSerde("character varying")),
  "delete": new Column("delete", true, false, false, false, true, undefined, new PrimitiveSerde("boolean")),
  "createdAt": new Column("createdAt", false, false, false, true, true, undefined, new DateSerde("timestamp with time zone")),
  "updatedAt": new Column("updatedAt", false, false, false, true, true, undefined, new DateSerde("timestamp with time zone")),
} satisfies ColumnDescriptors;
const bookMetaColumns = { "id": new Column("id", false, true, false, false, true, () => bookMeta, new KeySerde("b", "int")), "title": new Column("title", false, false, false, false, true, undefined, new PrimitiveSerde("character varying")), "authorId": new Column("authorId", false, false, false, false, true, () => authorMeta, new KeySerde("a", "int")) } satisfies ColumnDescriptors;
const databaseOwnerMetaColumns = { "id": new Column("id", false, true, false, false, true, () => databaseOwnerMeta, new KeySerde("do", "int")), "name": new Column("name", false, false, false, false, true, undefined, new PrimitiveSerde("character varying")) } satisfies ColumnDescriptors;
const paintingMetaColumns = {
  "id": new Column("id", false, false, false, false, true, () => paintingMeta, new KeySerde("p", "uuid")),
  "title": new Column("title", false, false, false, false, true, undefined, new PrimitiveSerde("character varying")),
  "createdAt": new Column("createdAt", false, true, false, true, true, undefined, new DateSerde("timestamp without time zone")),
  "updatedAt": new Column("updatedAt", false, false, false, true, true, undefined, new DateSerde("timestamp without time zone")),
  "artistId": new Column("artistId", false, false, false, false, true, () => artistMeta, new KeySerde("artist", "uuid")),
} satisfies ColumnDescriptors;
const tagMetaColumns = { "id": new Column("id", false, true, false, false, true, () => tagMeta, new KeySerde("t", "int")), "title": new Column("title", false, false, false, false, true, undefined, new PrimitiveSerde("character varying")) } satisfies ColumnDescriptors;

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
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new SimpleFieldSerde("id", artistMetaColumns["id"]), immutable: true },
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new SimpleFieldSerde("firstName", artistMetaColumns["firstName"]), immutable: false },
    "lastName": { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new SimpleFieldSerde("lastName", artistMetaColumns["lastName"]), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new SimpleFieldSerde("createdAt", artistMetaColumns["createdAt"]), immutable: false, default: "schema" },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new SimpleFieldSerde("updatedAt", artistMetaColumns["updatedAt"]), immutable: false },
    "paintings": { kind: "o2m", fieldName: "paintings", fieldIdName: "paintingIds", required: false, otherMetadata: () => paintingMeta, otherFieldName: "artist", otherColumnName: "artistId", serde: undefined, immutable: false },
  },
  columns: artistMetaColumns,
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
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new SimpleFieldSerde("id", authorMetaColumns["id"]), immutable: true },
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new SimpleFieldSerde("firstName", authorMetaColumns["firstName"]), immutable: false },
    "lastName": { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new SimpleFieldSerde("lastName", authorMetaColumns["lastName"]), immutable: false },
    "delete": { kind: "primitive", fieldName: "delete", fieldIdName: undefined, derived: false, required: false, protected: false, type: "boolean", serde: new SimpleFieldSerde("delete", authorMetaColumns["delete"]), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new SimpleFieldSerde("createdAt", authorMetaColumns["createdAt"]), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new SimpleFieldSerde("updatedAt", authorMetaColumns["updatedAt"]), immutable: false },
    "books": { kind: "o2m", fieldName: "books", fieldIdName: "bookIds", required: false, otherMetadata: () => bookMeta, otherFieldName: "author", otherColumnName: "authorId", serde: undefined, immutable: false },
    "tags": { kind: "m2m", fieldName: "tags", fieldIdName: "tagIds", required: false, derived: false, otherMetadata: () => tagMeta, otherFieldName: "authors", serde: undefined, immutable: false, joinTableName: "author_to_tags", columnNames: ["authorId", "tagId"], hasJoinTableId: true },
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
    "tags": { kind: "m2m", fieldName: "tags", fieldIdName: "tagIds", required: false, derived: false, otherMetadata: () => tagMeta, otherFieldName: "books", serde: undefined, immutable: false, joinTableName: "book_to_tags", columnNames: ["bookId", "tagId"], hasJoinTableId: false },
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
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new SimpleFieldSerde("id", databaseOwnerMetaColumns["id"]), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new SimpleFieldSerde("name", databaseOwnerMetaColumns["name"]), immutable: false },
    "tags": { kind: "m2m", fieldName: "tags", fieldIdName: "tagIds", required: false, derived: false, otherMetadata: () => tagMeta, otherFieldName: "databaseOwners", serde: undefined, immutable: false, joinTableName: "database_owner_to_tags", columnNames: ["databaseOwnerId", "tagId"], hasJoinTableId: false },
  },
  columns: databaseOwnerMetaColumns,
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
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new SimpleFieldSerde("id", paintingMetaColumns["id"]), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new SimpleFieldSerde("title", paintingMetaColumns["title"]), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new SimpleFieldSerde("createdAt", paintingMetaColumns["createdAt"]), immutable: false, default: "schema" },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new SimpleFieldSerde("updatedAt", paintingMetaColumns["updatedAt"]), immutable: false },
    "artist": { kind: "m2o", fieldName: "artist", fieldIdName: "artistId", derived: false, required: true, otherMetadata: paintingMetaColumns["artistId"].idMetadata!, otherFieldName: "paintings", serde: new SimpleFieldSerde("artist", paintingMetaColumns["artistId"]), immutable: false },
  },
  columns: paintingMetaColumns,
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
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new SimpleFieldSerde("id", tagMetaColumns["id"]), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new SimpleFieldSerde("title", tagMetaColumns["title"]), immutable: false },
    "authors": { kind: "m2m", fieldName: "authors", fieldIdName: "authorIds", required: false, derived: false, otherMetadata: () => authorMeta, otherFieldName: "tags", serde: undefined, immutable: false, joinTableName: "author_to_tags", columnNames: ["tagId", "authorId"], hasJoinTableId: true },
    "books": { kind: "m2m", fieldName: "books", fieldIdName: "bookIds", required: false, derived: false, otherMetadata: () => bookMeta, otherFieldName: "tags", serde: undefined, immutable: false, joinTableName: "book_to_tags", columnNames: ["tagId", "bookId"], hasJoinTableId: false },
    "databaseOwners": { kind: "m2m", fieldName: "databaseOwners", fieldIdName: "databaseOwnerIds", required: false, derived: false, otherMetadata: () => databaseOwnerMeta, otherFieldName: "tags", serde: undefined, immutable: false, joinTableName: "database_owner_to_tags", columnNames: ["tagId", "databaseOwnerId"], hasJoinTableId: false },
  },
  columns: tagMetaColumns,
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
