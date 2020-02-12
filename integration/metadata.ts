import { EntityMetadata } from "../src";
import { Author, Book, Publisher, Tag } from "./entities";
import { PrimaryKeySerde, SimpleSerde, ForeignKeySerde } from "../src/serde";

export const authorMeta: EntityMetadata<Author> = {
  cstr: Author,
  type: "Author",
  tableName: "authors",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde("id", "id") },

    {
      fieldName: "firstName",
      columnName: "first_name",
      dbType: "character varying",
      serde: new SimpleSerde("firstName", "first_name"),
    },

    {
      fieldName: "publisher",
      columnName: "publisher_id",
      dbType: "int",
      serde: new ForeignKeySerde("publisher", "publisher_id", () => publisherMeta),
    },
  ],
  order: 2,
};

(Author as any).metadata = authorMeta;

export const bookMeta: EntityMetadata<Book> = {
  cstr: Book,
  type: "Book",
  tableName: "books",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde("id", "id") },

    {
      fieldName: "title",
      columnName: "title",
      dbType: "character varying",
      serde: new SimpleSerde("title", "title"),
    },

    {
      fieldName: "author",
      columnName: "author_id",
      dbType: "int",
      serde: new ForeignKeySerde("author", "author_id", () => authorMeta),
    },
  ],
  order: 3,
};

(Book as any).metadata = bookMeta;

export const publisherMeta: EntityMetadata<Publisher> = {
  cstr: Publisher,
  type: "Publisher",
  tableName: "publishers",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde("id", "id") },

    {
      fieldName: "name",
      columnName: "name",
      dbType: "character varying",
      serde: new SimpleSerde("name", "name"),
    },
  ],
  order: 1,
};

(Publisher as any).metadata = publisherMeta;

export const tagMeta: EntityMetadata<Tag> = {
  cstr: Tag,
  type: "Tag",
  tableName: "tags",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde("id", "id") },

    {
      fieldName: "name",
      columnName: "name",
      dbType: "character varying",
      serde: new SimpleSerde("name", "name"),
    },
  ],
  order: 0,
};

(Tag as any).metadata = tagMeta;
