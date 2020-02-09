import { EntityManager, EntityMetadata, EntityOrmField } from "../src/EntityManager";
import { ManyToOneReference } from "../src/collections/ManyToOneReference";
import { ManyToManyCollection } from "../src/collections/ManyToManyCollection";
import { Collection, Reference } from "../src";
import { ForeignKeySerde, PrimaryKeySerde, SimpleSerde } from "../src/serde";
import { Author } from "./Author";
import { Tag } from "./Tag";

export class Book {
  readonly __orm: EntityOrmField;
  readonly author: Reference<Book, Author> = new ManyToOneReference(this, Author, "author", "books");
  readonly tags: Collection<Book, Tag> = new ManyToManyCollection(
    "books_to_tags",
    this,
    "tags",
    "book_id",
    Tag,
    "books",
    "tag_id",
  );

  constructor(em: EntityManager, opts?: Partial<{ title: string }>) {
    this.__orm = { metadata: bookMeta, data: {} as Record<any, any>, em };
    if (opts) {
      Object.entries(opts).forEach(([key, value]) => ((this as any)[key] = value));
    }
    em.register(this);
  }

  // TODO Codegen
  get id(): string | undefined {
    return this.__orm.data["id"];
  }

  get title(): string {
    return this.__orm.data["title"];
  }

  set title(title: string) {
    this.__orm.data["title"] = title;
    this.__orm.em.markDirty(this);
  }

  toString(): string {
    return `Book#${this.id}`;
  }
}

// TODO Codegen
export const bookMeta: EntityMetadata<Book> = {
  cstr: Book,
  type: "Book",
  tableName: "books",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde("id", "id") },
    { fieldName: "title", columnName: "title", dbType: "varchar", serde: new SimpleSerde("title", "title") },
    {
      fieldName: "author",
      columnName: "author_id",
      dbType: "int",
      serde: new ForeignKeySerde("author", "author_id"),
    },
  ],
  order: 2,
};

(Book as any).metadata = bookMeta;
