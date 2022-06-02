import { BaseEntity, configureMetadata, EntityManager as EntityManager1, EntityMetadata, KeySerde, PrimitiveSerde } from "joist-orm";
import { Context } from "src/context";
import { Artist, artistConfig, Author, authorConfig, Book, bookConfig, newArtist, newAuthor, newBook, newPainting, Painting, paintingConfig } from "./entities";

export class EntityManager extends EntityManager1<Context> {}

export function getEm(e: BaseEntity): EntityManager {
  return e.em as EntityManager;
}

export const artistMeta: EntityMetadata<Artist> = {
  cstr: Artist,
  type: "Artist",
  idType: "uuid",
  tagName: "artist",
  tableName: "artists",
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("artist", "id", "id", "uuid") },
    firstName: { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("firstName", "firstName", "character varying") },
    lastName: { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("lastName", "lastName", "character varying") },
    createdAt: { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("createdAt", "createdAt", "timestamp without time zone") },
    updatedAt: { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("updatedAt", "updatedAt", "timestamp without time zone") },
    paintings: { kind: "o2m", fieldName: "paintings", fieldIdName: "paintingIds", required: false, otherMetadata: () => paintingMeta, otherFieldName: "artist", serde: undefined },
  },
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt" },
  config: artistConfig,
  factory: newArtist,
};

(Artist as any).metadata = artistMeta;

export const authorMeta: EntityMetadata<Author> = {
  cstr: Author,
  type: "Author",
  idType: "int",
  tagName: "a",
  tableName: "authors",
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("a", "id", "id", "int") },
    firstName: { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("firstName", "firstName", "character varying") },
    lastName: { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("lastName", "lastName", "character varying") },
    createdAt: { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("createdAt", "createdAt", "timestamp with time zone") },
    updatedAt: { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("updatedAt", "updatedAt", "timestamp with time zone") },
    books: { kind: "o2m", fieldName: "books", fieldIdName: "bookIds", required: false, otherMetadata: () => bookMeta, otherFieldName: "author", serde: undefined },
  },
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt" },
  config: authorConfig,
  factory: newAuthor,
};

(Author as any).metadata = authorMeta;

export const bookMeta: EntityMetadata<Book> = {
  cstr: Book,
  type: "Book",
  idType: "int",
  tagName: "b",
  tableName: "book",
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("b", "id", "id", "int") },
    title: { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("title", "title", "character varying") },
    author: { kind: "m2o", fieldName: "author", fieldIdName: "authorId", required: true, otherMetadata: () => authorMeta, otherFieldName: "books", serde: new KeySerde("a", "author", "authorId", "int") },
  },
  timestampFields: { createdAt: undefined, updatedAt: undefined },
  config: bookConfig,
  factory: newBook,
};

(Book as any).metadata = bookMeta;

export const paintingMeta: EntityMetadata<Painting> = {
  cstr: Painting,
  type: "Painting",
  idType: "uuid",
  tagName: "p",
  tableName: "paintings",
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("p", "id", "id", "uuid") },
    title: { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("title", "title", "character varying") },
    createdAt: { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("createdAt", "createdAt", "timestamp without time zone") },
    updatedAt: { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("updatedAt", "updatedAt", "timestamp without time zone") },
    artist: { kind: "m2o", fieldName: "artist", fieldIdName: "artistId", required: true, otherMetadata: () => artistMeta, otherFieldName: "paintings", serde: new KeySerde("artist", "artist", "artistId", "uuid") },
  },
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt" },
  config: paintingConfig,
  factory: newPainting,
};

(Painting as any).metadata = paintingMeta;

export const allMetadata = [artistMeta, authorMeta, bookMeta, paintingMeta];
configureMetadata(allMetadata);
