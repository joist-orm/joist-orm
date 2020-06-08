import {
  Flavor,
  ValueFilter,
  OrderBy,
  ConfigApi,
  BaseEntity,
  EntityManager,
  setOpts,
  OptsOf,
  PartialOrNull,
  Changes,
  newChangesProxy,
  Lens,
  loadLens,
  LoadHint,
  Loaded,
  getEm,
  EntityFilter,
  FilterOf,
  newRequiredRule,
  Collection,
  OneToManyCollection,
  Reference,
  ManyToOneReference,
  ManyToManyCollection,
  setField,
} from "joist-orm";
import { Book, bookMeta, Author, BookReview, Tag, AuthorId, AuthorOrder, bookReviewMeta } from "./entities";

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

export const bookConfig = new ConfigApi<Book>();

bookConfig.addRule(newRequiredRule("title"));
bookConfig.addRule(newRequiredRule("createdAt"));
bookConfig.addRule(newRequiredRule("updatedAt"));
bookConfig.addRule(newRequiredRule("author"));

export abstract class BookCodegen extends BaseEntity {
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
    super(em, bookMeta);
    this.set(opts as BookOpts, { calledFromConstructor: true } as any);
  }

  get id(): BookId | undefined {
    return this.__orm.data["id"];
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

  set(values: Partial<BookOpts>, opts: { ignoreUndefined?: boolean } = {}): void {
    setOpts(this, values as OptsOf<this>, opts);
  }

  setUnsafe(values: PartialOrNull<BookOpts>, opts: { ignoreUndefined?: boolean } = {}): void {
    setOpts(this, values as OptsOf<this>, { ignoreUndefined: true, ...opts });
  }

  get changes(): Changes<Book> {
    return newChangesProxy((this as any) as Book);
  }

  async load<U, V>(fn: (lens: Lens<Book>) => Lens<U, V>): Promise<V> {
    return loadLens((this as any) as Book, fn);
  }

  async populate<H extends LoadHint<Book>>(hint: H): Promise<Loaded<Book, H>> {
    return getEm(this).populate((this as any) as Book, hint);
  }
}
