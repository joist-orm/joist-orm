import { configureMetadata, DateSerde, type Entity as Entity2, EntityManager as EntityManager1, type EntityMetadata, KeySerde, PrimitiveSerde, setRuntimeConfig } from "joist-orm";
import { type Context } from "src/context";
import { Artist } from "../Artist";
import { Author } from "../Author";
import { Book } from "../Book";
import { DatabaseOwner } from "../DatabaseOwner";
import { Painting } from "../Painting";
import { artistConfig, authorConfig, bookConfig, databaseOwnerConfig, newArtist, newAuthor, newBook, newDatabaseOwner, newPainting, paintingConfig } from "../entities";

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
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("artist", "id", "id", "uuid"), immutable: true },
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("firstName", "firstName", "character varying"), immutable: false },
    "lastName": { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("lastName", "lastName", "character varying"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "createdAt", "timestamp without time zone"), immutable: false, default: "schema" },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updatedAt", "timestamp without time zone"), immutable: false },
    "paintings": { kind: "o2m", fieldName: "paintings", fieldIdName: "paintingIds", required: false, otherMetadata: () => paintingMeta, otherFieldName: "artist", serde: undefined, immutable: false },
  },
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
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("a", "id", "id", "int"), immutable: true },
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("firstName", "firstName", "character varying"), immutable: false },
    "lastName": { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("lastName", "lastName", "character varying"), immutable: false },
    "delete": { kind: "primitive", fieldName: "delete", fieldIdName: undefined, derived: false, required: false, protected: false, type: "boolean", serde: new PrimitiveSerde("delete", "delete", "boolean"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "createdAt", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updatedAt", "timestamp with time zone"), immutable: false },
    "books": { kind: "o2m", fieldName: "books", fieldIdName: "bookIds", required: false, otherMetadata: () => bookMeta, otherFieldName: "author", serde: undefined, immutable: false },
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
  idType: "tagged-string",
  idDbType: "int",
  tagName: "b",
  tableName: "book",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("b", "id", "id", "int"), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("title", "title", "character varying"), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: true, otherMetadata: () => authorMeta, otherFieldName: "books", serde: new KeySerde("a", "author", "authorId", "int"), immutable: false },
  },
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
  fields: { "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("do", "id", "id", "int"), immutable: true }, "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("name", "name", "character varying"), immutable: false } },
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
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("p", "id", "id", "uuid"), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("title", "title", "character varying"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "createdAt", "timestamp without time zone"), immutable: false, default: "schema" },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updatedAt", "timestamp without time zone"), immutable: false },
    "artist": { kind: "m2o", fieldName: "artist", fieldIdName: "artistId", derived: false, required: true, otherMetadata: () => artistMeta, otherFieldName: "paintings", serde: new KeySerde("artist", "artist", "artistId", "uuid"), immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: paintingConfig,
  factory: newPainting,
  baseTypes: [],
  subTypes: [],
};

(Painting as any).metadata = paintingMeta;

export const allMetadata = [artistMeta, authorMeta, bookMeta, databaseOwnerMeta, paintingMeta];
configureMetadata(allMetadata);
