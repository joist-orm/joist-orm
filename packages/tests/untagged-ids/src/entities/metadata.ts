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
  idType: "uuid",
  tagName: "a",
  tableName: "authors",
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("a", "id", "id", "uuid") },
    firstName: { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("firstName", "first_name", "character varying") },
    lastName: { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("lastName", "last_name", "character varying") },
    createdAt: { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("createdAt", "created_at", "timestamp with time zone") },
    updatedAt: { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("updatedAt", "updated_at", "timestamp with time zone") },
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
  idType: "uuid",
  tagName: "b",
  tableName: "books",
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("b", "id", "id", "uuid") },
    title: { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("title", "title", "character varying") },
    createdAt: { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("createdAt", "created_at", "timestamp with time zone") },
    updatedAt: { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("updatedAt", "updated_at", "timestamp with time zone") },
    author: { kind: "m2o", fieldName: "author", fieldIdName: "authorId", required: true, otherMetadata: () => authorMeta, otherFieldName: "books", serde: new KeySerde("a", "author", "author_id", "uuid") },
  },
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt" },
  config: bookConfig,
  factory: newBook,
};

(Book as any).metadata = bookMeta;

export const allMetadata = [authorMeta, bookMeta];
configureMetadata(allMetadata);
