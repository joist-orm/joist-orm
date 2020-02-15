import { EntityOrmField, EntityManager, ManyToOneReference, Reference, Collection, ManyToManyCollection } from "../src";
import { bookMeta, Book, Author, Tag } from "./entities";

export interface BookOpts {
  title: string;
  author: Author;
}

export class BookCodegen {
  readonly __orm: EntityOrmField;

  readonly author: Reference<Book, Author, never> = new ManyToOneReference<Book, Author, never>(
    this,
    Author,
    "author",
    "books",
  );

  readonly tags: Collection<Book, Tag> = new ManyToManyCollection(
    "books_to_tags",
    this,
    "tags",
    "book_id",
    Tag,
    "books",
    "tag_id",
  );

  constructor(em: EntityManager, opts: BookOpts) {
    this.__orm = { em, metadata: bookMeta, data: {} };
    em.register(this);
    Object.entries(opts).forEach(([key, value]) => {
      if ((this as any)[key] instanceof ManyToOneReference) {
        (this as any)[key].set(value);
      } else {
        (this as any)[key] = value;
      }
    });
  }

  get id(): string | undefined {
    return this.__orm.data["id"];
  }

  get title(): string {
    return this.__orm.data["title"];
  }

  set title(title: string) {
    this.ensureNotDeleted();
    this.__orm.data["title"] = title;
    this.__orm.em.markDirty(this);
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  toString(): string {
    return "Book#" + this.id;
  }

  private ensureNotDeleted() {
    if (this.__orm.deleted) {
      throw new Error(this.toString() + " is marked as deleted");
    }
  }
}
