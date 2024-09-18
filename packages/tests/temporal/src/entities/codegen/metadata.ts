import { configureMetadata, type Entity as Entity2, EntityManager as EntityManager1, type EntityMetadata, KeySerde, PlainDateSerde, PrimitiveSerde, ZonedDateTimeSerde } from "joist-orm";
import { type Context } from "src/context";
import { Temporal } from "temporal-polyfill";
import { Author } from "../Author";
import { Book } from "../Book";
import { authorConfig, bookConfig, newAuthor, newBook } from "../entities";

export class EntityManager extends EntityManager1<Context, Entity> {}

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
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("a", "id", "id", "int"), immutable: true },
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("firstName", "firstName", "character varying"), immutable: false },
    "lastName": { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("lastName", "lastName", "character varying"), immutable: false },
    "birthday": { kind: "primitive", fieldName: "birthday", fieldIdName: undefined, derived: false, required: true, protected: false, type: Temporal.PlainDate, serde: new PlainDateSerde("birthday", "birthday", "date", "America/Los_Angeles"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Temporal.ZonedDateTime, serde: new ZonedDateTimeSerde("createdAt", "created_at", "timestamp with time zone", "America/Los_Angeles"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Temporal.ZonedDateTime, serde: new ZonedDateTimeSerde("updatedAt", "updated_at", "timestamp with time zone", "America/Los_Angeles"), immutable: false },
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
    "publishedAt": { kind: "primitive", fieldName: "publishedAt", fieldIdName: undefined, derived: false, required: true, protected: false, type: Temporal.ZonedDateTime, serde: new ZonedDateTimeSerde("publishedAt", "published_at", "timestamp with time zone", "America/Los_Angeles"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Temporal.ZonedDateTime, serde: new ZonedDateTimeSerde("createdAt", "created_at", "timestamp with time zone", "America/Los_Angeles"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Temporal.ZonedDateTime, serde: new ZonedDateTimeSerde("updatedAt", "updated_at", "timestamp with time zone", "America/Los_Angeles"), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: true, otherMetadata: () => authorMeta, otherFieldName: "books", serde: new KeySerde("a", "author", "author_id", "int"), immutable: false },
  },
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
