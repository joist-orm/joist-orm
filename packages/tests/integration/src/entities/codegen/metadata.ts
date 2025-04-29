import { BigIntSerde, configureMetadata, CustomSerdeAdapter, DateSerde, DecimalToNumberSerde, type Entity as Entity2, EntityManager as EntityManager1, type EntityMetadata, EnumArrayFieldSerde, EnumFieldSerde, JsonSerde, KeySerde, PolymorphicKeySerde, PrimitiveSerde, setRuntimeConfig, SuperstructSerde, ZodSerde } from "joist-orm";
import { type Knex } from "knex";
import { type Context } from "src/context";
import { address, AddressSchema, PasswordValueSerde, quotes } from "src/entities/types";
import { AdminUser } from "../AdminUser";
import { Author } from "../Author";
import { AuthorSchedule } from "../AuthorSchedule";
import { AuthorStat } from "../AuthorStat";
import { Book } from "../Book";
import { BookAdvance } from "../BookAdvance";
import { BookReview } from "../BookReview";
import { Child } from "../Child";
import { ChildGroup } from "../ChildGroup";
import { ChildItem } from "../ChildItem";
import { Comment } from "../Comment";
import { Critic } from "../Critic";
import { CriticColumn } from "../CriticColumn";
import { Image } from "../Image";
import { LargePublisher } from "../LargePublisher";
import { ParentGroup } from "../ParentGroup";
import { ParentItem } from "../ParentItem";
import { Publisher } from "../Publisher";
import { PublisherGroup } from "../PublisherGroup";
import { SmallPublisher } from "../SmallPublisher";
import { SmallPublisherGroup } from "../SmallPublisherGroup";
import { Tag } from "../Tag";
import { Task } from "../Task";
import { TaskItem } from "../TaskItem";
import { TaskNew } from "../TaskNew";
import { TaskOld } from "../TaskOld";
import { User } from "../User";
import {
  adminUserConfig,
  AdvanceStatuses,
  authorConfig,
  authorScheduleConfig,
  authorStatConfig,
  bookAdvanceConfig,
  bookConfig,
  BookRanges,
  bookReviewConfig,
  childConfig,
  childGroupConfig,
  childItemConfig,
  Colors,
  commentConfig,
  criticColumnConfig,
  criticConfig,
  imageConfig,
  ImageTypes,
  largePublisherConfig,
  newAdminUser,
  newAuthor,
  newAuthorSchedule,
  newAuthorStat,
  newBook,
  newBookAdvance,
  newBookReview,
  newChild,
  newChildGroup,
  newChildItem,
  newComment,
  newCritic,
  newCriticColumn,
  newImage,
  newLargePublisher,
  newParentGroup,
  newParentItem,
  newPublisher,
  newPublisherGroup,
  newSmallPublisher,
  newSmallPublisherGroup,
  newTag,
  newTask,
  newTaskItem,
  newTaskNew,
  newTaskOld,
  newUser,
  parentGroupConfig,
  parentItemConfig,
  publisherConfig,
  publisherGroupConfig,
  PublisherSizes,
  PublisherTypes,
  smallPublisherConfig,
  smallPublisherGroupConfig,
  tagConfig,
  taskConfig,
  taskItemConfig,
  taskNewConfig,
  taskOldConfig,
  TaskTypes,
  userConfig,
} from "../entities";

setRuntimeConfig({ temporal: false });

export class EntityManager extends EntityManager1<Context, Entity, Knex.Transaction> {}

export interface Entity extends Entity2 {
  id: string;
  em: EntityManager;
}

export const adminUserMeta: EntityMetadata<AdminUser> = {
  cstr: AdminUser,
  type: "AdminUser",
  baseType: "User",
  inheritanceType: "cti",
  idType: "tagged-string",
  idDbType: "int",
  tagName: "u",
  tableName: "admin_users",
  fields: { "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("u", "id", "id", "int"), immutable: true }, "role": { kind: "primitive", fieldName: "role", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("role", "role", "character varying"), immutable: false } },
  allFields: {},
  orderBy: undefined,
  timestampFields: undefined,
  config: adminUserConfig,
  factory: newAdminUser,
  baseTypes: [],
  subTypes: [],
};

(AdminUser as any).metadata = adminUserMeta;

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
    "firstName": { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("firstName", "first_name", "character varying"), immutable: false },
    "lastName": { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("lastName", "last_name", "character varying"), immutable: false },
    "ssn": { kind: "primitive", fieldName: "ssn", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("ssn", "ssn", "character varying"), immutable: false },
    "initials": { kind: "primitive", fieldName: "initials", fieldIdName: undefined, derived: "sync", required: false, protected: false, type: "string", serde: new PrimitiveSerde("initials", "initials", "character varying"), immutable: false, default: "schema" },
    "numberOfBooks": { kind: "primitive", fieldName: "numberOfBooks", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "number", serde: new PrimitiveSerde("numberOfBooks", "number_of_books", "int"), immutable: false },
    "bookComments": { kind: "primitive", fieldName: "bookComments", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "string", serde: new PrimitiveSerde("bookComments", "book_comments", "text"), immutable: false },
    "isPopular": { kind: "primitive", fieldName: "isPopular", fieldIdName: undefined, derived: false, required: false, protected: false, type: "boolean", serde: new PrimitiveSerde("isPopular", "is_popular", "boolean"), immutable: false },
    "age": { kind: "primitive", fieldName: "age", fieldIdName: undefined, derived: false, required: false, protected: false, type: "number", serde: new PrimitiveSerde("age", "age", "int"), immutable: false },
    "graduated": { kind: "primitive", fieldName: "graduated", fieldIdName: undefined, derived: false, required: false, protected: false, type: Date, serde: new DateSerde("graduated", "graduated", "date"), immutable: false },
    "nickNames": { kind: "primitive", fieldName: "nickNames", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("nickNames", "nick_names", "character varying[]", true), immutable: false, default: "config" },
    "nickNamesUpper": { kind: "primitive", fieldName: "nickNamesUpper", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "string", serde: new PrimitiveSerde("nickNamesUpper", "nick_names_upper", "character varying[]", true), immutable: false },
    "wasEverPopular": { kind: "primitive", fieldName: "wasEverPopular", fieldIdName: undefined, derived: false, required: false, protected: true, type: "boolean", serde: new PrimitiveSerde("wasEverPopular", "was_ever_popular", "boolean"), immutable: false },
    "isFunny": { kind: "primitive", fieldName: "isFunny", fieldIdName: undefined, derived: false, required: true, protected: false, type: "boolean", serde: new PrimitiveSerde("isFunny", "is_funny", "boolean"), immutable: false, default: "schema" },
    "mentorNames": { kind: "primitive", fieldName: "mentorNames", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "string", serde: new PrimitiveSerde("mentorNames", "mentor_names", "text"), immutable: false },
    "address": { kind: "primitive", fieldName: "address", fieldIdName: undefined, derived: false, required: false, protected: false, type: "Object", serde: new SuperstructSerde("address", "address", address), immutable: false },
    "businessAddress": { kind: "primitive", fieldName: "businessAddress", fieldIdName: undefined, derived: false, required: false, protected: false, type: "Object", serde: new ZodSerde("businessAddress", "business_address", AddressSchema), immutable: false },
    "quotes": { kind: "primitive", fieldName: "quotes", fieldIdName: undefined, derived: false, required: false, protected: false, type: "Object", serde: new SuperstructSerde("quotes", "quotes", quotes), immutable: false },
    "numberOfAtoms": { kind: "primitive", fieldName: "numberOfAtoms", fieldIdName: undefined, derived: false, required: false, protected: false, type: "bigint", serde: new BigIntSerde("numberOfAtoms", "number_of_atoms"), immutable: false },
    "deletedAt": { kind: "primitive", fieldName: "deletedAt", fieldIdName: undefined, derived: false, required: false, protected: false, type: Date, serde: new DateSerde("deletedAt", "deleted_at", "timestamp with time zone"), immutable: false },
    "numberOfPublicReviews": { kind: "primitive", fieldName: "numberOfPublicReviews", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "number", serde: new PrimitiveSerde("numberOfPublicReviews", "number_of_public_reviews", "int"), immutable: false },
    "numberOfPublicReviews2": { kind: "primitive", fieldName: "numberOfPublicReviews2", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "number", serde: new PrimitiveSerde("numberOfPublicReviews2", "numberOfPublicReviews2", "int"), immutable: false },
    "tagsOfAllBooks": { kind: "primitive", fieldName: "tagsOfAllBooks", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "string", serde: new PrimitiveSerde("tagsOfAllBooks", "tags_of_all_books", "character varying"), immutable: false },
    "search": { kind: "primitive", fieldName: "search", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "string", serde: new PrimitiveSerde("search", "search", "text"), immutable: false },
    "certificate": { kind: "primitive", fieldName: "certificate", fieldIdName: undefined, derived: false, required: false, protected: false, type: "Uint8Array", serde: new PrimitiveSerde("certificate", "certificate", "bytea"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "favoriteShape": { kind: "primitive", fieldName: "favoriteShape", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("favoriteShape", "favorite_shape", "favorite_shape"), immutable: false },
    "rangeOfBooks": { kind: "enum", fieldName: "rangeOfBooks", fieldIdName: undefined, required: false, derived: "async", enumDetailType: BookRanges, serde: new EnumFieldSerde("rangeOfBooks", "range_of_books", "int", BookRanges), immutable: false },
    "favoriteColors": { kind: "enum", fieldName: "favoriteColors", fieldIdName: undefined, required: false, derived: false, enumDetailType: Colors, serde: new EnumArrayFieldSerde("favoriteColors", "favorite_colors", "int[]", Colors), immutable: false, default: "schema" },
    "mentor": { kind: "m2o", fieldName: "mentor", fieldIdName: "mentorId", derived: false, required: false, otherMetadata: () => authorMeta, otherFieldName: "mentees", serde: new KeySerde("a", "mentor", "mentor_id", "int"), immutable: false },
    "rootMentor": { kind: "m2o", fieldName: "rootMentor", fieldIdName: "rootMentorId", derived: "async", required: false, otherMetadata: () => authorMeta, otherFieldName: "rootMentorAuthors", serde: new KeySerde("a", "rootMentor", "root_mentor_id", "int"), immutable: false },
    "currentDraftBook": { kind: "m2o", fieldName: "currentDraftBook", fieldIdName: "currentDraftBookId", derived: false, required: false, otherMetadata: () => bookMeta, otherFieldName: "currentDraftAuthor", serde: new KeySerde("b", "currentDraftBook", "current_draft_book_id", "int"), immutable: false },
    "favoriteBook": { kind: "m2o", fieldName: "favoriteBook", fieldIdName: "favoriteBookId", derived: "async", required: false, otherMetadata: () => bookMeta, otherFieldName: "favoriteAuthor", serde: new KeySerde("b", "favoriteBook", "favorite_book_id", "int"), immutable: false },
    "publisher": { kind: "m2o", fieldName: "publisher", fieldIdName: "publisherId", derived: false, required: false, otherMetadata: () => publisherMeta, otherFieldName: "authors", serde: new KeySerde("p", "publisher", "publisher_id", "int"), immutable: false },
    "mentees": { kind: "o2m", fieldName: "mentees", fieldIdName: "menteeIds", required: false, otherMetadata: () => authorMeta, otherFieldName: "mentor", serde: undefined, immutable: false },
    "books": { kind: "o2m", fieldName: "books", fieldIdName: "bookIds", required: false, otherMetadata: () => bookMeta, otherFieldName: "author", serde: undefined, immutable: false },
    "reviewerBooks": { kind: "o2m", fieldName: "reviewerBooks", fieldIdName: "reviewerBookIds", required: false, otherMetadata: () => bookMeta, otherFieldName: "reviewer", serde: undefined, immutable: false },
    "schedules": { kind: "o2m", fieldName: "schedules", fieldIdName: "scheduleIds", required: false, otherMetadata: () => authorScheduleMeta, otherFieldName: "author", serde: undefined, immutable: false },
    "comments": { kind: "o2m", fieldName: "comments", fieldIdName: "commentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "parent", serde: undefined, immutable: false },
    "spotlightAuthorPublishers": { kind: "o2m", fieldName: "spotlightAuthorPublishers", fieldIdName: "spotlightAuthorPublisherIds", required: false, otherMetadata: () => publisherMeta, otherFieldName: "spotlightAuthor", serde: undefined, immutable: false },
    "tasks": { kind: "o2m", fieldName: "tasks", fieldIdName: "taskIds", required: false, otherMetadata: () => taskNewMeta, otherFieldName: "specialNewAuthor", serde: undefined, immutable: false },
    "tags": { kind: "m2m", fieldName: "tags", fieldIdName: "tagIds", required: false, otherMetadata: () => tagMeta, otherFieldName: "authors", serde: undefined, immutable: false, joinTableName: "authors_to_tags", columnNames: ["author_id", "tag_id"] },
    "image": { kind: "o2o", fieldName: "image", fieldIdName: "imageId", required: false, otherMetadata: () => imageMeta, otherFieldName: "author", serde: undefined, immutable: false },
    "userOneToOne": { kind: "o2o", fieldName: "userOneToOne", fieldIdName: "userOneToOneId", required: false, otherMetadata: () => userMeta, otherFieldName: "authorManyToOne", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: "deletedAt" },
  config: authorConfig,
  factory: newAuthor,
  baseTypes: [],
  subTypes: [],
};

(Author as any).metadata = authorMeta;

export const authorScheduleMeta: EntityMetadata<AuthorSchedule> = {
  cstr: AuthorSchedule,
  type: "AuthorSchedule",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "authorSchedule",
  tableName: "author_schedules",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("authorSchedule", "id", "id", "int"), immutable: true },
    "overview": { kind: "primitive", fieldName: "overview", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("overview", "overview", "text"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: true, otherMetadata: () => authorMeta, otherFieldName: "schedules", serde: new KeySerde("a", "author", "author_id", "int"), immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: authorScheduleConfig,
  factory: newAuthorSchedule,
  baseTypes: [],
  subTypes: [],
};

(AuthorSchedule as any).metadata = authorScheduleMeta;

export const authorStatMeta: EntityMetadata<AuthorStat> = {
  cstr: AuthorStat,
  type: "AuthorStat",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "as",
  tableName: "author_stats",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("as", "id", "id", "int"), immutable: true },
    "smallint": { kind: "primitive", fieldName: "smallint", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde("smallint", "smallint", "smallint"), immutable: false },
    "integer": { kind: "primitive", fieldName: "integer", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde("integer", "integer", "int"), immutable: false },
    "nullableInteger": { kind: "primitive", fieldName: "nullableInteger", fieldIdName: undefined, derived: false, required: false, protected: false, type: "number", serde: new PrimitiveSerde("nullableInteger", "nullable_integer", "int"), immutable: false },
    "bigint": { kind: "primitive", fieldName: "bigint", fieldIdName: undefined, derived: false, required: true, protected: false, type: "bigint", serde: new BigIntSerde("bigint", "bigint"), immutable: false },
    "decimal": { kind: "primitive", fieldName: "decimal", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new DecimalToNumberSerde("decimal", "decimal"), immutable: false },
    "real": { kind: "primitive", fieldName: "real", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde("real", "real", "real"), immutable: false },
    "smallserial": { kind: "primitive", fieldName: "smallserial", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde("smallserial", "smallserial", "smallint"), immutable: false, default: "schema" },
    "serial": { kind: "primitive", fieldName: "serial", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde("serial", "serial", "int"), immutable: false, default: "schema" },
    "bigserial": { kind: "primitive", fieldName: "bigserial", fieldIdName: undefined, derived: false, required: true, protected: false, type: "bigint", serde: new BigIntSerde("bigserial", "bigserial"), immutable: false, default: "schema" },
    "doublePrecision": { kind: "primitive", fieldName: "doublePrecision", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde("doublePrecision", "double_precision", "double precision"), immutable: false },
    "nullableText": { kind: "primitive", fieldName: "nullableText", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("nullableText", "nullable_text", "text"), immutable: false },
    "json": { kind: "primitive", fieldName: "json", fieldIdName: undefined, derived: false, required: false, protected: false, type: "Object", serde: new JsonSerde("json", "json"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: authorStatConfig,
  factory: newAuthorStat,
  baseTypes: [],
  subTypes: [],
};

(AuthorStat as any).metadata = authorStatMeta;

export const bookMeta: EntityMetadata<Book> = {
  cstr: Book,
  type: "Book",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "b",
  tableName: "books",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("b", "id", "id", "int"), immutable: true },
    "title": { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("title", "title", "character varying"), immutable: false },
    "order": { kind: "primitive", fieldName: "order", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde("order", "order", "int"), immutable: false, default: "config" },
    "notes": { kind: "primitive", fieldName: "notes", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("notes", "notes", "text"), immutable: false, default: "config" },
    "acknowledgements": { kind: "primitive", fieldName: "acknowledgements", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("acknowledgements", "acknowledgements", "text"), immutable: false },
    "authorsNickNames": { kind: "primitive", fieldName: "authorsNickNames", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("authorsNickNames", "authors_nick_names", "text"), immutable: false, default: "config" },
    "search": { kind: "primitive", fieldName: "search", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "string", serde: new PrimitiveSerde("search", "search", "text"), immutable: false },
    "deletedAt": { kind: "primitive", fieldName: "deletedAt", fieldIdName: undefined, derived: false, required: false, protected: false, type: Date, serde: new DateSerde("deletedAt", "deleted_at", "timestamp with time zone"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "prequel": { kind: "m2o", fieldName: "prequel", fieldIdName: "prequelId", derived: false, required: false, otherMetadata: () => bookMeta, otherFieldName: "sequel", serde: new KeySerde("b", "prequel", "prequel_id", "int"), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: true, otherMetadata: () => authorMeta, otherFieldName: "books", serde: new KeySerde("a", "author", "author_id", "int"), immutable: false, default: "config" },
    "reviewer": { kind: "m2o", fieldName: "reviewer", fieldIdName: "reviewerId", derived: false, required: false, otherMetadata: () => authorMeta, otherFieldName: "reviewerBooks", serde: new KeySerde("a", "reviewer", "reviewer_id", "int"), immutable: false, default: "config" },
    "randomComment": { kind: "m2o", fieldName: "randomComment", fieldIdName: "randomCommentId", derived: false, required: false, otherMetadata: () => commentMeta, otherFieldName: "books", serde: new KeySerde("comment", "randomComment", "random_comment_id", "int"), immutable: false },
    "advances": { kind: "o2m", fieldName: "advances", fieldIdName: "advanceIds", required: false, otherMetadata: () => bookAdvanceMeta, otherFieldName: "book", serde: undefined, immutable: false },
    "reviews": { kind: "o2m", fieldName: "reviews", fieldIdName: "reviewIds", required: false, otherMetadata: () => bookReviewMeta, otherFieldName: "book", serde: undefined, immutable: false },
    "comments": { kind: "o2m", fieldName: "comments", fieldIdName: "commentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "parent", serde: undefined, immutable: false },
    "tags": { kind: "m2m", fieldName: "tags", fieldIdName: "tagIds", required: false, otherMetadata: () => tagMeta, otherFieldName: "books", serde: undefined, immutable: false, joinTableName: "books_to_tags", columnNames: ["book_id", "tag_id"] },
    "sequel": { kind: "o2o", fieldName: "sequel", fieldIdName: "sequelId", required: false, otherMetadata: () => bookMeta, otherFieldName: "prequel", serde: undefined, immutable: false },
    "currentDraftAuthor": { kind: "o2o", fieldName: "currentDraftAuthor", fieldIdName: "currentDraftAuthorId", required: false, otherMetadata: () => authorMeta, otherFieldName: "currentDraftBook", serde: undefined, immutable: false },
    "favoriteAuthor": { kind: "o2o", fieldName: "favoriteAuthor", fieldIdName: "favoriteAuthorId", required: false, otherMetadata: () => authorMeta, otherFieldName: "favoriteBook", serde: undefined, immutable: false },
    "image": { kind: "o2o", fieldName: "image", fieldIdName: "imageId", required: false, otherMetadata: () => imageMeta, otherFieldName: "book", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: "title",
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: "deletedAt" },
  config: bookConfig,
  factory: newBook,
  baseTypes: [],
  subTypes: [],
};

(Book as any).metadata = bookMeta;

export const bookAdvanceMeta: EntityMetadata<BookAdvance> = {
  cstr: BookAdvance,
  type: "BookAdvance",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "ba",
  tableName: "book_advances",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("ba", "id", "id", "int"), immutable: true },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "status": { kind: "enum", fieldName: "status", fieldIdName: undefined, required: true, derived: false, enumDetailType: AdvanceStatuses, serde: new EnumFieldSerde("status", "status_id", "int", AdvanceStatuses), immutable: false },
    "book": { kind: "m2o", fieldName: "book", fieldIdName: "bookId", derived: false, required: true, otherMetadata: () => bookMeta, otherFieldName: "advances", serde: new KeySerde("b", "book", "book_id", "int"), immutable: false },
    "publisher": { kind: "m2o", fieldName: "publisher", fieldIdName: "publisherId", derived: false, required: true, otherMetadata: () => publisherMeta, otherFieldName: "bookAdvances", serde: new KeySerde("p", "publisher", "publisher_id", "int"), immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: bookAdvanceConfig,
  factory: newBookAdvance,
  baseTypes: [],
  subTypes: [],
};

(BookAdvance as any).metadata = bookAdvanceMeta;

export const bookReviewMeta: EntityMetadata<BookReview> = {
  cstr: BookReview,
  type: "BookReview",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "br",
  tableName: "book_reviews",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("br", "id", "id", "int"), immutable: true },
    "rating": { kind: "primitive", fieldName: "rating", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde("rating", "rating", "int"), immutable: false },
    "isPublic": { kind: "primitive", fieldName: "isPublic", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "boolean", serde: new PrimitiveSerde("isPublic", "is_public", "boolean"), immutable: false },
    "isTest": { kind: "primitive", fieldName: "isTest", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "boolean", serde: new PrimitiveSerde("isTest", "is_test", "boolean"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "book": { kind: "m2o", fieldName: "book", fieldIdName: "bookId", derived: false, required: true, otherMetadata: () => bookMeta, otherFieldName: "reviews", serde: new KeySerde("b", "book", "book_id", "int"), immutable: false },
    "critic": { kind: "m2o", fieldName: "critic", fieldIdName: "criticId", derived: false, required: false, otherMetadata: () => criticMeta, otherFieldName: "bookReviews", serde: new KeySerde("c", "critic", "critic_id", "int"), immutable: false },
    "tags": { kind: "m2m", fieldName: "tags", fieldIdName: "tagIds", required: false, otherMetadata: () => tagMeta, otherFieldName: "bookReviews", serde: undefined, immutable: false, joinTableName: "book_reviews_to_tags", columnNames: ["book_review_id", "tag_id"] },
    "comment": { kind: "o2o", fieldName: "comment", fieldIdName: "commentId", required: false, otherMetadata: () => commentMeta, otherFieldName: "parent", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: bookReviewConfig,
  factory: newBookReview,
  baseTypes: [],
  subTypes: [],
};

(BookReview as any).metadata = bookReviewMeta;

export const childMeta: EntityMetadata<Child> = {
  cstr: Child,
  type: "Child",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "child",
  tableName: "children",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("child", "id", "id", "int"), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("name", "name", "text"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "groups": { kind: "o2m", fieldName: "groups", fieldIdName: "groupIds", required: false, otherMetadata: () => childGroupMeta, otherFieldName: "childGroup", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: childConfig,
  factory: newChild,
  baseTypes: [],
  subTypes: [],
};

(Child as any).metadata = childMeta;

export const childGroupMeta: EntityMetadata<ChildGroup> = {
  cstr: ChildGroup,
  type: "ChildGroup",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "cg",
  tableName: "child_groups",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("cg", "id", "id", "int"), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("name", "name", "text"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "childGroup": { kind: "m2o", fieldName: "childGroup", fieldIdName: "childGroupId", derived: false, required: true, otherMetadata: () => childMeta, otherFieldName: "groups", serde: new KeySerde("child", "childGroup", "child_group_id", "int"), immutable: false },
    "parentGroup": { kind: "m2o", fieldName: "parentGroup", fieldIdName: "parentGroupId", derived: false, required: true, otherMetadata: () => parentGroupMeta, otherFieldName: "childGroups", serde: new KeySerde("parentGroup", "parentGroup", "parent_group_id", "int"), immutable: false },
    "childItems": { kind: "o2m", fieldName: "childItems", fieldIdName: "childItemIds", required: false, otherMetadata: () => childItemMeta, otherFieldName: "childGroup", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: childGroupConfig,
  factory: newChildGroup,
  baseTypes: [],
  subTypes: [],
};

(ChildGroup as any).metadata = childGroupMeta;

export const childItemMeta: EntityMetadata<ChildItem> = {
  cstr: ChildItem,
  type: "ChildItem",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "ci",
  tableName: "child_items",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("ci", "id", "id", "int"), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("name", "name", "text"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "childGroup": { kind: "m2o", fieldName: "childGroup", fieldIdName: "childGroupId", derived: false, required: true, otherMetadata: () => childGroupMeta, otherFieldName: "childItems", serde: new KeySerde("cg", "childGroup", "child_group_id", "int"), immutable: false },
    "parentItem": { kind: "m2o", fieldName: "parentItem", fieldIdName: "parentItemId", derived: false, required: true, otherMetadata: () => parentItemMeta, otherFieldName: "childItems", serde: new KeySerde("pi", "parentItem", "parent_item_id", "int"), immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: childItemConfig,
  factory: newChildItem,
  baseTypes: [],
  subTypes: [],
};

(ChildItem as any).metadata = childItemMeta;

export const commentMeta: EntityMetadata<Comment> = {
  cstr: Comment,
  type: "Comment",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "comment",
  tableName: "comments",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("comment", "id", "id", "int"), immutable: true },
    "parentTaggedId": { kind: "primitive", fieldName: "parentTaggedId", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "string", serde: new PrimitiveSerde("parentTaggedId", "parent_tagged_id", "text"), immutable: false },
    "parentTags": { kind: "primitive", fieldName: "parentTags", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "string", serde: new PrimitiveSerde("parentTags", "parent_tags", "text"), immutable: false },
    "text": { kind: "primitive", fieldName: "text", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("text", "text", "text"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "user": { kind: "m2o", fieldName: "user", fieldIdName: "userId", derived: false, required: false, otherMetadata: () => userMeta, otherFieldName: "createdComments", serde: new KeySerde("u", "user", "user_id", "int"), immutable: false },
    "books": { kind: "o2m", fieldName: "books", fieldIdName: "bookIds", required: false, otherMetadata: () => bookMeta, otherFieldName: "randomComment", serde: undefined, immutable: false },
    "likedByUsers": { kind: "m2m", fieldName: "likedByUsers", fieldIdName: "likedByUserIds", required: false, otherMetadata: () => userMeta, otherFieldName: "likedComments", serde: undefined, immutable: false, joinTableName: "users_to_comments", columnNames: ["comment_id", "liked_by_user_id"] },
    "parent": {
      kind: "poly",
      fieldName: "parent",
      fieldIdName: "parentId",
      required: true,
      components: [{ otherMetadata: () => authorMeta, otherFieldName: "comments", columnName: "parent_author_id" }, { otherMetadata: () => bookMeta, otherFieldName: "comments", columnName: "parent_book_id" }, { otherMetadata: () => bookReviewMeta, otherFieldName: "comment", columnName: "parent_book_review_id" }, {
        otherMetadata: () => publisherMeta,
        otherFieldName: "comments",
        columnName: "parent_publisher_id",
      }, { otherMetadata: () => taskOldMeta, otherFieldName: "comments", columnName: "parent_task_id" }],
      serde: new PolymorphicKeySerde(() => commentMeta, "parent"),
      immutable: false,
    },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: commentConfig,
  factory: newComment,
  baseTypes: [],
  subTypes: [],
};

(Comment as any).metadata = commentMeta;

export const criticMeta: EntityMetadata<Critic> = {
  cstr: Critic,
  type: "Critic",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "c",
  tableName: "critics",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("c", "id", "id", "int"), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("name", "name", "character varying"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "favoriteLargePublisher": { kind: "m2o", fieldName: "favoriteLargePublisher", fieldIdName: "favoriteLargePublisherId", derived: false, required: false, otherMetadata: () => largePublisherMeta, otherFieldName: "critics", serde: new KeySerde("p", "favoriteLargePublisher", "favorite_large_publisher_id", "int"), immutable: false },
    "group": { kind: "m2o", fieldName: "group", fieldIdName: "groupId", derived: false, required: false, otherMetadata: () => publisherGroupMeta, otherFieldName: "critics", serde: new KeySerde("pg", "group", "group_id", "int"), immutable: false },
    "bookReviews": { kind: "o2m", fieldName: "bookReviews", fieldIdName: "bookReviewIds", required: false, otherMetadata: () => bookReviewMeta, otherFieldName: "critic", serde: undefined, immutable: false },
    "criticColumn": { kind: "o2o", fieldName: "criticColumn", fieldIdName: "criticColumnId", required: false, otherMetadata: () => criticColumnMeta, otherFieldName: "critic", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: criticConfig,
  factory: newCritic,
  baseTypes: [],
  subTypes: [],
};

(Critic as any).metadata = criticMeta;

export const criticColumnMeta: EntityMetadata<CriticColumn> = {
  cstr: CriticColumn,
  type: "CriticColumn",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "cc",
  tableName: "critic_columns",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("cc", "id", "id", "int"), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("name", "name", "character varying"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "critic": { kind: "m2o", fieldName: "critic", fieldIdName: "criticId", derived: false, required: true, otherMetadata: () => criticMeta, otherFieldName: "criticColumn", serde: new KeySerde("c", "critic", "critic_id", "int"), immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: criticColumnConfig,
  factory: newCriticColumn,
  baseTypes: [],
  subTypes: [],
};

(CriticColumn as any).metadata = criticColumnMeta;

export const imageMeta: EntityMetadata<Image> = {
  cstr: Image,
  type: "Image",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "i",
  tableName: "images",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("i", "id", "id", "int"), immutable: true },
    "fileName": { kind: "primitive", fieldName: "fileName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("fileName", "file_name", "character varying"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "type": { kind: "enum", fieldName: "type", fieldIdName: undefined, required: true, derived: false, enumDetailType: ImageTypes, serde: new EnumFieldSerde("type", "type_id", "int", ImageTypes), immutable: false },
    "author": { kind: "m2o", fieldName: "author", fieldIdName: "authorId", derived: false, required: false, otherMetadata: () => authorMeta, otherFieldName: "image", serde: new KeySerde("a", "author", "author_id", "int"), immutable: false },
    "book": { kind: "m2o", fieldName: "book", fieldIdName: "bookId", derived: false, required: false, otherMetadata: () => bookMeta, otherFieldName: "image", serde: new KeySerde("b", "book", "book_id", "int"), immutable: false },
    "publisher": { kind: "m2o", fieldName: "publisher", fieldIdName: "publisherId", derived: false, required: false, otherMetadata: () => publisherMeta, otherFieldName: "images", serde: new KeySerde("p", "publisher", "publisher_id", "int"), immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: imageConfig,
  factory: newImage,
  baseTypes: [],
  subTypes: [],
};

(Image as any).metadata = imageMeta;

export const largePublisherMeta: EntityMetadata<LargePublisher> = {
  cstr: LargePublisher,
  type: "LargePublisher",
  baseType: "Publisher",
  inheritanceType: "cti",
  idType: "tagged-string",
  idDbType: "int",
  tagName: "p",
  tableName: "large_publishers",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("p", "id", "id", "int"), immutable: true },
    "sharedColumn": { kind: "primitive", fieldName: "sharedColumn", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("sharedColumn", "shared_column", "text"), immutable: false },
    "country": { kind: "primitive", fieldName: "country", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("country", "country", "text"), immutable: false },
    "rating": { kind: "primitive", fieldName: "rating", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde("rating", "rating", "int"), immutable: false },
    "spotlightAuthor": { kind: "m2o", fieldName: "spotlightAuthor", fieldIdName: "spotlightAuthorId", derived: false, required: true, otherMetadata: () => authorMeta, otherFieldName: "spotlightAuthorPublishers", serde: new KeySerde("a", "spotlightAuthor", "spotlight_author_id", "int"), immutable: false },
    "critics": { kind: "o2m", fieldName: "critics", fieldIdName: "criticIds", required: false, otherMetadata: () => criticMeta, otherFieldName: "favoriteLargePublisher", serde: undefined, immutable: false },
    "users": { kind: "o2m", fieldName: "users", fieldIdName: "userIds", required: false, otherMetadata: () => userMeta, otherFieldName: "favoritePublisher", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: undefined,
  config: largePublisherConfig,
  factory: newLargePublisher,
  baseTypes: [],
  subTypes: [],
};

(LargePublisher as any).metadata = largePublisherMeta;

export const parentGroupMeta: EntityMetadata<ParentGroup> = {
  cstr: ParentGroup,
  type: "ParentGroup",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "parentGroup",
  tableName: "parent_groups",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("parentGroup", "id", "id", "int"), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("name", "name", "text"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "childGroups": { kind: "o2m", fieldName: "childGroups", fieldIdName: "childGroupIds", required: false, otherMetadata: () => childGroupMeta, otherFieldName: "parentGroup", serde: undefined, immutable: false },
    "parentItems": { kind: "o2m", fieldName: "parentItems", fieldIdName: "parentItemIds", required: false, otherMetadata: () => parentItemMeta, otherFieldName: "parentGroup", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: parentGroupConfig,
  factory: newParentGroup,
  baseTypes: [],
  subTypes: [],
};

(ParentGroup as any).metadata = parentGroupMeta;

export const parentItemMeta: EntityMetadata<ParentItem> = {
  cstr: ParentItem,
  type: "ParentItem",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "pi",
  tableName: "parent_items",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("pi", "id", "id", "int"), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("name", "name", "text"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "parentGroup": { kind: "m2o", fieldName: "parentGroup", fieldIdName: "parentGroupId", derived: false, required: true, otherMetadata: () => parentGroupMeta, otherFieldName: "parentItems", serde: new KeySerde("parentGroup", "parentGroup", "parent_group_id", "int"), immutable: false },
    "childItems": { kind: "o2m", fieldName: "childItems", fieldIdName: "childItemIds", required: false, otherMetadata: () => childItemMeta, otherFieldName: "parentItem", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: parentItemConfig,
  factory: newParentItem,
  baseTypes: [],
  subTypes: [],
};

(ParentItem as any).metadata = parentItemMeta;

export const publisherMeta: EntityMetadata<Publisher> = {
  cstr: Publisher,
  type: "Publisher",
  baseType: undefined,
  inheritanceType: "cti",
  idType: "tagged-string",
  idDbType: "int",
  tagName: "p",
  tableName: "publishers",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("p", "id", "id", "int"), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("name", "name", "character varying"), immutable: false },
    "latitude": { kind: "primitive", fieldName: "latitude", fieldIdName: undefined, derived: false, required: false, protected: false, type: "number", serde: new DecimalToNumberSerde("latitude", "latitude"), immutable: false },
    "longitude": { kind: "primitive", fieldName: "longitude", fieldIdName: undefined, derived: false, required: false, protected: false, type: "number", serde: new DecimalToNumberSerde("longitude", "longitude"), immutable: false },
    "hugeNumber": { kind: "primitive", fieldName: "hugeNumber", fieldIdName: undefined, derived: false, required: false, protected: false, type: "number", serde: new DecimalToNumberSerde("hugeNumber", "huge_number"), immutable: false },
    "numberOfBookReviews": { kind: "primitive", fieldName: "numberOfBookReviews", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "number", serde: new PrimitiveSerde("numberOfBookReviews", "number_of_book_reviews", "int"), immutable: false, default: "schema" },
    "deletedAt": { kind: "primitive", fieldName: "deletedAt", fieldIdName: undefined, derived: false, required: false, protected: false, type: Date, serde: new DateSerde("deletedAt", "deleted_at", "timestamp with time zone"), immutable: false },
    "titlesOfFavoriteBooks": { kind: "primitive", fieldName: "titlesOfFavoriteBooks", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "string", serde: new PrimitiveSerde("titlesOfFavoriteBooks", "titles_of_favorite_books", "text"), immutable: false },
    "bookAdvanceTitlesSnapshot": { kind: "primitive", fieldName: "bookAdvanceTitlesSnapshot", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "string", serde: new PrimitiveSerde("bookAdvanceTitlesSnapshot", "book_advance_titles_snapshot", "text"), immutable: false },
    "numberOfBookAdvancesSnapshot": { kind: "primitive", fieldName: "numberOfBookAdvancesSnapshot", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "string", serde: new PrimitiveSerde("numberOfBookAdvancesSnapshot", "number_of_book_advances_snapshot", "text"), immutable: false },
    "baseSyncDefault": { kind: "primitive", fieldName: "baseSyncDefault", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("baseSyncDefault", "base_sync_default", "text"), immutable: false, default: "config" },
    "baseAsyncDefault": { kind: "primitive", fieldName: "baseAsyncDefault", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("baseAsyncDefault", "base_async_default", "text"), immutable: false, default: "config" },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "favoriteAuthorName": { kind: "primitive", fieldName: "favoriteAuthorName", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "string", serde: new PrimitiveSerde("favoriteAuthorName", "favorite_author_name", "text"), immutable: false },
    "rating": { kind: "primitive", fieldName: "rating", fieldIdName: undefined, derived: false, required: false, protected: false, type: "number", serde: new PrimitiveSerde("rating", "rating", "int"), immutable: false },
    "size": { kind: "enum", fieldName: "size", fieldIdName: undefined, required: false, derived: false, enumDetailType: PublisherSizes, serde: new EnumFieldSerde("size", "size_id", "int", PublisherSizes), immutable: false },
    "type": { kind: "enum", fieldName: "type", fieldIdName: undefined, required: true, derived: false, enumDetailType: PublisherTypes, serde: new EnumFieldSerde("type", "type_id", "int", PublisherTypes), immutable: false, default: "config" },
    "favoriteAuthor": { kind: "m2o", fieldName: "favoriteAuthor", fieldIdName: "favoriteAuthorId", derived: "async", required: false, otherMetadata: () => authorMeta, otherFieldName: "favoriteAuthorPublishers", serde: new KeySerde("a", "favoriteAuthor", "favorite_author_id", "int"), immutable: false },
    "group": { kind: "m2o", fieldName: "group", fieldIdName: "groupId", derived: false, required: false, otherMetadata: () => publisherGroupMeta, otherFieldName: "publishers", serde: new KeySerde("pg", "group", "group_id", "int"), immutable: false },
    "spotlightAuthor": { kind: "m2o", fieldName: "spotlightAuthor", fieldIdName: "spotlightAuthorId", derived: false, required: false, otherMetadata: () => authorMeta, otherFieldName: "spotlightAuthorPublishers", serde: new KeySerde("a", "spotlightAuthor", "spotlight_author_id", "int"), immutable: false, default: "config" },
    "authors": { kind: "o2m", fieldName: "authors", fieldIdName: "authorIds", required: false, otherMetadata: () => authorMeta, otherFieldName: "publisher", serde: undefined, immutable: false },
    "bookAdvances": { kind: "o2m", fieldName: "bookAdvances", fieldIdName: "bookAdvanceIds", required: false, otherMetadata: () => bookAdvanceMeta, otherFieldName: "publisher", serde: undefined, immutable: false },
    "comments": { kind: "o2m", fieldName: "comments", fieldIdName: "commentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "parent", serde: undefined, immutable: false },
    "images": { kind: "o2m", fieldName: "images", fieldIdName: "imageIds", required: false, otherMetadata: () => imageMeta, otherFieldName: "publisher", serde: undefined, immutable: false },
    "tags": { kind: "m2m", fieldName: "tags", fieldIdName: "tagIds", required: false, otherMetadata: () => tagMeta, otherFieldName: "publishers", serde: undefined, immutable: false, joinTableName: "publishers_to_tags", columnNames: ["publisher_id", "tag_id"] },
    "tasks": { kind: "m2m", fieldName: "tasks", fieldIdName: "taskIds", required: false, otherMetadata: () => taskOldMeta, otherFieldName: "publishers", serde: undefined, immutable: false, joinTableName: "tasks_to_publishers", columnNames: ["publisher_id", "task_id"] },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: "deletedAt" },
  config: publisherConfig,
  factory: newPublisher,
  baseTypes: [],
  subTypes: [],
};

(Publisher as any).metadata = publisherMeta;

export const publisherGroupMeta: EntityMetadata<PublisherGroup> = {
  cstr: PublisherGroup,
  type: "PublisherGroup",
  baseType: undefined,
  inheritanceType: "cti",
  idType: "tagged-string",
  idDbType: "int",
  tagName: "pg",
  tableName: "publisher_groups",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("pg", "id", "id", "int"), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("name", "name", "text"), immutable: false },
    "numberOfBookReviews": { kind: "primitive", fieldName: "numberOfBookReviews", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "number", serde: new PrimitiveSerde("numberOfBookReviews", "number_of_book_reviews", "int"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "publishers": { kind: "o2m", fieldName: "publishers", fieldIdName: "publisherIds", required: false, otherMetadata: () => publisherMeta, otherFieldName: "group", serde: undefined, immutable: false },
    "critics": { kind: "lo2m", fieldName: "critics", fieldIdName: "criticIds", required: false, otherMetadata: () => criticMeta, otherFieldName: "group", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: publisherGroupConfig,
  factory: newPublisherGroup,
  baseTypes: [],
  subTypes: [],
};

(PublisherGroup as any).metadata = publisherGroupMeta;

export const smallPublisherMeta: EntityMetadata<SmallPublisher> = {
  cstr: SmallPublisher,
  type: "SmallPublisher",
  baseType: "Publisher",
  inheritanceType: "cti",
  idType: "tagged-string",
  idDbType: "int",
  tagName: "p",
  tableName: "small_publishers",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("p", "id", "id", "int"), immutable: true },
    "city": { kind: "primitive", fieldName: "city", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("city", "city", "text"), immutable: false, default: "config" },
    "sharedColumn": { kind: "primitive", fieldName: "sharedColumn", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("sharedColumn", "shared_column", "text"), immutable: false },
    "allAuthorNames": { kind: "primitive", fieldName: "allAuthorNames", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "string", serde: new PrimitiveSerde("allAuthorNames", "all_author_names", "text"), immutable: false },
    "selfReferential": { kind: "m2o", fieldName: "selfReferential", fieldIdName: "selfReferentialId", derived: false, required: false, otherMetadata: () => smallPublisherMeta, otherFieldName: "smallPublishers", serde: new KeySerde("p", "selfReferential", "self_referential_id", "int"), immutable: false },
    "group": { kind: "m2o", fieldName: "group", fieldIdName: "groupId", derived: false, required: false, otherMetadata: () => smallPublisherGroupMeta, otherFieldName: "publishers", serde: new KeySerde("pg", "group", "group_id", "int"), immutable: false },
    "smallPublishers": { kind: "o2m", fieldName: "smallPublishers", fieldIdName: "smallPublisherIds", required: false, otherMetadata: () => smallPublisherMeta, otherFieldName: "selfReferential", serde: undefined, immutable: false },
    "users": { kind: "o2m", fieldName: "users", fieldIdName: "userIds", required: false, otherMetadata: () => userMeta, otherFieldName: "favoritePublisher", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: undefined,
  config: smallPublisherConfig,
  factory: newSmallPublisher,
  baseTypes: [],
  subTypes: [],
};

(SmallPublisher as any).metadata = smallPublisherMeta;

export const smallPublisherGroupMeta: EntityMetadata<SmallPublisherGroup> = {
  cstr: SmallPublisherGroup,
  type: "SmallPublisherGroup",
  baseType: "PublisherGroup",
  inheritanceType: "cti",
  idType: "tagged-string",
  idDbType: "int",
  tagName: "pg",
  tableName: "small_publisher_groups",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("pg", "id", "id", "int"), immutable: true },
    "smallName": { kind: "primitive", fieldName: "smallName", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("smallName", "small_name", "text"), immutable: false },
    "publishers": { kind: "o2m", fieldName: "publishers", fieldIdName: "publisherIds", required: false, otherMetadata: () => smallPublisherMeta, otherFieldName: "group", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: undefined,
  config: smallPublisherGroupConfig,
  factory: newSmallPublisherGroup,
  baseTypes: [],
  subTypes: [],
};

(SmallPublisherGroup as any).metadata = smallPublisherGroupMeta;

export const tagMeta: EntityMetadata<Tag> = {
  cstr: Tag,
  type: "Tag",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "t",
  tableName: "tags",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("t", "id", "id", "int"), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("name", "name", "citext"), immutable: false, citext: true },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "authors": { kind: "m2m", fieldName: "authors", fieldIdName: "authorIds", required: false, otherMetadata: () => authorMeta, otherFieldName: "tags", serde: undefined, immutable: false, joinTableName: "authors_to_tags", columnNames: ["tag_id", "author_id"] },
    "books": { kind: "m2m", fieldName: "books", fieldIdName: "bookIds", required: false, otherMetadata: () => bookMeta, otherFieldName: "tags", serde: undefined, immutable: false, joinTableName: "books_to_tags", columnNames: ["tag_id", "book_id"] },
    "bookReviews": { kind: "m2m", fieldName: "bookReviews", fieldIdName: "bookReviewIds", required: false, otherMetadata: () => bookReviewMeta, otherFieldName: "tags", serde: undefined, immutable: false, joinTableName: "book_reviews_to_tags", columnNames: ["tag_id", "book_review_id"] },
    "publishers": { kind: "m2m", fieldName: "publishers", fieldIdName: "publisherIds", required: false, otherMetadata: () => publisherMeta, otherFieldName: "tags", serde: undefined, immutable: false, joinTableName: "publishers_to_tags", columnNames: ["tag_id", "publisher_id"] },
    "tasks": { kind: "m2m", fieldName: "tasks", fieldIdName: "taskIds", required: false, otherMetadata: () => taskMeta, otherFieldName: "tags", serde: undefined, immutable: false, joinTableName: "task_to_tags", columnNames: ["tag_id", "task_id"] },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: tagConfig,
  factory: newTag,
  baseTypes: [],
  subTypes: [],
};

(Tag as any).metadata = tagMeta;

export const taskMeta: EntityMetadata<Task> = {
  cstr: Task,
  type: "Task",
  baseType: undefined,
  inheritanceType: "sti",
  stiDiscriminatorField: "type",
  idType: "tagged-string",
  idDbType: "int",
  tagName: "task",
  tableName: "tasks",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("task", "id", "id", "int"), immutable: true },
    "durationInDays": { kind: "primitive", fieldName: "durationInDays", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde("durationInDays", "duration_in_days", "int"), immutable: false, default: "config" },
    "deletedAt": { kind: "primitive", fieldName: "deletedAt", fieldIdName: undefined, derived: false, required: false, protected: false, type: Date, serde: new DateSerde("deletedAt", "deleted_at", "timestamp with time zone"), immutable: false },
    "syncDefault": { kind: "primitive", fieldName: "syncDefault", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("syncDefault", "sync_default", "text"), immutable: false, default: "config" },
    "asyncDefault_1": { kind: "primitive", fieldName: "asyncDefault_1", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("asyncDefault_1", "async_default_1", "text"), immutable: false, default: "config" },
    "asyncDefault_2": { kind: "primitive", fieldName: "asyncDefault_2", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("asyncDefault_2", "async_default_2", "text"), immutable: false, default: "config" },
    "syncDerived": { kind: "primitive", fieldName: "syncDerived", fieldIdName: undefined, derived: "sync", required: false, protected: false, type: "string", serde: new PrimitiveSerde("syncDerived", "sync_derived", "text"), immutable: false },
    "asyncDerived": { kind: "primitive", fieldName: "asyncDerived", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "string", serde: new PrimitiveSerde("asyncDerived", "async_derived", "text"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "type": { kind: "enum", fieldName: "type", fieldIdName: undefined, required: false, derived: false, enumDetailType: TaskTypes, serde: new EnumFieldSerde("type", "type_id", "int", TaskTypes), immutable: false },
    "copiedFrom": { kind: "m2o", fieldName: "copiedFrom", fieldIdName: "copiedFromId", derived: false, required: false, otherMetadata: () => taskMeta, otherFieldName: "copiedTo", serde: new KeySerde("task", "copiedFrom", "copied_from_id", "int"), immutable: false },
    "copiedTo": { kind: "o2m", fieldName: "copiedTo", fieldIdName: "copiedToIds", required: false, otherMetadata: () => taskMeta, otherFieldName: "copiedFrom", serde: undefined, immutable: false },
    "taskTaskItems": { kind: "o2m", fieldName: "taskTaskItems", fieldIdName: "taskTaskItemIds", required: false, otherMetadata: () => taskItemMeta, otherFieldName: "task", serde: undefined, immutable: false },
    "tags": { kind: "m2m", fieldName: "tags", fieldIdName: "tagIds", required: false, otherMetadata: () => tagMeta, otherFieldName: "tasks", serde: undefined, immutable: false, joinTableName: "task_to_tags", columnNames: ["task_id", "tag_id"] },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: "deletedAt" },
  config: taskConfig,
  factory: newTask,
  baseTypes: [],
  subTypes: [],
};

(Task as any).metadata = taskMeta;

export const taskItemMeta: EntityMetadata<TaskItem> = {
  cstr: TaskItem,
  type: "TaskItem",
  baseType: undefined,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "ti",
  tableName: "task_items",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("ti", "id", "id", "int"), immutable: true },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "newTask": { kind: "m2o", fieldName: "newTask", fieldIdName: "newTaskId", derived: false, required: false, otherMetadata: () => taskNewMeta, otherFieldName: "newTaskTaskItems", serde: new KeySerde("task", "newTask", "new_task_id", "int"), immutable: false },
    "oldTask": { kind: "m2o", fieldName: "oldTask", fieldIdName: "oldTaskId", derived: false, required: false, otherMetadata: () => taskOldMeta, otherFieldName: "oldTaskTaskItems", serde: new KeySerde("task", "oldTask", "old_task_id", "int"), immutable: false },
    "task": { kind: "m2o", fieldName: "task", fieldIdName: "taskId", derived: false, required: false, otherMetadata: () => taskMeta, otherFieldName: "taskTaskItems", serde: new KeySerde("task", "task", "task_id", "int"), immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: taskItemConfig,
  factory: newTaskItem,
  baseTypes: [],
  subTypes: [],
};

(TaskItem as any).metadata = taskItemMeta;

export const userMeta: EntityMetadata<User> = {
  cstr: User,
  type: "User",
  baseType: undefined,
  inheritanceType: "cti",
  idType: "tagged-string",
  idDbType: "int",
  tagName: "u",
  tableName: "users",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("u", "id", "id", "int"), immutable: true },
    "name": { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("name", "name", "character varying"), immutable: false },
    "email": { kind: "primitive", fieldName: "email", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("email", "email", "character varying"), immutable: false },
    "ipAddress": { kind: "primitive", fieldName: "ipAddress", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("ipAddress", "ip_address", "character varying"), immutable: false },
    "password": { kind: "primitive", fieldName: "password", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new CustomSerdeAdapter("password", "password", "character varying", PasswordValueSerde), immutable: false },
    "bio": { kind: "primitive", fieldName: "bio", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("bio", "bio", "character varying"), immutable: false, default: "schema" },
    "originalEmail": { kind: "primitive", fieldName: "originalEmail", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("originalEmail", "original_email", "character varying"), immutable: false, default: "config" },
    "trialPeriod": { kind: "primitive", fieldName: "trialPeriod", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("trialPeriod", "trial_period", "tstzrange"), immutable: false },
    "createdAt": { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("createdAt", "created_at", "timestamp with time zone"), immutable: false },
    "updatedAt": { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: Date, serde: new DateSerde("updatedAt", "updated_at", "timestamp with time zone"), immutable: false },
    "manager": { kind: "m2o", fieldName: "manager", fieldIdName: "managerId", derived: false, required: false, otherMetadata: () => userMeta, otherFieldName: "directs", serde: new KeySerde("u", "manager", "manager_id", "int"), immutable: false },
    "authorManyToOne": { kind: "m2o", fieldName: "authorManyToOne", fieldIdName: "authorManyToOneId", derived: false, required: false, otherMetadata: () => authorMeta, otherFieldName: "userOneToOne", serde: new KeySerde("a", "authorManyToOne", "author_id", "int"), immutable: false },
    "createdComments": { kind: "o2m", fieldName: "createdComments", fieldIdName: "createdCommentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "user", serde: undefined, immutable: false },
    "directs": { kind: "o2m", fieldName: "directs", fieldIdName: "directIds", required: false, otherMetadata: () => userMeta, otherFieldName: "manager", serde: undefined, immutable: false },
    "likedComments": { kind: "m2m", fieldName: "likedComments", fieldIdName: "likedCommentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "likedByUsers", serde: undefined, immutable: false, joinTableName: "users_to_comments", columnNames: ["liked_by_user_id", "comment_id"] },
    "favoritePublisher": {
      kind: "poly",
      fieldName: "favoritePublisher",
      fieldIdName: "favoritePublisherId",
      required: false,
      components: [{ otherMetadata: () => largePublisherMeta, otherFieldName: "users", columnName: "favorite_publisher_large_id" }, { otherMetadata: () => smallPublisherMeta, otherFieldName: "users", columnName: "favorite_publisher_small_id" }],
      serde: new PolymorphicKeySerde(() => userMeta, "favoritePublisher"),
      immutable: false,
    },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt", deletedAt: undefined },
  config: userConfig,
  factory: newUser,
  baseTypes: [],
  subTypes: [],
};

(User as any).metadata = userMeta;

export const taskNewMeta: EntityMetadata<TaskNew> = {
  cstr: TaskNew,
  type: "TaskNew",
  baseType: "Task",
  inheritanceType: "sti",
  stiDiscriminatorValue: 2,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "task",
  tableName: "tasks",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("task", "id", "id", "int"), immutable: true },
    "specialNewField": { kind: "primitive", fieldName: "specialNewField", fieldIdName: undefined, derived: false, required: false, protected: false, type: "number", serde: new PrimitiveSerde("specialNewField", "special_new_field", "int"), immutable: false },
    "selfReferential": { kind: "m2o", fieldName: "selfReferential", fieldIdName: "selfReferentialId", derived: false, required: false, otherMetadata: () => taskNewMeta, otherFieldName: "selfReferentialTasks", serde: new KeySerde("task", "selfReferential", "self_referential_id", "int"), immutable: false },
    "specialNewAuthor": { kind: "m2o", fieldName: "specialNewAuthor", fieldIdName: "specialNewAuthorId", derived: false, required: false, otherMetadata: () => authorMeta, otherFieldName: "tasks", serde: new KeySerde("a", "specialNewAuthor", "special_new_author_id", "int"), immutable: false },
    "copiedFrom": { kind: "m2o", fieldName: "copiedFrom", fieldIdName: "copiedFromId", derived: false, required: false, otherMetadata: () => taskNewMeta, otherFieldName: "copiedTo", serde: new KeySerde("task", "copiedFrom", "copied_from_id", "int"), immutable: false },
    "newTaskTaskItems": { kind: "o2m", fieldName: "newTaskTaskItems", fieldIdName: "newTaskTaskItemIds", required: false, otherMetadata: () => taskItemMeta, otherFieldName: "newTask", serde: undefined, immutable: false },
    "selfReferentialTasks": { kind: "o2m", fieldName: "selfReferentialTasks", fieldIdName: "selfReferentialTaskIds", required: false, otherMetadata: () => taskNewMeta, otherFieldName: "selfReferential", serde: undefined, immutable: false },
    "copiedTo": { kind: "o2m", fieldName: "copiedTo", fieldIdName: "copiedToIds", required: false, otherMetadata: () => taskNewMeta, otherFieldName: "copiedFrom", serde: undefined, immutable: false },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: undefined,
  config: taskNewConfig,
  factory: newTaskNew,
  baseTypes: [],
  subTypes: [],
};

(TaskNew as any).metadata = taskNewMeta;

export const taskOldMeta: EntityMetadata<TaskOld> = {
  cstr: TaskOld,
  type: "TaskOld",
  baseType: "Task",
  inheritanceType: "sti",
  stiDiscriminatorValue: 1,
  idType: "tagged-string",
  idDbType: "int",
  tagName: "task",
  tableName: "tasks",
  fields: {
    "id": { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("task", "id", "id", "int"), immutable: true },
    "specialOldField": { kind: "primitive", fieldName: "specialOldField", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde("specialOldField", "special_old_field", "int"), immutable: false },
    "parentOldTask": { kind: "m2o", fieldName: "parentOldTask", fieldIdName: "parentOldTaskId", derived: false, required: false, otherMetadata: () => taskOldMeta, otherFieldName: "tasks", serde: new KeySerde("task", "parentOldTask", "parent_old_task_id", "int"), immutable: false },
    "copiedFrom": { kind: "m2o", fieldName: "copiedFrom", fieldIdName: "copiedFromId", derived: false, required: false, otherMetadata: () => taskOldMeta, otherFieldName: "copiedTo", serde: new KeySerde("task", "copiedFrom", "copied_from_id", "int"), immutable: false },
    "comments": { kind: "o2m", fieldName: "comments", fieldIdName: "commentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "parent", serde: undefined, immutable: false },
    "oldTaskTaskItems": { kind: "o2m", fieldName: "oldTaskTaskItems", fieldIdName: "oldTaskTaskItemIds", required: false, otherMetadata: () => taskItemMeta, otherFieldName: "oldTask", serde: undefined, immutable: false },
    "tasks": { kind: "o2m", fieldName: "tasks", fieldIdName: "taskIds", required: false, otherMetadata: () => taskOldMeta, otherFieldName: "parentOldTask", serde: undefined, immutable: false },
    "copiedTo": { kind: "o2m", fieldName: "copiedTo", fieldIdName: "copiedToIds", required: false, otherMetadata: () => taskOldMeta, otherFieldName: "copiedFrom", serde: undefined, immutable: false },
    "publishers": { kind: "m2m", fieldName: "publishers", fieldIdName: "publisherIds", required: false, otherMetadata: () => publisherMeta, otherFieldName: "tasks", serde: undefined, immutable: false, joinTableName: "tasks_to_publishers", columnNames: ["task_id", "publisher_id"] },
  },
  allFields: {},
  orderBy: undefined,
  timestampFields: undefined,
  config: taskOldConfig,
  factory: newTaskOld,
  baseTypes: [],
  subTypes: [],
};

(TaskOld as any).metadata = taskOldMeta;

export const allMetadata = [
  adminUserMeta,
  authorMeta,
  authorScheduleMeta,
  authorStatMeta,
  bookMeta,
  bookAdvanceMeta,
  bookReviewMeta,
  childMeta,
  childGroupMeta,
  childItemMeta,
  commentMeta,
  criticMeta,
  criticColumnMeta,
  imageMeta,
  largePublisherMeta,
  parentGroupMeta,
  parentItemMeta,
  publisherMeta,
  publisherGroupMeta,
  smallPublisherMeta,
  smallPublisherGroupMeta,
  tagMeta,
  taskMeta,
  taskItemMeta,
  userMeta,
  taskNewMeta,
  taskOldMeta,
];
configureMetadata(allMetadata);
