import {
  BaseEntity,
  Changes,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityManager,
  FilterOf,
  Flavor,
  getEm,
  GraphQLFilterOf,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  OptsOf,
  OrderBy,
  OrmApi,
  PartialOrNull,
  setField,
  setOpts,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import {
  Author,
  AuthorId,
  authorMeta,
  AuthorOrder,
  Book,
  BookAdvance,
  BookAdvanceId,
  bookAdvanceMeta,
  bookMeta,
  BookReview,
  BookReviewId,
  bookReviewMeta,
  Comment,
  CommentId,
  commentMeta,
  Image,
  ImageId,
  imageMeta,
  newBook,
  Tag,
  TagId,
  tagMeta,
} from "./entities";

export type BookId = Flavor<string, "Book">;

export interface BookOpts {
  title: string;
  order?: number | null;
  author: Author;
  image?: Image | null;
  advances?: BookAdvance[];
  reviews?: BookReview[];
  comments?: Comment[];
  tags?: Tag[];
}

export interface BookIdsOpts {
  authorId?: AuthorId | null;
  imageId?: ImageId | null;
  advanceIds?: BookAdvanceId[] | null;
  reviewIds?: BookReviewId[] | null;
  commentIds?: CommentId[] | null;
  tagIds?: TagId[] | null;
}

export interface BookFilter {
  id?: ValueFilter<BookId, never>;
  title?: ValueFilter<string, never>;
  order?: ValueFilter<number, null | undefined>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  author?: EntityFilter<Author, AuthorId, FilterOf<Author>, never>;
  image?: EntityFilter<Image, ImageId, FilterOf<Image>, null | undefined>;
}

export interface BookGraphQLFilter {
  id?: ValueGraphQLFilter<BookId>;
  title?: ValueGraphQLFilter<string>;
  order?: ValueGraphQLFilter<number>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  author?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>>;
  image?: EntityGraphQLFilter<Image, ImageId, GraphQLFilterOf<Image>>;
}

export interface BookOrder {
  id?: OrderBy;
  title?: OrderBy;
  order?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  author?: AuthorOrder;
}

export const bookDefaultValues = { order: 0 };

export const bookConfig = new ConfigApi<Book, Context>();

bookConfig.addRule(newRequiredRule("title"));
bookConfig.addRule(newRequiredRule("createdAt"));
bookConfig.addRule(newRequiredRule("updatedAt"));
bookConfig.addRule(newRequiredRule("author"));

export abstract class BookCodegen extends BaseEntity {
  readonly __types: {
    filterType: BookFilter;
    gqlFilterType: BookGraphQLFilter;
    orderType: BookOrder;
    optsType: BookOpts;
    optIdsType: BookIdsOpts;
    factoryOptsType: Parameters<typeof newBook>[1];
  } = null!;
  protected readonly orm = new OrmApi(this as any as Book);

  readonly advances = this.orm.hasMany(bookAdvanceMeta, "advances", "book", "book_id");

  readonly reviews = this.orm.hasMany(bookReviewMeta, "reviews", "book", "book_id");

  readonly comments = this.orm.hasMany(commentMeta, "comments", "parent", "parent_book_id");

  readonly author = this.orm.hasOne(authorMeta, "author", "books", true);

  readonly image = this.orm.hasOneToOne(imageMeta, "image", "book", "book_id");

  readonly tags = this.orm.hasManyToMany("books_to_tags", "tags", "book_id", tagMeta, "books", "tag_id");

  constructor(em: EntityManager, opts: BookOpts) {
    super(em, bookMeta, bookDefaultValues, opts);
    setOpts(this as any as Book, opts, { calledFromConstructor: true });
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

  set(opts: Partial<BookOpts>): void {
    setOpts(this as any as Book, opts);
  }

  setPartial(opts: PartialOrNull<BookOpts>): void {
    setOpts(this as any as Book, opts as OptsOf<Book>, { partial: true });
  }

  get changes(): Changes<Book> {
    return newChangesProxy(this as any as Book);
  }

  async load<U, V>(fn: (lens: Lens<Book>) => Lens<U, V>): Promise<V> {
    return loadLens(this as any as Book, fn);
  }

  async populate<H extends LoadHint<Book>>(hint: H): Promise<Loaded<Book, H>> {
    return getEm(this).populate(this as any as Book, hint);
  }
}
