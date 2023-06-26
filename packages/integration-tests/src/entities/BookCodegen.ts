import {
  BaseEntity,
  Changes,
  cleanStringValue,
  Collection,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
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
import type { EntityManager } from "./entities";
export type BookId = Flavor<string, "Book">;
export interface BookFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: false };
  title: { kind: "primitive"; type: string; unique: false; nullable: never };
  order: { kind: "primitive"; type: number; unique: false; nullable: never };
  deletedAt: { kind: "primitive"; type: Date; unique: false; nullable: undefined };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  author: { kind: "m2o"; type: Author; nullable: never };
}
export interface BookOpts {
  title: string;
  order?: number;
  deletedAt?: Date | null;
  author: Author | AuthorId;
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
  deletedAt?: ValueFilter<Date, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  author?: EntityFilter<Author, AuthorId, FilterOf<Author>, never>;
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
  deletedAt?: ValueGraphQLFilter<Date>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  author?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, never>;
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
  deletedAt?: OrderBy;
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
  static defaultValues: object = { order: 1 };
  static readonly tagName = "b";
  static readonly metadata: EntityMetadata<Book>;
  declare readonly __orm: EntityOrmField & {
    filterType: BookFilter;
    gqlFilterType: BookGraphQLFilter;
    orderType: BookOrder;
    optsType: BookOpts;
    fieldsType: BookFields;
    optIdsType: BookIdsOpts;
    factoryOptsType: Parameters<typeof newBook>[1];
  };
  readonly advances: Collection<Book, BookAdvance> = hasMany(bookAdvanceMeta, "advances", "book", "book_id", undefined);
  readonly reviews: Collection<Book, BookReview> = hasMany(bookReviewMeta, "reviews", "book", "book_id", undefined);
  readonly comments: Collection<Book, Comment> = hasMany(
    commentMeta,
    "comments",
    "parent",
    "parent_book_id",
    undefined,
  );
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
    setOpts((this as any) as Book, opts, { calledFromConstructor: true });
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
  get idTaggedOrFail(): BookId {
    return this.idTagged || fail("Book has no id tagged yet");
  }
  get title(): string {
    return this.__orm.data["title"];
  }
  set title(title: string) {
    setField(this, "title", cleanStringValue(title));
  }
  get order(): number {
    return this.__orm.data["order"];
  }
  set order(order: number) {
    setField(this, "order", order);
  }
  get deletedAt(): Date | undefined {
    return this.__orm.data["deletedAt"];
  }
  set deletedAt(deletedAt: Date | undefined) {
    setField(this, "deletedAt", deletedAt);
  }
  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }
  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }
  set(opts: Partial<BookOpts>): void {
    setOpts((this as any) as Book, opts);
  }
  setPartial(opts: PartialOrNull<BookOpts>): void {
    setOpts((this as any) as Book, opts as OptsOf<Book>, { partial: true });
  }
  get changes(): Changes<Book> {
    return (newChangesProxy(this) as any);
  }
  get isSoftDeletedEntity(): boolean {
    return this.__orm.data.deletedAt !== undefined;
  }
  load<U, V>(fn: (lens: Lens<Book>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens((this as any) as Book, fn, opts);
  }
  populate<H extends LoadHint<Book>>(hint: H): Promise<Loaded<Book, H>>;
  populate<H extends LoadHint<Book>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Book, H>>;
  populate<H extends LoadHint<Book>, V>(hint: H, fn: (b: Loaded<Book, H>) => V): Promise<V>;
  populate<H extends LoadHint<Book>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (b: Loaded<Book, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<Book>, V>(hintOrOpts: any, fn?: (b: Loaded<Book, H>) => V): Promise<Loaded<Book, H> | V> {
    return this.em.populate((this as any) as Book, hintOrOpts, fn);
  }
  isLoaded<H extends LoadHint<Book>>(hint: H): this is Loaded<Book, H> {
    return isLoaded((this as any) as Book, hint);
  }
}
