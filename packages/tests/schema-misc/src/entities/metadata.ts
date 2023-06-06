import { BaseEntity, configureMetadata, EntityManager as EntityManager1, EntityMetadata, KeySerde, PrimitiveSerde } from "joist-orm";
import { Context } from "src/context";
import { Artist, artistConfig, Author, authorConfig, Book, bookConfig, DatabaseOwner, databaseOwnerConfig, newArtist, newAuthor, newBook, newDatabaseOwner, newPainting, Painting, paintingConfig } from "./entities";

export class EntityManager extends EntityManager1<Context> {}

export function getEm(e: BaseEntity): EntityManager {
  return e.em as EntityManager;
}

export const artistMeta: EntityMetadata<Artist> = {
  cstr: Artist,
  type: "Artist",
  baseType: undefined,
  idType: "uuid",
  idTagged: true,
  tagName: "artist",
  tableName: "artists",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "uuid", tagName: "artist" }), immutable: true },
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "firstName", columnName: "firstName", dbType: "character varying", tagName: "artist" }), immutable: false },
    "lastName": { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "lastName", columnName: "lastName", dbType: "character varying", tagName: "artist" }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "createdAt", columnName: "createdAt", dbType: "timestamp without time zone", tagName: "artist" }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "updatedAt", columnName: "updatedAt", dbType: "timestamp without time zone", tagName: "artist" }), immutable: false },
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
  idType: "int",
  idTagged: true,
  tagName: "a",
  tableName: "authors",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "int", tagName: "a" }), immutable: true },
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "firstName", columnName: "firstName", dbType: "character varying", tagName: "a" }), immutable: false },
    "lastName": { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "lastName", columnName: "lastName", dbType: "character varying", tagName: "a" }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "createdAt", columnName: "createdAt", dbType: "timestamp with time zone", tagName: "a" }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "updatedAt", columnName: "updatedAt", dbType: "timestamp with time zone", tagName: "a" }), immutable: false },
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
  idType: "int",
  idTagged: true,
  tagName: "b",
  tableName: "book",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "int", tagName: "b" }), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "title", columnName: "title", dbType: "character varying", tagName: "b" }), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: true, otherMetadata: () => authorMeta, otherFieldName: "books", serde: new KeySerde({ fieldName: "author", columnName: "authorId", dbType: "int", tagName: "b", otherTagName: "a" }), immutable: false },
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
  idType: "int",
  idTagged: true,
  tagName: "do",
  tableName: "database_owners",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "int", tagName: "do" }), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "name", columnName: "name", dbType: "character varying", tagName: "do" }), immutable: false },
  },
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
  idType: "uuid",
  idTagged: true,
  tagName: "p",
  tableName: "paintings",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde({ fieldName: "id", columnName: "id", dbType: "uuid", tagName: "p" }), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde({ fieldName: "title", columnName: "title", dbType: "character varying", tagName: "p" }), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "createdAt", columnName: "createdAt", dbType: "timestamp without time zone", tagName: "p" }), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde({ fieldName: "updatedAt", columnName: "updatedAt", dbType: "timestamp without time zone", tagName: "p" }), immutable: false },
    "artist": { kind: "m2o", fieldName: "artist", fieldIdName: "artistId", derived: false, required: true, otherMetadata: () => artistMeta, otherFieldName: "paintings", serde: new KeySerde({ fieldName: "artist", columnName: "artistId", dbType: "uuid", tagName: "p", otherTagName: "artist" }), immutable: false },
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
