import { BaseEntity, configureMetadata, DecimalToNumberSerde, EntityManager as EntityManager1, EntityMetadata, EnumArrayFieldSerde, EnumFieldSerde, KeySerde, PolymorphicKeySerde, PrimitiveSerde, SuperstructSerde } from "joist-orm";
import { Context } from "src/context";
import { address } from "src/entities/types";
import { AdvanceStatuses, Author, authorConfig, Book, BookAdvance, bookAdvanceConfig, bookConfig, BookReview, bookReviewConfig, Colors, Comment, commentConfig, Critic, CriticColumn, criticColumnConfig, criticConfig, Image, imageConfig, ImageTypes, newAuthor, newBook, newBookAdvance, newBookReview, newComment, newCritic, newCriticColumn, newImage, newPublisher, newTag, Publisher, publisherConfig, PublisherSizes, PublisherTypes, Tag, tagConfig } from "./entities";

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
    firstName: { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("firstName", "first_name", "character varying") },
    lastName: { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("lastName", "last_name", "character varying") },
    initials: { kind: "primitive", fieldName: "initials", fieldIdName: undefined, derived: "sync", required: false, protected: false, type: "string", serde: new PrimitiveSerde("initials", "initials", "character varying") },
    numberOfBooks: { kind: "primitive", fieldName: "numberOfBooks", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "number", serde: new PrimitiveSerde("numberOfBooks", "number_of_books", "int") },
    isPopular: { kind: "primitive", fieldName: "isPopular", fieldIdName: undefined, derived: false, required: false, protected: false, type: "boolean", serde: new PrimitiveSerde("isPopular", "is_popular", "boolean") },
    age: { kind: "primitive", fieldName: "age", fieldIdName: undefined, derived: false, required: false, protected: false, type: "number", serde: new PrimitiveSerde("age", "age", "int") },
    graduated: { kind: "primitive", fieldName: "graduated", fieldIdName: undefined, derived: false, required: false, protected: false, type: "Date", serde: new PrimitiveSerde("graduated", "graduated", "date") },
    wasEverPopular: { kind: "primitive", fieldName: "wasEverPopular", fieldIdName: undefined, derived: false, required: false, protected: true, type: "boolean", serde: new PrimitiveSerde("wasEverPopular", "was_ever_popular", "boolean") },
    address: { kind: "primitive", fieldName: "address", fieldIdName: undefined, derived: false, required: false, protected: false, type: "Object", serde: new SuperstructSerde("address", "address", address) },
    createdAt: { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("createdAt", "created_at", "timestamp with time zone") },
    updatedAt: { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("updatedAt", "updated_at", "timestamp with time zone") },
    favoriteShape: { kind: "primitive", fieldName: "favoriteShape", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("favoriteShape", "favorite_shape", "string") },
    favoriteColors: { kind: "enum", fieldName: "favoriteColors", fieldIdName: undefined, required: false, enumDetailType: Colors, serde: new EnumArrayFieldSerde("favoriteColors", "favorite_colors", Colors) },
    mentor: { kind: "m2o", fieldName: "mentor", fieldIdName: "mentorId", required: false, otherMetadata: () => authorMeta, otherFieldName: "authors", serde: new KeySerde("a", "mentor", "mentor_id", "int") },
    publisher: { kind: "m2o", fieldName: "publisher", fieldIdName: "publisherId", required: false, otherMetadata: () => publisherMeta, otherFieldName: "authors", serde: new KeySerde("p", "publisher", "publisher_id", "int") },
    authors: { kind: "o2m", fieldName: "authors", fieldIdName: "authorIds", required: false, otherMetadata: () => authorMeta, otherFieldName: "mentor", serde: undefined },
    books: { kind: "o2m", fieldName: "books", fieldIdName: "bookIds", required: false, otherMetadata: () => bookMeta, otherFieldName: "author", serde: undefined },
    comments: { kind: "o2m", fieldName: "comments", fieldIdName: "commentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "parent", serde: undefined },
    tags: { kind: "m2m", fieldName: "tags", fieldIdName: "tagIds", required: false, otherMetadata: () => tagMeta, otherFieldName: "authors", serde: undefined },
    image: { kind: "o2o", fieldName: "image", fieldIdName: "imageId", required: false, otherMetadata: () => imageMeta, otherFieldName: "author", serde: undefined },
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
  tableName: "books",
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("b", "id", "id", "int") },
    title: { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("title", "title", "character varying") },
    order: { kind: "primitive", fieldName: "order", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde("order", "order", "int") },
    createdAt: { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("createdAt", "created_at", "timestamp with time zone") },
    updatedAt: { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("updatedAt", "updated_at", "timestamp with time zone") },
    author: { kind: "m2o", fieldName: "author", fieldIdName: "authorId", required: true, otherMetadata: () => authorMeta, otherFieldName: "books", serde: new KeySerde("a", "author", "author_id", "int") },
    advances: { kind: "o2m", fieldName: "advances", fieldIdName: "advanceIds", required: false, otherMetadata: () => bookAdvanceMeta, otherFieldName: "book", serde: undefined },
    reviews: { kind: "o2m", fieldName: "reviews", fieldIdName: "reviewIds", required: false, otherMetadata: () => bookReviewMeta, otherFieldName: "book", serde: undefined },
    comments: { kind: "o2m", fieldName: "comments", fieldIdName: "commentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "parent", serde: undefined },
    tags: { kind: "m2m", fieldName: "tags", fieldIdName: "tagIds", required: false, otherMetadata: () => tagMeta, otherFieldName: "books", serde: undefined },
    image: { kind: "o2o", fieldName: "image", fieldIdName: "imageId", required: false, otherMetadata: () => imageMeta, otherFieldName: "book", serde: undefined },
  },
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt" },
  config: bookConfig,
  factory: newBook,
};

(Book as any).metadata = bookMeta;

export const bookAdvanceMeta: EntityMetadata<BookAdvance> = {
  cstr: BookAdvance,
  type: "BookAdvance",
  idType: "int",
  tagName: "ba",
  tableName: "book_advances",
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("ba", "id", "id", "int") },
    createdAt: { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("createdAt", "created_at", "timestamp with time zone") },
    updatedAt: { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("updatedAt", "updated_at", "timestamp with time zone") },
    status: { kind: "enum", fieldName: "status", fieldIdName: undefined, required: true, enumDetailType: AdvanceStatuses, serde: new EnumFieldSerde("status", "status_id", AdvanceStatuses) },
    book: { kind: "m2o", fieldName: "book", fieldIdName: "bookId", required: true, otherMetadata: () => bookMeta, otherFieldName: "advances", serde: new KeySerde("b", "book", "book_id", "int") },
    publisher: { kind: "m2o", fieldName: "publisher", fieldIdName: "publisherId", required: true, otherMetadata: () => publisherMeta, otherFieldName: "bookAdvances", serde: new KeySerde("p", "publisher", "publisher_id", "int") },
  },
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt" },
  config: bookAdvanceConfig,
  factory: newBookAdvance,
};

(BookAdvance as any).metadata = bookAdvanceMeta;

export const bookReviewMeta: EntityMetadata<BookReview> = {
  cstr: BookReview,
  type: "BookReview",
  idType: "int",
  tagName: "br",
  tableName: "book_reviews",
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("br", "id", "id", "int") },
    rating: { kind: "primitive", fieldName: "rating", fieldIdName: undefined, derived: false, required: true, protected: false, type: "number", serde: new PrimitiveSerde("rating", "rating", "int") },
    isPublic: { kind: "primitive", fieldName: "isPublic", fieldIdName: undefined, derived: "async", required: false, protected: false, type: "boolean", serde: new PrimitiveSerde("isPublic", "is_public", "boolean") },
    createdAt: { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("createdAt", "created_at", "timestamp with time zone") },
    updatedAt: { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("updatedAt", "updated_at", "timestamp with time zone") },
    book: { kind: "m2o", fieldName: "book", fieldIdName: "bookId", required: true, otherMetadata: () => bookMeta, otherFieldName: "reviews", serde: new KeySerde("b", "book", "book_id", "int") },
    comment: { kind: "o2o", fieldName: "comment", fieldIdName: "commentId", required: false, otherMetadata: () => commentMeta, otherFieldName: "parent", serde: undefined },
  },
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt" },
  config: bookReviewConfig,
  factory: newBookReview,
};

(BookReview as any).metadata = bookReviewMeta;

export const commentMeta: EntityMetadata<Comment> = {
  cstr: Comment,
  type: "Comment",
  idType: "int",
  tagName: "comment",
  tableName: "comments",
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("comment", "id", "id", "int") },
    text: { kind: "primitive", fieldName: "text", fieldIdName: undefined, derived: false, required: false, protected: false, type: "string", serde: new PrimitiveSerde("text", "text", "text") },
    createdAt: { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("createdAt", "created_at", "timestamp with time zone") },
    updatedAt: { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("updatedAt", "updated_at", "timestamp with time zone") },
    parent: {
      kind: "poly",
      fieldName: "parent",
      fieldIdName: "parentId",
      required: true,
      components: [
        { otherMetadata: () => authorMeta, otherFieldName: "comments", columnName: "parent_author_id" },
        { otherMetadata: () => bookMeta, otherFieldName: "comments", columnName: "parent_book_id" },
        { otherMetadata: () => bookReviewMeta, otherFieldName: "comment", columnName: "parent_book_review_id" },
        { otherMetadata: () => publisherMeta, otherFieldName: "comments", columnName: "parent_publisher_id" },
      ],
      serde: new PolymorphicKeySerde(() => commentMeta, "parent"),
    },
  },
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt" },
  config: commentConfig,
  factory: newComment,
};

(Comment as any).metadata = commentMeta;

export const criticMeta: EntityMetadata<Critic> = {
  cstr: Critic,
  type: "Critic",
  idType: "int",
  tagName: "c",
  tableName: "critics",
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("c", "id", "id", "int") },
    name: { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("name", "name", "character varying") },
    createdAt: { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("createdAt", "created_at", "timestamp with time zone") },
    updatedAt: { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("updatedAt", "updated_at", "timestamp with time zone") },
    criticColumn: { kind: "o2o", fieldName: "criticColumn", fieldIdName: "criticColumnId", required: false, otherMetadata: () => criticColumnMeta, otherFieldName: "critic", serde: undefined },
  },
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt" },
  config: criticConfig,
  factory: newCritic,
};

(Critic as any).metadata = criticMeta;

export const criticColumnMeta: EntityMetadata<CriticColumn> = {
  cstr: CriticColumn,
  type: "CriticColumn",
  idType: "int",
  tagName: "cc",
  tableName: "critic_columns",
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("cc", "id", "id", "int") },
    name: { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("name", "name", "character varying") },
    createdAt: { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("createdAt", "created_at", "timestamp with time zone") },
    updatedAt: { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("updatedAt", "updated_at", "timestamp with time zone") },
    critic: { kind: "m2o", fieldName: "critic", fieldIdName: "criticId", required: true, otherMetadata: () => criticMeta, otherFieldName: "criticColumn", serde: new KeySerde("c", "critic", "critic_id", "int") },
  },
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt" },
  config: criticColumnConfig,
  factory: newCriticColumn,
};

(CriticColumn as any).metadata = criticColumnMeta;

export const imageMeta: EntityMetadata<Image> = {
  cstr: Image,
  type: "Image",
  idType: "int",
  tagName: "i",
  tableName: "images",
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("i", "id", "id", "int") },
    fileName: { kind: "primitive", fieldName: "fileName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("fileName", "file_name", "character varying") },
    createdAt: { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("createdAt", "created_at", "timestamp with time zone") },
    updatedAt: { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("updatedAt", "updated_at", "timestamp with time zone") },
    type: { kind: "enum", fieldName: "type", fieldIdName: undefined, required: true, enumDetailType: ImageTypes, serde: new EnumFieldSerde("type", "type_id", ImageTypes) },
    author: { kind: "m2o", fieldName: "author", fieldIdName: "authorId", required: false, otherMetadata: () => authorMeta, otherFieldName: "image", serde: new KeySerde("a", "author", "author_id", "int") },
    book: { kind: "m2o", fieldName: "book", fieldIdName: "bookId", required: false, otherMetadata: () => bookMeta, otherFieldName: "image", serde: new KeySerde("b", "book", "book_id", "int") },
    publisher: { kind: "m2o", fieldName: "publisher", fieldIdName: "publisherId", required: false, otherMetadata: () => publisherMeta, otherFieldName: "images", serde: new KeySerde("p", "publisher", "publisher_id", "int") },
  },
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt" },
  config: imageConfig,
  factory: newImage,
};

(Image as any).metadata = imageMeta;

export const publisherMeta: EntityMetadata<Publisher> = {
  cstr: Publisher,
  type: "Publisher",
  idType: "int",
  tagName: "p",
  tableName: "publishers",
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("p", "id", "id", "int") },
    name: { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("name", "name", "character varying") },
    latitude: { kind: "primitive", fieldName: "latitude", fieldIdName: undefined, derived: false, required: false, protected: false, type: "number", serde: new DecimalToNumberSerde("latitude", "latitude") },
    longitude: { kind: "primitive", fieldName: "longitude", fieldIdName: undefined, derived: false, required: false, protected: false, type: "number", serde: new DecimalToNumberSerde("longitude", "longitude") },
    hugeNumber: { kind: "primitive", fieldName: "hugeNumber", fieldIdName: undefined, derived: false, required: false, protected: false, type: "number", serde: new DecimalToNumberSerde("hugeNumber", "huge_number") },
    createdAt: { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("createdAt", "created_at", "timestamp with time zone") },
    updatedAt: { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("updatedAt", "updated_at", "timestamp with time zone") },
    size: { kind: "enum", fieldName: "size", fieldIdName: undefined, required: false, enumDetailType: PublisherSizes, serde: new EnumFieldSerde("size", "size_id", PublisherSizes) },
    type: { kind: "enum", fieldName: "type", fieldIdName: undefined, required: true, enumDetailType: PublisherTypes, serde: new EnumFieldSerde("type", "type_id", PublisherTypes) },
    tag: { kind: "m2o", fieldName: "tag", fieldIdName: "tagId", required: false, otherMetadata: () => tagMeta, otherFieldName: "publishers", serde: new KeySerde("t", "tag", "tag_id", "int") },
    authors: { kind: "o2m", fieldName: "authors", fieldIdName: "authorIds", required: false, otherMetadata: () => authorMeta, otherFieldName: "publisher", serde: undefined },
    bookAdvances: { kind: "o2m", fieldName: "bookAdvances", fieldIdName: "bookAdvanceIds", required: false, otherMetadata: () => bookAdvanceMeta, otherFieldName: "publisher", serde: undefined },
    comments: { kind: "o2m", fieldName: "comments", fieldIdName: "commentIds", required: false, otherMetadata: () => commentMeta, otherFieldName: "parent", serde: undefined },
    images: { kind: "o2m", fieldName: "images", fieldIdName: "imageIds", required: false, otherMetadata: () => imageMeta, otherFieldName: "publisher", serde: undefined },
  },
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt" },
  config: publisherConfig,
  factory: newPublisher,
};

(Publisher as any).metadata = publisherMeta;

export const tagMeta: EntityMetadata<Tag> = {
  cstr: Tag,
  type: "Tag",
  idType: "int",
  tagName: "t",
  tableName: "tags",
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("t", "id", "id", "int") },
    name: { kind: "primitive", fieldName: "name", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("name", "name", "character varying") },
    createdAt: { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("createdAt", "created_at", "timestamp with time zone") },
    updatedAt: { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("updatedAt", "updated_at", "timestamp with time zone") },
    publishers: { kind: "lo2m", fieldName: "publishers", fieldIdName: "publisherIds", required: false, otherMetadata: () => publisherMeta, otherFieldName: "tag", serde: undefined },
    books: { kind: "m2m", fieldName: "books", fieldIdName: "bookIds", required: false, otherMetadata: () => bookMeta, otherFieldName: "tags", serde: undefined },
  },
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt" },
  config: tagConfig,
  factory: newTag,
};

(Tag as any).metadata = tagMeta;

export const allMetadata = [authorMeta, bookMeta, bookAdvanceMeta, bookReviewMeta, commentMeta, criticMeta, criticColumnMeta, imageMeta, publisherMeta, tagMeta];
configureMetadata(allMetadata);
