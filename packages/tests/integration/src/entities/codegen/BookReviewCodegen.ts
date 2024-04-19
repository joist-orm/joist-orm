import {
  BaseEntity,
  ConfigApi,
  failNoIdYet,
  getField,
  getInstanceData,
  hasManyToMany,
  hasOne,
  hasOneToOne,
  isLoaded,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  setField,
  setOpts,
  toIdOf,
  toJSON,
} from "joist-orm";
import type {
  BooleanFilter,
  BooleanGraphQLFilter,
  Changes,
  Collection,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  JsonHint,
  JsonPayload,
  Lens,
  Loaded,
  LoadHint,
  ManyToOneReference,
  OneToOneReference,
  OptsOf,
  OrderBy,
  PartialOrNull,
  ReactiveField,
  TaggedId,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import {
  Book,
  bookMeta,
  BookReview,
  bookReviewMeta,
  Comment,
  commentMeta,
  Critic,
  criticMeta,
  EntityManager,
  newBookReview,
  Tag,
  tagMeta,
} from "../entities";
import type { BookId, BookOrder, CommentId, CriticId, CriticOrder, Entity, TagId } from "../entities";

export type BookReviewId = Flavor<string, BookReview>;

export interface BookReviewFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
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
  toJSON<const H extends JsonHint<BookReview>>(hint: H): Promise<JsonPayload<BookReview, H>>;
  toJSON(hint?: any): object {
    return hint ? toJSON(this, hint) : super.toJSON();
  }

  get book(): ManyToOneReference<BookReview, Book, never> {
    const { relations } = getInstanceData(this);
    return relations.book ??= hasOne(this as any as BookReview, bookMeta, "book", "reviews");
  }

  get critic(): ManyToOneReference<BookReview, Critic, undefined> {
    const { relations } = getInstanceData(this);
    return relations.critic ??= hasOne(this as any as BookReview, criticMeta, "critic", "bookReviews");
  }

  get comment(): OneToOneReference<BookReview, Comment> {
    const { relations } = getInstanceData(this);
    return relations.comment ??= hasOneToOne(
      this as any as BookReview,
      commentMeta,
      "comment",
      "parent",
      "parent_book_review_id",
    );
  }

  get tags(): Collection<BookReview, Tag> {
    const { relations } = getInstanceData(this);
    return relations.tags ??= hasManyToMany(
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
