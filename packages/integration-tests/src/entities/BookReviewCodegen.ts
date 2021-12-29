import {
  BaseEntity,
  BooleanFilter,
  BooleanGraphQLFilter,
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
  Book,
  BookId,
  bookMeta,
  BookOrder,
  BookReview,
  bookReviewMeta,
  Comment,
  CommentId,
  commentMeta,
  newBookReview,
} from "./entities";

export type BookReviewId = Flavor<string, "BookReview">;

export interface BookReviewOpts {
  rating: number;
  book: Book;
  comment?: Comment | null;
}

export interface BookReviewIdsOpts {
  bookId?: BookId | null;
  commentId?: CommentId | null;
}

export interface BookReviewFilter {
  id?: ValueFilter<BookReviewId, never>;
  rating?: ValueFilter<number, never>;
  isPublic?: BooleanFilter<never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  book?: EntityFilter<Book, BookId, FilterOf<Book>, never>;
  comment?: EntityFilter<Comment, CommentId, FilterOf<Comment>, null | undefined>;
}

export interface BookReviewGraphQLFilter {
  id?: ValueGraphQLFilter<BookReviewId>;
  rating?: ValueGraphQLFilter<number>;
  isPublic?: BooleanGraphQLFilter;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  book?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>>;
  comment?: EntityGraphQLFilter<Comment, CommentId, GraphQLFilterOf<Comment>>;
}

export interface BookReviewOrder {
  id?: OrderBy;
  rating?: OrderBy;
  isPublic?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  book?: BookOrder;
}

export const bookReviewConfig = new ConfigApi<BookReview, Context>();

bookReviewConfig.addRule(newRequiredRule("rating"));
bookReviewConfig.addRule(newRequiredRule("isPublic"));
bookReviewConfig.addRule(newRequiredRule("createdAt"));
bookReviewConfig.addRule(newRequiredRule("updatedAt"));
bookReviewConfig.addRule(newRequiredRule("book"));

export abstract class BookReviewCodegen extends BaseEntity {
  readonly __types: {
    filterType: BookReviewFilter;
    gqlFilterType: BookReviewGraphQLFilter;
    orderType: BookReviewOrder;
    optsType: BookReviewOpts;
    optIdsType: BookReviewIdsOpts;
    factoryOptsType: Parameters<typeof newBookReview>[1];
  } = null!;
  protected readonly orm = new OrmApi(this as any as BookReview);

  readonly book = this.orm.hasOne(bookMeta, "book", "reviews", true);

  readonly comment = this.orm.hasOneToOne(commentMeta, "comment", "parent", "parent_book_review_id");

  constructor(em: EntityManager, opts: BookReviewOpts) {
    super(em, bookReviewMeta, {}, opts);
    setOpts(this as any as BookReview, opts, { calledFromConstructor: true });
  }

  get id(): BookReviewId | undefined {
    return this.__orm.data["id"];
  }

  get rating(): number {
    return this.__orm.data["rating"];
  }

  set rating(rating: number) {
    setField(this, "rating", rating);
  }

  get isPublic(): boolean {
    if (!("isPublic" in this.__orm.data)) {
      throw new Error("isPublic has not been derived yet");
    }
    return this.__orm.data["isPublic"];
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  set(opts: Partial<BookReviewOpts>): void {
    setOpts(this as any as BookReview, opts);
  }

  setPartial(opts: PartialOrNull<BookReviewOpts>): void {
    setOpts(this as any as BookReview, opts as OptsOf<BookReview>, { partial: true });
  }

  get changes(): Changes<BookReview> {
    return newChangesProxy(this as any as BookReview);
  }

  async load<U, V>(fn: (lens: Lens<BookReview>) => Lens<U, V>): Promise<V> {
    return loadLens(this as any as BookReview, fn);
  }

  async populate<H extends LoadHint<BookReview>>(hint: H): Promise<Loaded<BookReview, H>> {
    return getEm(this).populate(this as any as BookReview, hint);
  }
}
