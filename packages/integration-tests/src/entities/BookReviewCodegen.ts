import {
  BaseEntity,
  BooleanFilter,
  BooleanGraphQLFilter,
  Changes,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  EntityOrmField,
  fail,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
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
  PersistedAsyncProperty,
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
import type { EntityManager } from "./entities";
export type BookReviewId = Flavor<string, "BookReview">;
export interface BookReviewFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: false };
  rating: { kind: "primitive"; type: number; unique: false; nullable: never };
  isPublic: { kind: "primitive"; type: boolean; unique: false; nullable: never };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  book: { kind: "m2o"; type: Book; nullable: never };
}
export interface BookReviewOpts {
  rating: number;
  book: Book | BookId;
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
  book?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>, never>;
  comment?: EntityGraphQLFilter<Comment, CommentId, GraphQLFilterOf<Comment>, null | undefined>;
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
export abstract class BookReviewCodegen extends BaseEntity<EntityManager> {
  static defaultValues: object = {};
  static readonly tagName = "br";
  static readonly metadata: EntityMetadata<BookReview>;
  declare readonly __orm: EntityOrmField & {
    filterType: BookReviewFilter;
    gqlFilterType: BookReviewGraphQLFilter;
    orderType: BookReviewOrder;
    optsType: BookReviewOpts;
    fieldsType: BookReviewFields;
    optIdsType: BookReviewIdsOpts;
    factoryOptsType: Parameters<typeof newBookReview>[1];
  };
  readonly book: ManyToOneReference<BookReview, Book, never> = hasOne(bookMeta, "book", "reviews");
  readonly comment: OneToOneReference<BookReview, Comment> = hasOneToOne(
    commentMeta,
    "comment",
    "parent",
    "parent_book_review_id",
  );
  constructor(em: EntityManager, opts: BookReviewOpts) {
    super(em, bookReviewMeta, BookReviewCodegen.defaultValues, opts);
    setOpts((this as any) as BookReview, opts, { calledFromConstructor: true });
  }
  get id(): BookReviewId | undefined {
    return this.idTagged;
  }
  get idOrFail(): BookReviewId {
    return this.id || fail("BookReview has no id yet");
  }
  get idTagged(): BookReviewId | undefined {
    return this.__orm.data["id"];
  }
  get idTaggedOrFail(): BookReviewId {
    return this.idTagged || fail("BookReview has no id tagged yet");
  }
  get rating(): number {
    return this.__orm.data["rating"];
  }
  set rating(rating: number) {
    setField(this, "rating", rating);
  }
  abstract readonly isPublic: PersistedAsyncProperty<BookReview, boolean>;
  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }
  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }
  set(opts: Partial<BookReviewOpts>): void {
    setOpts((this as any) as BookReview, opts);
  }
  setPartial(opts: PartialOrNull<BookReviewOpts>): void {
    setOpts((this as any) as BookReview, opts as OptsOf<BookReview>, { partial: true });
  }
  get changes(): Changes<BookReview> {
    return (newChangesProxy(this) as any);
  }
  load<U, V>(fn: (lens: Lens<BookReview>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens((this as any) as BookReview, fn, opts);
  }
  populate<H extends LoadHint<BookReview>>(hint: H): Promise<Loaded<BookReview, H>>;
  populate<H extends LoadHint<BookReview>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<BookReview, H>>;
  populate<H extends LoadHint<BookReview>, V>(hint: H, fn: (br: Loaded<BookReview, H>) => V): Promise<V>;
  populate<H extends LoadHint<BookReview>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (br: Loaded<BookReview, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<BookReview>, V>(
    hintOrOpts: any,
    fn?: (br: Loaded<BookReview, H>) => V,
  ): Promise<Loaded<BookReview, H> | V> {
    return this.em.populate((this as any) as BookReview, hintOrOpts, fn);
  }
  isLoaded<H extends LoadHint<BookReview>>(hint: H): this is Loaded<BookReview, H> {
    return isLoaded((this as any) as BookReview, hint);
  }
}
