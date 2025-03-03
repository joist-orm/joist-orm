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
  hasOnePolymorphic,
  type IdOf,
  isEntity,
  isLoaded,
  type JsonPayload,
  type Lens,
  type Loaded,
  type LoadHint,
  loadLens,
  type ManyToOneReference,
  type MaybeAbstractEntityConstructor,
  newChangesProxy,
  newRequiredRule,
  type OptsOf,
  type OrderBy,
  type PartialOrNull,
  type PolymorphicReference,
  type ReactiveField,
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
import { type Context } from "src/context";
import {
  AdminUser,
  type AdminUserId,
  Author,
  Book,
  type BookId,
  bookMeta,
  BookReview,
  Comment,
  commentMeta,
  type Entity,
  EntityManager,
  newComment,
  Publisher,
  TaskOld,
  User,
  type UserId,
  userMeta,
  type UserOrder,
} from "../entities";

export type CommentId = Flavor<string, "Comment">;

export type CommentParent = Author | Book | BookReview | Publisher | TaskOld;
export function getCommentParentConstructors(): MaybeAbstractEntityConstructor<CommentParent>[] {
  return [Author, Book, BookReview, Publisher, TaskOld];
}
export function isCommentParent(maybeEntity: unknown): maybeEntity is CommentParent {
  return isEntity(maybeEntity) && getCommentParentConstructors().some((type) => maybeEntity instanceof type);
}

export interface CommentFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  parentTaggedId: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: true };
  parentTags: { kind: "primitive"; type: string; unique: false; nullable: never; derived: true };
  text: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  user: { kind: "m2o"; type: User; nullable: undefined; derived: false };
  parent: { kind: "poly"; type: CommentParent; nullable: never };
  likedByUsers: { kind: "m2m"; type: User };
  books: { kind: "o2m"; type: Book };
}

export interface CommentOpts {
  text?: string | null;
  user?: User | UserId | null;
  parent: CommentParent;
  books?: Book[];
  likedByUsers?: User[];
}

export interface CommentIdsOpts {
  userId?: UserId | null;
  parentId?: IdOf<CommentParent> | null;
  bookIds?: BookId[] | null;
  likedByUserIds?: UserId[] | null;
}

export interface CommentFilter {
  id?: ValueFilter<CommentId, never> | null;
  parentTaggedId?: ValueFilter<string, null>;
  parentTags?: ValueFilter<string, never>;
  text?: ValueFilter<string, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  user?: EntityFilter<User, UserId, FilterOf<User>, null>;
  userAdminUser?: EntityFilter<AdminUser, AdminUserId, FilterOf<AdminUser>, null>;
  books?: EntityFilter<Book, BookId, FilterOf<Book>, null | undefined>;
  likedByUsers?: EntityFilter<User, UserId, FilterOf<User>, null | undefined>;
  parent?: EntityFilter<CommentParent, IdOf<CommentParent>, never, never>;
  parentAuthor?: EntityFilter<Author, IdOf<Author>, FilterOf<Author>, null>;
  parentBook?: EntityFilter<Book, IdOf<Book>, FilterOf<Book>, null>;
  parentBookReview?: EntityFilter<BookReview, IdOf<BookReview>, FilterOf<BookReview>, null>;
  parentPublisher?: EntityFilter<Publisher, IdOf<Publisher>, FilterOf<Publisher>, null>;
  parentTaskOld?: EntityFilter<TaskOld, IdOf<TaskOld>, FilterOf<TaskOld>, null>;
}

export interface CommentGraphQLFilter {
  id?: ValueGraphQLFilter<CommentId>;
  parentTaggedId?: ValueGraphQLFilter<string>;
  parentTags?: ValueGraphQLFilter<string>;
  text?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  user?: EntityGraphQLFilter<User, UserId, GraphQLFilterOf<User>, null>;
  userAdminUser?: EntityGraphQLFilter<AdminUser, AdminUserId, GraphQLFilterOf<AdminUser>, null>;
  books?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>, null | undefined>;
  likedByUsers?: EntityGraphQLFilter<User, UserId, GraphQLFilterOf<User>, null | undefined>;
  parent?: EntityGraphQLFilter<CommentParent, IdOf<CommentParent>, never, never>;
  parentAuthor?: EntityGraphQLFilter<Author, IdOf<Author>, FilterOf<Author>, null>;
  parentBook?: EntityGraphQLFilter<Book, IdOf<Book>, FilterOf<Book>, null>;
  parentBookReview?: EntityGraphQLFilter<BookReview, IdOf<BookReview>, FilterOf<BookReview>, null>;
  parentPublisher?: EntityGraphQLFilter<Publisher, IdOf<Publisher>, FilterOf<Publisher>, null>;
  parentTaskOld?: EntityGraphQLFilter<TaskOld, IdOf<TaskOld>, FilterOf<TaskOld>, null>;
}

export interface CommentOrder {
  id?: OrderBy;
  parentTaggedId?: OrderBy;
  parentTags?: OrderBy;
  text?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  user?: UserOrder;
}

export interface CommentFactoryExtras {
  withParentTaggedId?: string | null;
  withParentTags?: string;
}

export const commentConfig = new ConfigApi<Comment, Context>();

commentConfig.addRule("parentTags", newRequiredRule("parentTags"));
commentConfig.addRule(newRequiredRule("createdAt"));
commentConfig.addRule(newRequiredRule("updatedAt"));
commentConfig.addRule(newRequiredRule("parent"));

declare module "joist-orm" {
  interface TypeMap {
    Comment: {
      entityType: Comment;
      filterType: CommentFilter;
      gqlFilterType: CommentGraphQLFilter;
      orderType: CommentOrder;
      optsType: CommentOpts;
      fieldsType: CommentFields;
      optIdsType: CommentIdsOpts;
      factoryExtrasType: CommentFactoryExtras;
      factoryOptsType: Parameters<typeof newComment>[1];
    };
  }
}

export abstract class CommentCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "comment";
  static readonly metadata: EntityMetadata<Comment>;

  declare readonly __type: { 0: "Comment" };

  constructor(em: EntityManager, opts: CommentOpts) {
    super(em, opts);
    setOpts(this as any as Comment, opts, { calledFromConstructor: true });
  }

  get id(): CommentId {
    return this.idMaybe || failNoIdYet("Comment");
  }

  get idMaybe(): CommentId | undefined {
    return toIdOf(commentMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("Comment");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  abstract readonly parentTaggedId: ReactiveField<Comment, string | undefined>;

  abstract readonly parentTags: ReactiveField<Comment, string>;

  get text(): string | undefined {
    return getField(this, "text");
  }

  set text(text: string | undefined) {
    setField(this, "text", cleanStringValue(text));
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
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  set(opts: Partial<CommentOpts>): void {
    setOpts(this as any as Comment, opts);
  }

  /**
   * Partial update taking any subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setPartial(opts: PartialOrNull<CommentOpts>): void {
    setOpts(this as any as Comment, opts as OptsOf<Comment>, { partial: true });
  }

  /**
   * Partial update taking any nested subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
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
   * @see {@link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setDeepPartial(opts: DeepPartialOrNull<Comment>): Promise<void> {
    return updatePartial(this as any as Comment, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<Comment> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<Comment>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Comment, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/docs/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<Comment>>(hint: H): Promise<Loaded<Comment, H>>;
  populate<const H extends LoadHint<Comment>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Comment, H>>;
  populate<const H extends LoadHint<Comment>, V>(hint: H, fn: (comment: Loaded<Comment, H>) => V): Promise<V>;
  populate<const H extends LoadHint<Comment>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (comment: Loaded<Comment, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<Comment>, V>(
    hintOrOpts: any,
    fn?: (comment: Loaded<Comment, H>) => V,
  ): Promise<Loaded<Comment, H> | V> {
    return this.em.populate(this as any as Comment, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<Comment>>(hint: H): this is Loaded<Comment, H> {
    return isLoaded(this as any as Comment, hint);
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
   * @see {@link https://joist-orm.io/docs/advanced/json-payloads | Json Payloads} on the Joist docs
   */
  toJSON(): object;
  toJSON<const H extends ToJsonHint<Comment>>(hint: H): Promise<JsonPayload<Comment, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get books(): Collection<Comment, Book> {
    return this.__data.relations.books ??= hasMany(this, bookMeta, "books", "randomComment", "random_comment_id", {
      "field": "title",
      "direction": "ASC",
    });
  }

  get user(): ManyToOneReference<Comment, User, undefined> {
    return this.__data.relations.user ??= hasOne(this, userMeta, "user", "createdComments");
  }

  get likedByUsers(): Collection<Comment, User> {
    return this.__data.relations.likedByUsers ??= hasManyToMany(
      this,
      "users_to_comments",
      "likedByUsers",
      "comment_id",
      userMeta,
      "likedComments",
      "liked_by_user_id",
    );
  }

  get parent(): PolymorphicReference<Comment, CommentParent, never> {
    return this.__data.relations.parent ??= hasOnePolymorphic(this, "parent");
  }
}
