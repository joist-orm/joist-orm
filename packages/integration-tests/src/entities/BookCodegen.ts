import {
  BaseEntity,
  Changes,
  Collection,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityOrmField,
  fail,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  hasMany,
  hasManyToMany,
  hasOne,
  hasOneToOne,
  isLoaded,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  ManyToOneReference,
  newChangesProxy,
  newRequiredRule,
  OneToOneReference,
  OptsOf,
  OrderBy,
  PartialOrNull,
  setField,
  setOpts,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import type { EntityManager } from "./entities";
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
  order?: number;
  author: Author;
  currentDraftAuthor?: Author | null;
  image?: Image | null;
  advances?: BookAdvance[];
  reviews?: BookReview[];
  comments?: Comment[];
  tags?: Tag[];
}

export interface BookIdsOpts {
  authorId?: AuthorId | null;
  currentDraftAuthorId?: AuthorId | null;
  imageId?: ImageId | null;
  advanceIds?: BookAdvanceId[] | null;
  reviewIds?: BookReviewId[] | null;
  commentIds?: CommentId[] | null;
  tagIds?: TagId[] | null;
}

export interface BookFilter {
  id?: ValueFilter<BookId, never>;
  title?: ValueFilter<string, never>;
  order?: ValueFilter<number, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  author?: EntityFilter<Author, AuthorId, FilterOf<Author>, never>;
  currentDraftAuthor?: EntityFilter<Author, AuthorId, FilterOf<Author>, null | undefined>;
  image?: EntityFilter<Image, ImageId, FilterOf<Image>, null | undefined>;
}

export interface BookGraphQLFilter {
  id?: ValueGraphQLFilter<BookId>;
  title?: ValueGraphQLFilter<string>;
  order?: ValueGraphQLFilter<number>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  author?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>>;
  currentDraftAuthor?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>>;
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

export const bookConfig = new ConfigApi<Book, Context>();

bookConfig.addRule(newRequiredRule("title"));
bookConfig.addRule(newRequiredRule("order"));
bookConfig.addRule(newRequiredRule("createdAt"));
bookConfig.addRule(newRequiredRule("updatedAt"));
bookConfig.addRule(newRequiredRule("author"));

export abstract class BookCodegen extends BaseEntity<EntityManager> {
  static defaultValues: object = {
    order: 1,
  };

  readonly __orm!: EntityOrmField & {
    filterType: BookFilter;
    gqlFilterType: BookGraphQLFilter;
    orderType: BookOrder;
    optsType: BookOpts;
    optIdsType: BookIdsOpts;
    factoryOptsType: Parameters<typeof newBook>[1];
  };

  readonly advances: Collection<Book, BookAdvance> = hasMany(bookAdvanceMeta, "advances", "book", "book_id");

  readonly reviews: Collection<Book, BookReview> = hasMany(bookReviewMeta, "reviews", "book", "book_id");

  readonly comments: Collection<Book, Comment> = hasMany(commentMeta, "comments", "parent", "parent_book_id");

  readonly author: ManyToOneReference<Book, Author, never> = hasOne(authorMeta, "author", "books");

  readonly currentDraftAuthor: OneToOneReference<Book, Author> = hasOneToOne(
    authorMeta,
    "currentDraftAuthor",
    "currentDraftBook",
    "current_draft_book_id",
  );

  readonly image: OneToOneReference<Book, Image> = hasOneToOne(imageMeta, "image", "book", "book_id");

  readonly tags: Collection<Book, Tag> = hasManyToMany("books_to_tags", "tags", "book_id", tagMeta, "books", "tag_id");

  constructor(em: EntityManager, opts: BookOpts) {
    super(em, bookMeta, BookCodegen.defaultValues, opts);
    setOpts(this as any as Book, opts, { calledFromConstructor: true });
  }

  get id(): BookId | undefined {
    return this.idTagged;
  }

  get idOrFail(): BookId {
    return this.id || fail("Book has no id yet");
  }

  get idTagged(): BookId | undefined {
    return this.__orm.data["id"];
  }

  get title(): string {
    return this.__orm.data["title"];
  }

  set title(title: string) {
    setField(this, "title", title);
  }

  get order(): number {
    return this.__orm.data["order"];
  }

  set order(order: number) {
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

  load<U, V>(fn: (lens: Lens<Book>) => Lens<U, V>): Promise<V> {
    return loadLens(this as any as Book, fn);
  }

  populate<H extends LoadHint<Book>>(hint: H): Promise<Loaded<Book, H>>;
  populate<H extends LoadHint<Book>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Book, H>>;
  populate<H extends LoadHint<Book>, V>(hint: H, fn: (b: Loaded<Book, H>) => V): Promise<V>;
  populate<H extends LoadHint<Book>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (b: Loaded<Book, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<Book>, V>(hintOrOpts: any, fn?: (b: Loaded<Book, H>) => V): Promise<Loaded<Book, H> | V> {
    return this.em.populate(this as any as Book, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<Book>>(hint: H): this is Loaded<Book, H> {
    return isLoaded(this as any as Book, hint);
  }
}
