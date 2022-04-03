import { BaseEntity, configureMetadata, EntityManager as EntityManager1, EntityMetadata, KeySerde, PrimitiveSerde } from "joist-orm";
import { Context } from "src/context";
import { Author, authorConfig, Book, bookConfig, newAuthor, newBook } from "./entities";

export class EntityManager extends EntityManager1<Context> {}

export function getEm(e: BaseEntity): EntityManager {
  return e.em as EntityManager;
}

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
    books: { kind: "o2m", fieldName: "books", fieldIdName: "bookIds", required: false, otherMetadata: () => bookMeta, otherFieldName: "authorId", serde: undefined },
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
    authorId: { kind: "m2o", fieldName: "authorId", fieldIdName: "authorIdId", required: true, otherMetadata: () => authorMeta, otherFieldName: "books", serde: new KeySerde("a", "authorId", "authorId", "int") },
  },
  timestampFields: { createdAt: undefined, updatedAt: undefined },
  config: bookConfig,
  factory: newBook,
};

(Book as any).metadata = bookMeta;

export const allMetadata = [authorMeta, bookMeta];
configureMetadata(allMetadata);
