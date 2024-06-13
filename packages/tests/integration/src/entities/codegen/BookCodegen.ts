import {
  BaseEntity,
  cleanStringValue,
  ConfigApi,
  failNoIdYet,
  getField,
  hasMany,
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
  Changes,
  Collection,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  JsonPayload,
  Lens,
  Loaded,
  LoadHint,
  ManyToOneReference,
  OneToOneReference,
  OptsOf,
  OrderBy,
  PartialOrNull,
  TaggedId,
  ToJsonHint,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import {
  Author,
  authorMeta,
  Book,
  BookAdvance,
  bookAdvanceMeta,
  bookMeta,
  BookReview,
  bookReviewMeta,
  Comment,
  commentMeta,
  EntityManager,
  Image,
  imageMeta,
  newBook,
  Tag,
  tagMeta,
} from "../entities";
import type {
  AuthorId,
  AuthorOrder,
  BookAdvanceId,
  BookReviewId,
  CommentId,
  CommentOrder,
  Entity,
  ImageId,
  TagId,
} from "../entities";

export type BookId = Flavor<string, Book>;

export interface BookFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  title: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  order: { kind: "primitive"; type: number; unique: false; nullable: never; derived: false };
  notes: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  acknowledgements: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  deletedAt: { kind: "primitive"; type: Date; unique: false; nullable: undefined; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  author: { kind: "m2o"; type: Author; nullable: never; derived: false };
  randomComment: { kind: "m2o"; type: Comment; nullable: undefined; derived: false };
}

export interface BookOpts {
  title: string;
  order?: number;
  notes?: string;
  acknowledgements?: string | null;
  deletedAt?: Date | null;
  author: Author | AuthorId;
  randomComment?: Comment | CommentId | null;
  currentDraftAuthor?: Author | null;
  image?: Image | null;
  advances?: BookAdvance[];
  reviews?: BookReview[];
  comments?: Comment[];
  tags?: Tag[];
}

export interface BookIdsOpts {
  authorId?: AuthorId | null;
  randomCommentId?: CommentId | null;
  currentDraftAuthorId?: AuthorId | null;
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
  deletedAt?: ValueFilter<Date, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  author?: EntityFilter<Author, AuthorId, FilterOf<Author>, never>;
  randomComment?: EntityFilter<Comment, CommentId, FilterOf<Comment>, null>;
  currentDraftAuthor?: EntityFilter<Author, AuthorId, FilterOf<Author>, null | undefined>;
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
  deletedAt?: ValueGraphQLFilter<Date>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  author?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, never>;
  randomComment?: EntityGraphQLFilter<Comment, CommentId, GraphQLFilterOf<Comment>, null>;
  currentDraftAuthor?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null | undefined>;
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
  deletedAt?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  author?: AuthorOrder;
  randomComment?: CommentOrder;
}

export const bookConfig = new ConfigApi<Book, Context>();

bookConfig.addRule(newRequiredRule("title"));
bookConfig.addRule(newRequiredRule("order"));
bookConfig.addRule(newRequiredRule("notes"));
bookConfig.addRule(newRequiredRule("createdAt"));
bookConfig.addRule(newRequiredRule("updatedAt"));
bookConfig.addRule(newRequiredRule("author"));
bookConfig.setDefault("order", 1);

export abstract class BookCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "b";
  static readonly metadata: EntityMetadata<Book>;

  declare readonly __orm: {
    filterType: BookFilter;
    gqlFilterType: BookGraphQLFilter;
    orderType: BookOrder;
    optsType: BookOpts;
    fieldsType: BookFields;
    optIdsType: BookIdsOpts;
    factoryOptsType: Parameters<typeof newBook>[1];
  };

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

  set(opts: Partial<BookOpts>): void {
    setOpts(this as any as Book, opts);
  }

  setPartial(opts: PartialOrNull<BookOpts>): void {
    setOpts(this as any as Book, opts as OptsOf<Book>, { partial: true });
  }

  get changes(): Changes<Book> {
    return newChangesProxy(this) as any;
  }

  get isSoftDeletedEntity(): boolean {
    return this.deletedAt !== undefined;
  }

  load<U, V>(fn: (lens: Lens<Book>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Book, fn, opts);
  }

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

  isLoaded<const H extends LoadHint<Book>>(hint: H): this is Loaded<Book, H> {
    return isLoaded(this as any as Book, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<Book>>(hint: H): Promise<JsonPayload<Book, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get advances(): Collection<Book, BookAdvance> {
    return this.__data.relations.advances ??= hasMany(
      this as any as Book,
      bookAdvanceMeta,
      "advances",
      "book",
      "book_id",
      undefined,
    );
  }

  get reviews(): Collection<Book, BookReview> {
    return this.__data.relations.reviews ??= hasMany(
      this as any as Book,
      bookReviewMeta,
      "reviews",
      "book",
      "book_id",
      undefined,
    );
  }

  get comments(): Collection<Book, Comment> {
    return this.__data.relations.comments ??= hasMany(
      this as any as Book,
      commentMeta,
      "comments",
      "parent",
      "parent_book_id",
      undefined,
    );
  }

  get author(): ManyToOneReference<Book, Author, never> {
    return this.__data.relations.author ??= hasOne(this as any as Book, authorMeta, "author", "books");
  }

  get randomComment(): ManyToOneReference<Book, Comment, undefined> {
    return this.__data.relations.randomComment ??= hasOne(this as any as Book, commentMeta, "randomComment", "books");
  }

  get currentDraftAuthor(): OneToOneReference<Book, Author> {
    return this.__data.relations.currentDraftAuthor ??= hasOneToOne(
      this as any as Book,
      authorMeta,
      "currentDraftAuthor",
      "currentDraftBook",
      "current_draft_book_id",
    );
  }

  get image(): OneToOneReference<Book, Image> {
    return this.__data.relations.image ??= hasOneToOne(this as any as Book, imageMeta, "image", "book", "book_id");
  }

  get tags(): Collection<Book, Tag> {
    return this.__data.relations.tags ??= hasManyToMany(
      this as any as Book,
      "books_to_tags",
      "tags",
      "book_id",
      tagMeta,
      "books",
      "tag_id",
    );
  }
}
