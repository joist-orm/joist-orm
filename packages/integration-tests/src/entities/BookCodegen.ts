import {
  Flavor,
  ValueFilter,
  OrderBy,
  EntityOrmField,
  EntityManager,
  setOpts,
  fail,
  EntityFilter,
  FilterOf,
  Reference,
  ManyToOneReference,
  Collection,
  ManyToManyCollection,
} from "joist-orm";
import { bookMeta, Author, Tag, AuthorId, AuthorOrder, Book } from "./entities";

export type BookId = Flavor<string, "Book">;

export interface BookOpts {
  title: string;
  author: Author;
  tags?: Tag[];
}

export interface BookFilter {
  id?: ValueFilter<BookId, never>;
  title?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  author?: EntityFilter<Author, AuthorId, FilterOf<Author>, never>;
}

export interface BookOrder {
  id?: OrderBy;
  title?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  author?: AuthorOrder;
}

export class BookCodegen {
  readonly __orm: EntityOrmField;
  readonly __filterType: BookFilter = null!;
  readonly __orderType: BookOrder = null!;
  readonly __optsType: BookOpts = null!;

  readonly author: Reference<Book, Author, never> = new ManyToOneReference<Book, Author, never>(
    this as any,
    Author,
    "author",
    "books",
    true,
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

  set(opts: Partial<BookOpts>): void {
    setOpts(this, opts, false);
  }

  private ensureNotDeleted() {
    if (this.__orm.deleted) {
      throw new Error(this.toString() + " is marked as deleted");
    }
  }
}
