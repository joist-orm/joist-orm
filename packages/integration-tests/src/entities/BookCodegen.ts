import {
  Flavor,
  EntityOrmField,
  EntityManager,
  setOpts,
  fail,
  Reference,
  ManyToOneReference,
  Collection,
  ManyToManyCollection,
} from "joist-orm";
import { bookMeta, Tag, Book, Author } from "./entities";

export type BookId = Flavor<string, "Book">;

export interface BookOpts {
  title: string;
  author: Author;
  tags?: Tag[];
}

export class BookCodegen {
  readonly __orm: EntityOrmField;

  readonly author: Reference<Book, Author, never> = new ManyToOneReference(this, Author, "author", "books", true);

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
    this.__orm = { em, metadata: bookMeta, data: {}, originalData: {} };
    em.register(this);
    setOpts(this, opts);
  }

  get id(): BookId | undefined {
    return this.__orm.data["id"];
  }

  get idOrFail(): BookId {
    return this.__orm.data["id"] || fail("Entity has no id yet");
  }

  get title(): string {
    return this.__orm.data["title"];
  }

  set title(title: string) {
    this.ensureNotDeleted();
    this.__orm.em.setField(this, "title", title);
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
