import {
  Flavor,
  ValueFilter,
  OrderBy,
  BaseEntity,
  EntityOrmField,
  EntityManager,
  setOpts,
  fail,
  EntityFilter,
  FilterOf,
  Collection,
  OneToManyCollection,
  Reference,
  ManyToOneReference,
  ManyToManyCollection,
  setField,
} from "joist-orm";
import { bookMeta, Author, BookReview, Tag, AuthorId, AuthorOrder, Book, bookReviewMeta } from "./entities";

export type BookId = Flavor<string, "Book">;

export interface BookOpts {
  title: string;
  order?: number | null;
  author: Author;
  reviews?: BookReview[];
  tags?: Tag[];
}

export interface BookFilter {
  id?: ValueFilter<BookId, never>;
  title?: ValueFilter<string, never>;
  order?: ValueFilter<number, null | undefined>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  author?: EntityFilter<Author, AuthorId, FilterOf<Author>, never>;
}

export interface BookOrder {
  id?: OrderBy;
  title?: OrderBy;
  order?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  author?: AuthorOrder;
}

export class BookCodegen extends BaseEntity {
  readonly __orm: EntityOrmField;
  readonly __filterType: BookFilter = null!;
  readonly __orderType: BookOrder = null!;
  readonly __optsType: BookOpts = null!;

  readonly reviews: Collection<Book, BookReview> = new OneToManyCollection(
    this as any,
    bookReviewMeta,
    "reviews",
    "book",
    "book_id",
  );

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
    super();
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
    setField(this, "title", title);
  }

  get order(): number | undefined {
    return this.__orm.data["order"];
  }

  set order(order: number | undefined) {
    setField(this, "order", order);
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
}
