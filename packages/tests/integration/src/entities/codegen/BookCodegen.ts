import {
  BaseEntity,
  type Changes,
  cleanStringValue,
  type Collection,
  ConfigApi,
  type DeepPartialOrNull,
  type EntityFilter,
  type EntityGraphQLFilter,
  type EntityMetadata,
  failNoIdYet,
  type FilterOf,
  type Flavor,
  getField,
  type GraphQLFilterOf,
  hasMany,
  hasManyToMany,
  hasOne,
  hasOneToOne,
  hasRecursiveChildren,
  hasRecursiveParents,
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
  type ReadOnlyCollection,
  setField,
  setOpts,
  type TaggedId,
  toIdOf,
  toJSON,
  type ToJsonHint,
  updatePartial,
  type ValueFilter,
  type ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import {
  Author,
  type AuthorId,
  authorMeta,
  type AuthorOrder,
  Book,
  BookAdvance,
  type BookAdvanceId,
  bookAdvanceMeta,
  bookMeta,
  BookReview,
  type BookReviewId,
  bookReviewMeta,
  Comment,
  type CommentId,
  commentMeta,
  type CommentOrder,
  type Entity,
  EntityManager,
  Image,
  type ImageId,
  imageMeta,
  newBook,
  Tag,
  type TagId,
  tagMeta,
} from "../entities";

export type BookId = Flavor<string, "Book">;

export interface BookFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  title: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  order: { kind: "primitive"; type: number; unique: false; nullable: never; derived: false };
  notes: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  acknowledgements: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  authorsNickNames: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  search: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: true };
  deletedAt: { kind: "primitive"; type: Date; unique: false; nullable: undefined; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  prequel: { kind: "m2o"; type: Book; nullable: undefined; derived: false };
  author: { kind: "m2o"; type: Author; nullable: never; derived: false };
  reviewer: { kind: "m2o"; type: Author; nullable: undefined; derived: false };
  randomComment: { kind: "m2o"; type: Comment; nullable: undefined; derived: false };
  tags: { kind: "m2m"; type: Tag };
  advances: { kind: "o2m"; type: BookAdvance };
  reviews: { kind: "o2m"; type: BookReview };
  comments: { kind: "o2m"; type: Comment };
}

export interface BookOpts {
  title: string;
  order?: number;
  notes?: string;
  acknowledgements?: string | null;
  authorsNickNames?: string | null;
  deletedAt?: Date | null;
  prequel?: Book | BookId | null;
  author?: Author | AuthorId;
  reviewer?: Author | AuthorId | null;
  randomComment?: Comment | CommentId | null;
  sequel?: Book | null;
  currentDraftAuthor?: Author | null;
  favoriteAuthor?: Author | null;
  image?: Image | null;
  advances?: BookAdvance[];
  reviews?: BookReview[];
  comments?: Comment[];
  tags?: Tag[];
}

export interface BookIdsOpts {
  prequelId?: BookId | null;
  authorId?: AuthorId | null;
  reviewerId?: AuthorId | null;
  randomCommentId?: CommentId | null;
  sequelId?: BookId | null;
  currentDraftAuthorId?: AuthorId | null;
  favoriteAuthorId?: AuthorId | null;
  imageId?: ImageId | null;
  advanceIds?: BookAdvanceId[] | null;
  reviewIds?: BookReviewId[] | null;
  commentIds?: CommentId[] | null;
  tagIds?: TagId[] | null;
}

export interface BookFilter {
  id?: ValueFilter<BookId, never> | null;
  title?: ValueFilter<string, never>;
  order?: ValueFilter<number, never>;
  notes?: ValueFilter<string, never>;
  acknowledgements?: ValueFilter<string, null>;
  authorsNickNames?: ValueFilter<string, null>;
  search?: ValueFilter<string, null>;
  deletedAt?: ValueFilter<Date, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  prequel?: EntityFilter<Book, BookId, FilterOf<Book>, null>;
  author?: EntityFilter<Author, AuthorId, FilterOf<Author>, never>;
  reviewer?: EntityFilter<Author, AuthorId, FilterOf<Author>, null>;
  randomComment?: EntityFilter<Comment, CommentId, FilterOf<Comment>, null>;
  sequel?: EntityFilter<Book, BookId, FilterOf<Book>, null | undefined>;
  currentDraftAuthor?: EntityFilter<Author, AuthorId, FilterOf<Author>, null | undefined>;
  favoriteAuthor?: EntityFilter<Author, AuthorId, FilterOf<Author>, null | undefined>;
  image?: EntityFilter<Image, ImageId, FilterOf<Image>, null | undefined>;
  advances?: EntityFilter<BookAdvance, BookAdvanceId, FilterOf<BookAdvance>, null | undefined>;
  reviews?: EntityFilter<BookReview, BookReviewId, FilterOf<BookReview>, null | undefined>;
  comments?: EntityFilter<Comment, CommentId, FilterOf<Comment>, null | undefined>;
  tags?: EntityFilter<Tag, TagId, FilterOf<Tag>, null | undefined>;
}

export interface BookGraphQLFilter {
  id?: ValueGraphQLFilter<BookId>;
  title?: ValueGraphQLFilter<string>;
  order?: ValueGraphQLFilter<number>;
  notes?: ValueGraphQLFilter<string>;
  acknowledgements?: ValueGraphQLFilter<string>;
  authorsNickNames?: ValueGraphQLFilter<string>;
  search?: ValueGraphQLFilter<string>;
  deletedAt?: ValueGraphQLFilter<Date>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  prequel?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>, null>;
  author?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, never>;
  reviewer?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null>;
  randomComment?: EntityGraphQLFilter<Comment, CommentId, GraphQLFilterOf<Comment>, null>;
  sequel?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>, null | undefined>;
  currentDraftAuthor?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null | undefined>;
  favoriteAuthor?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null | undefined>;
  image?: EntityGraphQLFilter<Image, ImageId, GraphQLFilterOf<Image>, null | undefined>;
  advances?: EntityGraphQLFilter<BookAdvance, BookAdvanceId, GraphQLFilterOf<BookAdvance>, null | undefined>;
  reviews?: EntityGraphQLFilter<BookReview, BookReviewId, GraphQLFilterOf<BookReview>, null | undefined>;
  comments?: EntityGraphQLFilter<Comment, CommentId, GraphQLFilterOf<Comment>, null | undefined>;
  tags?: EntityGraphQLFilter<Tag, TagId, GraphQLFilterOf<Tag>, null | undefined>;
}

export interface BookOrder {
  id?: OrderBy;
  title?: OrderBy;
  order?: OrderBy;
  notes?: OrderBy;
  acknowledgements?: OrderBy;
  authorsNickNames?: OrderBy;
  search?: OrderBy;
  deletedAt?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  prequel?: BookOrder;
  author?: AuthorOrder;
  reviewer?: AuthorOrder;
  randomComment?: CommentOrder;
}

export interface BookFactoryExtras {
  withSearch?: string | null;
}

export const bookConfig = new ConfigApi<Book, Context>();

bookConfig.addRule(newRequiredRule("title"));
bookConfig.addRule(newRequiredRule("order"));
bookConfig.addRule(newRequiredRule("notes"));
bookConfig.addRule(newRequiredRule("createdAt"));
bookConfig.addRule(newRequiredRule("updatedAt"));
bookConfig.addRule(newRequiredRule("author"));
bookConfig.setDefault("order", 1);

declare module "joist-orm" {
  interface TypeMap {
    Book: {
      entityType: Book;
      filterType: BookFilter;
      gqlFilterType: BookGraphQLFilter;
      orderType: BookOrder;
      optsType: BookOpts;
      fieldsType: BookFields;
      optIdsType: BookIdsOpts;
      factoryExtrasType: BookFactoryExtras;
      factoryOptsType: Parameters<typeof newBook>[1];
    };
  }
}

export abstract class BookCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "b";
  static readonly metadata: EntityMetadata<Book>;

  declare readonly __type: { 0: "Book" };

  constructor(em: EntityManager, opts: BookOpts) {
    super(em, opts);
    setOpts(this as any as Book, opts, { calledFromConstructor: true });
  }

  get id(): BookId {
    return this.idMaybe || failNoIdYet("Book");
  }

  get idMaybe(): BookId | undefined {
    return toIdOf(bookMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("Book");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get title(): string {
    return getField(this, "title");
  }

  set title(title: string) {
    setField(this, "title", cleanStringValue(title));
  }

  get order(): number {
    return getField(this, "order");
  }

  set order(order: number) {
    setField(this, "order", order);
  }

  get notes(): string {
    return getField(this, "notes");
  }

  set notes(notes: string) {
    setField(this, "notes", cleanStringValue(notes));
  }

  get acknowledgements(): string | undefined {
    return getField(this, "acknowledgements");
  }

  set acknowledgements(acknowledgements: string | undefined) {
    setField(this, "acknowledgements", cleanStringValue(acknowledgements));
  }

  get authorsNickNames(): string | undefined {
    return getField(this, "authorsNickNames");
  }

  set authorsNickNames(authorsNickNames: string | undefined) {
    setField(this, "authorsNickNames", cleanStringValue(authorsNickNames));
  }

  abstract readonly search: ReactiveField<Book, string | undefined>;

  get deletedAt(): Date | undefined {
    return getField(this, "deletedAt");
  }

  set deletedAt(deletedAt: Date | undefined) {
    setField(this, "deletedAt", deletedAt);
  }

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  /**
   * Partial update taking any subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  set(opts: Partial<BookOpts>): void {
    setOpts(this as any as Book, opts);
  }

  /**
   * Partial update taking any subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setPartial(opts: PartialOrNull<BookOpts>): void {
    setOpts(this as any as Book, opts as OptsOf<Book>, { partial: true });
  }

  /**
   * Partial update taking any nested subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setDeepPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   *   books: [{ title: "b1" }], // create a child book
   * });
   * ```
   * @see {@link https://joist-orm.io/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setDeepPartial(opts: DeepPartialOrNull<Book>): Promise<void> {
    return updatePartial(this as any as Book, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<Book> {
    return newChangesProxy(this) as any;
  }

  get isSoftDeletedEntity(): boolean {
    return this.deletedAt !== undefined;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<Book>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Book, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<Book>>(hint: H): Promise<Loaded<Book, H>>;
  populate<const H extends LoadHint<Book>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Book, H>>;
  populate<const H extends LoadHint<Book>, V>(hint: H, fn: (b: Loaded<Book, H>) => V): Promise<V>;
  populate<const H extends LoadHint<Book>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (b: Loaded<Book, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<Book>, V>(
    hintOrOpts: any,
    fn?: (b: Loaded<Book, H>) => V,
  ): Promise<Loaded<Book, H> | V> {
    return this.em.populate(this as any as Book, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<Book>>(hint: H): this is Loaded<Book, H> {
    return isLoaded(this as any as Book, hint);
  }

  /**
   * Build a type-safe, loadable and relation aware POJO from this entity, given a hint.
   *
   * Note: As the hint might load, this returns a Promise
   *
   * @example
   * ```
   * const payload = await a.toJSON({
   *   id: true,
   *   books: { id: true, reviews: { rating: true } }
   * });
   * ```
   * @see {@link https://joist-orm.io/advanced/json-payloads | Json Payloads} on the Joist docs
   */
  toJSON(): object;
  toJSON<const H extends ToJsonHint<Book>>(hint: H): Promise<JsonPayload<Book, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get advances(): Collection<Book, BookAdvance> {
    return this.__data.relations.advances ??= hasMany(this, bookAdvanceMeta, "advances", "book", "book_id", undefined);
  }

  get reviews(): Collection<Book, BookReview> {
    return this.__data.relations.reviews ??= hasMany(this, bookReviewMeta, "reviews", "book", "book_id", {
      "field": "critic",
      "direction": "ASC",
    });
  }

  get comments(): Collection<Book, Comment> {
    return this.__data.relations.comments ??= hasMany(
      this,
      commentMeta,
      "comments",
      "parent",
      "parent_book_id",
      undefined,
    );
  }

  get prequel(): ManyToOneReference<Book, Book, undefined> {
    return this.__data.relations.prequel ??= hasOne(this, bookMeta, "prequel", "sequel");
  }

  get author(): ManyToOneReference<Book, Author, never> {
    return this.__data.relations.author ??= hasOne(this, authorMeta, "author", "books");
  }

  get reviewer(): ManyToOneReference<Book, Author, undefined> {
    return this.__data.relations.reviewer ??= hasOne(this, authorMeta, "reviewer", "reviewerBooks");
  }

  get randomComment(): ManyToOneReference<Book, Comment, undefined> {
    return this.__data.relations.randomComment ??= hasOne(this, commentMeta, "randomComment", "books");
  }

  get prequelsRecursive(): ReadOnlyCollection<Book, Book> {
    return this.__data.relations.prequelsRecursive ??= hasRecursiveParents(
      this,
      "prequelsRecursive",
      "prequel",
      "sequelsRecursive",
    );
  }

  get sequelsRecursive(): ReadOnlyCollection<Book, Book> {
    return this.__data.relations.sequelsRecursive ??= hasRecursiveChildren(
      this,
      "sequelsRecursive",
      "sequel",
      "prequelsRecursive",
    );
  }

  get sequel(): OneToOneReference<Book, Book> {
    return this.__data.relations.sequel ??= hasOneToOne(this, bookMeta, "sequel", "prequel", "prequel_id");
  }

  get currentDraftAuthor(): OneToOneReference<Book, Author> {
    return this.__data.relations.currentDraftAuthor ??= hasOneToOne(
      this,
      authorMeta,
      "currentDraftAuthor",
      "currentDraftBook",
      "current_draft_book_id",
    );
  }

  get favoriteAuthor(): OneToOneReference<Book, Author> {
    return this.__data.relations.favoriteAuthor ??= hasOneToOne(
      this,
      authorMeta,
      "favoriteAuthor",
      "favoriteBook",
      "favorite_book_id",
    );
  }

  get image(): OneToOneReference<Book, Image> {
    return this.__data.relations.image ??= hasOneToOne(this, imageMeta, "image", "book", "book_id");
  }

  get tags(): Collection<Book, Tag> {
    return this.__data.relations.tags ??= hasManyToMany(
      this,
      "books_to_tags",
      "tags",
      "book_id",
      tagMeta,
      "books",
      "tag_id",
    );
  }
}
