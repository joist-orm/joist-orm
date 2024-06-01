import {
  BaseEntity,
  cleanStringValue,
  ConfigApi,
  failNoIdYet,
  getField,
  hasManyToMany,
  hasOne,
  hasOnePolymorphic,
  isEntity,
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
  IdOf,
  JsonPayload,
  Lens,
  Loaded,
  LoadHint,
  ManyToOneReference,
  MaybeAbstractEntityConstructor,
  OptsOf,
  OrderBy,
  PartialOrNull,
  PolymorphicReference,
  ReactiveField,
  TaggedId,
  ToJsonHint,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import {
  AdminUser,
  Author,
  Book,
  BookReview,
  Comment,
  commentMeta,
  EntityManager,
  newComment,
  Publisher,
  TaskOld,
  User,
  userMeta,
} from "../entities";
import type { AdminUserId, Entity, UserId, UserOrder } from "../entities";

export type CommentId = Flavor<string, Comment>;

export type CommentParent = Author | Book | BookReview | Publisher | TaskOld;
export function getCommentParentConstructors(): MaybeAbstractEntityConstructor<CommentParent>[] {
  return [Author, Book, BookReview, Publisher, TaskOld];
}
export function isCommentParent(maybeEntity: unknown): maybeEntity is CommentParent {
  return isEntity(maybeEntity) && getCommentParentConstructors().some((type) => maybeEntity instanceof type);
}

export interface CommentFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  parentTaggedId: { kind: "primitive"; type: string; unique: true; nullable: undefined; derived: true };
  parentTags: { kind: "primitive"; type: string; unique: false; nullable: never; derived: true };
  text: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  user: { kind: "m2o"; type: User; nullable: undefined; derived: false };
  parent: { kind: "poly"; type: CommentParent; nullable: never };
}

export interface CommentOpts {
  text?: string | null;
  user?: User | UserId | null;
  parent: CommentParent;
  likedByUsers?: User[];
}

export interface CommentIdsOpts {
  userId?: UserId | null;
  parentId?: IdOf<CommentParent> | null;
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

export const commentConfig = new ConfigApi<Comment, Context>();

commentConfig.addRule(newRequiredRule("parentTags"));
commentConfig.addRule(newRequiredRule("createdAt"));
commentConfig.addRule(newRequiredRule("updatedAt"));
commentConfig.addRule(newRequiredRule("parent"));

export abstract class CommentCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "comment";
  static readonly metadata: EntityMetadata<Comment>;

  declare readonly __orm: {
    filterType: CommentFilter;
    gqlFilterType: CommentGraphQLFilter;
    orderType: CommentOrder;
    optsType: CommentOpts;
    fieldsType: CommentFields;
    optIdsType: CommentIdsOpts;
    factoryOptsType: Parameters<typeof newComment>[1];
  };

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

  set(opts: Partial<CommentOpts>): void {
    setOpts(this as any as Comment, opts);
  }

  setPartial(opts: PartialOrNull<CommentOpts>): void {
    setOpts(this as any as Comment, opts as OptsOf<Comment>, { partial: true });
  }

  get changes(): Changes<Comment> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<Comment>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Comment, fn, opts);
  }

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

  isLoaded<const H extends LoadHint<Comment>>(hint: H): this is Loaded<Comment, H> {
    return isLoaded(this as any as Comment, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<Comment>>(hint: H): Promise<JsonPayload<Comment, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get user(): ManyToOneReference<Comment, User, undefined> {
    return this.__data.relations.user ??= hasOne(this as any as Comment, userMeta, "user", "createdComments");
  }

  get likedByUsers(): Collection<Comment, User> {
    return this.__data.relations.likedByUsers ??= hasManyToMany(
      this as any as Comment,
      "users_to_comments",
      "likedByUsers",
      "comment_id",
      userMeta,
      "likedComments",
      "liked_by_user_id",
    );
  }

  get parent(): PolymorphicReference<Comment, CommentParent, never> {
    return this.__data.relations.parent ??= hasOnePolymorphic(this as any as Comment, "parent");
  }
}
