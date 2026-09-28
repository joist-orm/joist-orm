import { Column, type ColumnDescriptors, configureMetadata, type Entity as Entity2, EntityManager as EntityManager1, type EntityMetadata, KeySerde, PlainDateSerde, PlainDateTimeSerde, PlainTimeSerde, PrimitiveSerde, setRuntimeConfig, SimpleFieldSerde, Temporal, ZonedDateTimeSerde } from "joist-orm";
import type { Context } from "src/context";
import { Author } from "../Author";
import { Book } from "../Book";
import { authorConfig, bookConfig, newAuthor, newBook } from "../entities";

setRuntimeConfig({ temporal: { "timeZone": "America/Los_Angeles" } });

export class EntityManager extends EntityManager1<Context, Entity, unknown> {}

export interface Entity extends Entity2 {
  id: string;
  em: EntityManager;
}

const authorMetaColumns = {
  "id": new Column("id", false, true, false, false, true, () => authorMeta, new KeySerde("a", "int")),
  "firstName": new Column("firstName", false, false, false, false, true, undefined, new PrimitiveSerde("character varying")),
  "lastName": new Column("lastName", true, false, false, false, true, undefined, new PrimitiveSerde("character varying")),
  "birthday": new Column("birthday", false, false, false, false, true, undefined, new PlainDateSerde("date")),
  "childrenBirthdays": new Column("children_birthdays", false, true, false, false, true, undefined, new PlainDateSerde("date[]", true)),
  "maybeBirthdays": new Column("maybe_birthdays", true, true, false, false, true, undefined, new PlainDateSerde("date[]", true)),
  "timestamp": new Column("timestamp", false, true, false, false, true, undefined, new PlainDateTimeSerde("timestamp without time zone")),
  "timestamps": new Column("timestamps", false, true, false, false, true, undefined, new PlainDateTimeSerde("timestamp without time zone[]", true)),
  "maybeTimestamps": new Column("maybe_timestamps", true, true, false, false, true, undefined, new PlainDateTimeSerde("timestamp without time zone[]", true)),
  "time": new Column("time", true, true, false, false, true, undefined, new PlainTimeSerde("time without time zone")),
  "times": new Column("times", false, true, false, false, true, undefined, new PlainTimeSerde("time without time zone[]", true)),
  "maybeTimes": new Column("maybe_times", true, true, false, false, true, undefined, new PlainTimeSerde("time without time zone[]", true)),
  "timeToMicros": new Column("time_to_micros", true, true, false, false, true, undefined, new PlainTimeSerde("time without time zone")),
  "createdAt": new Column("created_at", false, false, false, true, true, undefined, new ZonedDateTimeSerde("timestamp with time zone")),
  "updatedAt": new Column("updated_at", false, false, false, true, true, undefined, new ZonedDateTimeSerde("timestamp with time zone")),
} satisfies ColumnDescriptors;
const bookMetaColumns = {
  "id": new Column("id", false, true, false, false, true, () => bookMeta, new KeySerde("b", "int")),
  "title": new Column("title", false, false, false, false, true, undefined, new PrimitiveSerde("character varying")),
  "publishedAt": new Column("published_at", false, false, false, false, true, undefined, new ZonedDateTimeSerde("timestamp with time zone")),
  "timestampTzs": new Column("timestamp_tzs", false, true, false, false, true, undefined, new ZonedDateTimeSerde("timestamp with time zone[]", true)),
  "maybeTimestampTzs": new Column("maybe_timestamp_tzs", true, true, false, false, true, undefined, new ZonedDateTimeSerde("timestamp with time zone[]", true)),
  "createdAt": new Column("created_at", false, false, false, true, true, undefined, new ZonedDateTimeSerde("timestamp with time zone")),
  "updatedAt": new Column("updated_at", false, false, false, true, true, undefined, new ZonedDateTimeSerde("timestamp with time zone")),
  "deletedAt": new Column("deleted_at", true, false, false, false, true, undefined, new ZonedDateTimeSerde("timestamp with time zone")),
  "authorId": new Column("author_id", false, false, false, false, true, () => authorMeta, new KeySerde("a", "int")),
} satisfies ColumnDescriptors;

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
    "birthday": { kind: "primitive", fieldName: "birthday", fieldIdName: undefined, derived: false, required: true, protected: false, type: Temporal.PlainDate, serde: new SimpleFieldSerde("birthday", authorMetaColumns["birthday"]), immutable: false },
    "childrenBirthdays": { kind: "primitive", fieldName: "childrenBirthdays", fieldIdName: undefined, derived: false, required: true, protected: false, type: Temporal.PlainDate, serde: new SimpleFieldSerde("childrenBirthdays", authorMetaColumns["childrenBirthdays"]), immutable: false, default: "schema" },
    "maybeBirthdays": { kind: "primitive", fieldName: "maybeBirthdays", fieldIdName: undefined, derived: false, required: false, protected: false, type: Temporal.PlainDate, serde: new SimpleFieldSerde("maybeBirthdays", authorMetaColumns["maybeBirthdays"]), immutable: false, default: "schema" },
    "timestamp": { kind: "primitive", fieldName: "timestamp", fieldIdName: undefined, derived: false, required: true, protected: false, type: Temporal.PlainDateTime, serde: new SimpleFieldSerde("timestamp", authorMetaColumns["timestamp"]), immutable: false, default: "schema" },
    "timestamps": { kind: "primitive", fieldName: "timestamps", fieldIdName: undefined, derived: false, required: true, protected: false, type: Temporal.PlainDateTime, serde: new SimpleFieldSerde("timestamps", authorMetaColumns["timestamps"]), immutable: false, default: "schema" },
    "maybeTimestamps": { kind: "primitive", fieldName: "maybeTimestamps", fieldIdName: undefined, derived: false, required: false, protected: false, type: Temporal.PlainDateTime, serde: new SimpleFieldSerde("maybeTimestamps", authorMetaColumns["maybeTimestamps"]), immutable: false, default: "schema" },
    "time": { kind: "primitive", fieldName: "time", fieldIdName: undefined, derived: false, required: false, protected: false, type: Temporal.PlainTime, serde: new SimpleFieldSerde("time", authorMetaColumns["time"]), immutable: false, default: "schema" },
    "times": { kind: "primitive", fieldName: "times", fieldIdName: undefined, derived: false, required: true, protected: false, type: Temporal.PlainTime, serde: new SimpleFieldSerde("times", authorMetaColumns["times"]), immutable: false, default: "schema" },
    "maybeTimes": { kind: "primitive", fieldName: "maybeTimes", fieldIdName: undefined, derived: false, required: false, protected: false, type: Temporal.PlainTime, serde: new SimpleFieldSerde("maybeTimes", authorMetaColumns["maybeTimes"]), immutable: false, default: "schema" },
    "timeToMicros": { kind: "primitive", fieldName: "timeToMicros", fieldIdName: undefined, derived: false, required: false, protected: false, type: Temporal.PlainTime, serde: new SimpleFieldSerde("timeToMicros", authorMetaColumns["timeToMicros"]), immutable: false, default: "schema" },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Temporal.ZonedDateTime, serde: new SimpleFieldSerde("createdAt", authorMetaColumns["createdAt"]), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Temporal.ZonedDateTime, serde: new SimpleFieldSerde("updatedAt", authorMetaColumns["updatedAt"]), immutable: false },
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
  idType: "tagged-string",
  idDbType: "int",
  tagName: "b",
  tableName: "book",
  supportsEmExecute: true,
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new SimpleFieldSerde("id", bookMetaColumns["id"]), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new SimpleFieldSerde("title", bookMetaColumns["title"]), immutable: false },
    "publishedAt": { kind: "primitive", fieldName: "publishedAt", fieldIdName: undefined, derived: false, required: true, protected: false, type: Temporal.ZonedDateTime, serde: new SimpleFieldSerde("publishedAt", bookMetaColumns["publishedAt"]), immutable: false },
    "timestampTzs": { kind: "primitive", fieldName: "timestampTzs", fieldIdName: undefined, derived: false, required: true, protected: false, type: Temporal.ZonedDateTime, serde: new SimpleFieldSerde("timestampTzs", bookMetaColumns["timestampTzs"]), immutable: false, default: "schema" },
    "maybeTimestampTzs": { kind: "primitive", fieldName: "maybeTimestampTzs", fieldIdName: undefined, derived: false, required: false, protected: false, type: Temporal.ZonedDateTime, serde: new SimpleFieldSerde("maybeTimestampTzs", bookMetaColumns["maybeTimestampTzs"]), immutable: false, default: "schema" },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Temporal.ZonedDateTime, serde: new SimpleFieldSerde("createdAt", bookMetaColumns["createdAt"]), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Temporal.ZonedDateTime, serde: new SimpleFieldSerde("updatedAt", bookMetaColumns["updatedAt"]), immutable: false },
    "deletedAt": { kind: "primitive", fieldName: "deletedAt", fieldIdName: undefined, derived: false, required: false, protected: false, type: Temporal.ZonedDateTime, serde: new SimpleFieldSerde("deletedAt", bookMetaColumns["deletedAt"]), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: true, otherMetadata: bookMetaColumns["authorId"].idMetadata!, otherFieldName: "books", serde: new SimpleFieldSerde("author", bookMetaColumns["authorId"]), immutable: false },
  },
  columns: bookMetaColumns,
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: "deletedAt" },
  config: bookConfig,
  factory: newBook,
  baseTypes: [],
  subTypes: [],
};

(Book as any).metadata = bookMeta;

export const allMetadata = [authorMeta, bookMeta];
configureMetadata(allMetadata);
