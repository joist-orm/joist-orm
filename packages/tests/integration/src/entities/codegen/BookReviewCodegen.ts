import {
  BaseEntity,
  type BooleanFilter,
  type BooleanGraphQLFilter,
  type Changes,
  type Collection,
  ConfigApi,
  type EntityFilter,
  type EntityGraphQLFilter,
  type EntityMetadata,
  failNoIdYet,
  type FilterOf,
  type Flavor,
  getField,
  type GraphQLFilterOf,
  hasManyToMany,
  hasOne,
  hasOneToOne,
  isLoaded,
  type JsonPayload,
  type Lens,
  type Loaded,
  type LoadHint,
  loadLens,
  type ManyToOneReference,
  newChangesProxy,
  newRequiredRule,
  type OneToOneReference,
  type OptsOf,
  type OrderBy,
  type PartialOrNull,
  type ReactiveField,
  setField,
  setOpts,
  type TaggedId,
  toIdOf,
  toJSON,
  type ToJsonHint,
  type ValueFilter,
  type ValueGraphQLFilter,
} from "joist-orm";
import { type Context } from "src/context";
import {
  Book,
  type BookId,
  bookMeta,
  type BookOrder,
  BookReview,
  bookReviewMeta,
  Comment,
  type CommentId,
  commentMeta,
  Critic,
  type CriticId,
  criticMeta,
  type CriticOrder,
  type Entity,
  EntityManager,
  newBookReview,
  Tag,
  type TagId,
  tagMeta,
} from "../entities";

export type BookReviewId = Flavor<string, BookReview>;

export interface BookReviewFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  rating: { kind: "primitive"; type: number; unique: false; nullable: never; derived: false };
  isPublic: { kind: "primitive"; type: boolean; unique: false; nullable: never; derived: true };
  isTest: { kind: "primitive"; type: boolean; unique: false; nullable: never; derived: true };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  book: { kind: "m2o"; type: Book; nullable: never; derived: false };
  critic: { kind: "m2o"; type: Critic; nullable: undefined; derived: false };
}

export interface BookReviewOpts {
  rating: number;
  book: Book | BookId;
  critic?: Critic | CriticId | null;
  comment?: Comment | null;
  tags?: Tag[];
}

export interface BookReviewIdsOpts {
  bookId?: BookId | null;
  criticId?: CriticId | null;
  commentId?: CommentId | null;
  tagIds?: TagId[] | null;
}

export interface BookReviewFilter {
  id?: ValueFilter<BookReviewId, never> | null;
  rating?: ValueFilter<number, never>;
  isPublic?: BooleanFilter<never>;
  isTest?: BooleanFilter<never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  book?: EntityFilter<Book, BookId, FilterOf<Book>, never>;
  critic?: EntityFilter<Critic, CriticId, FilterOf<Critic>, null>;
  comment?: EntityFilter<Comment, CommentId, FilterOf<Comment>, null | undefined>;
  tags?: EntityFilter<Tag, TagId, FilterOf<Tag>, null | undefined>;
}

export interface BookReviewGraphQLFilter {
  id?: ValueGraphQLFilter<BookReviewId>;
  rating?: ValueGraphQLFilter<number>;
  isPublic?: BooleanGraphQLFilter;
  isTest?: BooleanGraphQLFilter;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  book?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>, never>;
  critic?: EntityGraphQLFilter<Critic, CriticId, GraphQLFilterOf<Critic>, null>;
  comment?: EntityGraphQLFilter<Comment, CommentId, GraphQLFilterOf<Comment>, null | undefined>;
  tags?: EntityGraphQLFilter<Tag, TagId, GraphQLFilterOf<Tag>, null | undefined>;
}

export interface BookReviewOrder {
  id?: OrderBy;
  rating?: OrderBy;
  isPublic?: OrderBy;
  isTest?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  book?: BookOrder;
  critic?: CriticOrder;
}

export const bookReviewConfig = new ConfigApi<BookReview, Context>();

bookReviewConfig.addRule(newRequiredRule("rating"));
bookReviewConfig.addRule(newRequiredRule("isPublic"));
bookReviewConfig.addRule(newRequiredRule("isTest"));
bookReviewConfig.addRule(newRequiredRule("createdAt"));
bookReviewConfig.addRule(newRequiredRule("updatedAt"));
bookReviewConfig.addRule(newRequiredRule("book"));

export abstract class BookReviewCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "br";
  static readonly metadata: EntityMetadata<BookReview>;

  declare readonly __orm: {
    entityType: BookReview;
    filterType: BookReviewFilter;
    gqlFilterType: BookReviewGraphQLFilter;
    orderType: BookReviewOrder;
    optsType: BookReviewOpts;
    fieldsType: BookReviewFields;
    optIdsType: BookReviewIdsOpts;
    factoryOptsType: Parameters<typeof newBookReview>[1];
  };

  constructor(em: EntityManager, opts: BookReviewOpts) {
    super(em, opts);
    setOpts(this as any as BookReview, opts, { calledFromConstructor: true });
  }

  get id(): BookReviewId {
    return this.idMaybe || failNoIdYet("BookReview");
  }

  get idMaybe(): BookReviewId | undefined {
    return toIdOf(bookReviewMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("BookReview");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get rating(): number {
    return getField(this, "rating");
  }

  set rating(rating: number) {
    setField(this, "rating", rating);
  }

  abstract readonly isPublic: ReactiveField<BookReview, boolean>;

  abstract readonly isTest: ReactiveField<BookReview, boolean>;

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  set(opts: Partial<BookReviewOpts>): void {
    setOpts(this as any as BookReview, opts);
  }

  setPartial(opts: PartialOrNull<BookReviewOpts>): void {
    setOpts(this as any as BookReview, opts as OptsOf<BookReview>, { partial: true });
  }

  get changes(): Changes<BookReview> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<BookReview>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as BookReview, fn, opts);
  }

  populate<const H extends LoadHint<BookReview>>(hint: H): Promise<Loaded<BookReview, H>>;
  populate<const H extends LoadHint<BookReview>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<BookReview, H>>;
  populate<const H extends LoadHint<BookReview>, V>(hint: H, fn: (br: Loaded<BookReview, H>) => V): Promise<V>;
  populate<const H extends LoadHint<BookReview>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (br: Loaded<BookReview, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<BookReview>, V>(
    hintOrOpts: any,
    fn?: (br: Loaded<BookReview, H>) => V,
  ): Promise<Loaded<BookReview, H> | V> {
    return this.em.populate(this as any as BookReview, hintOrOpts, fn);
  }

  isLoaded<const H extends LoadHint<BookReview>>(hint: H): this is Loaded<BookReview, H> {
    return isLoaded(this as any as BookReview, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<BookReview>>(hint: H): Promise<JsonPayload<BookReview, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get book(): ManyToOneReference<BookReview, Book, never> {
    return this.__data.relations.book ??= hasOne(this as any as BookReview, bookMeta, "book", "reviews");
  }

  get critic(): ManyToOneReference<BookReview, Critic, undefined> {
    return this.__data.relations.critic ??= hasOne(this as any as BookReview, criticMeta, "critic", "bookReviews");
  }

  get comment(): OneToOneReference<BookReview, Comment> {
    return this.__data.relations.comment ??= hasOneToOne(
      this as any as BookReview,
      commentMeta,
      "comment",
      "parent",
      "parent_book_review_id",
    );
  }

  get tags(): Collection<BookReview, Tag> {
    return this.__data.relations.tags ??= hasManyToMany(
      this as any as BookReview,
      "book_reviews_to_tags",
      "tags",
      "book_review_id",
      tagMeta,
      "bookReviews",
      "tag_id",
    );
  }
}
