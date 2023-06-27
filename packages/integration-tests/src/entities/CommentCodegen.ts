import {
  BaseEntity,
  Changes,
  cleanStringValue,
  Collection,
  ConfigApi,
  Entity,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  EntityOrmField,
  fail,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  hasManyToMany,
  hasOne,
  hasOnePolymorphic,
  IdOf,
  isLoaded,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  ManyToOneReference,
  MaybeAbstractEntityConstructor,
  newChangesProxy,
  newRequiredRule,
  OptsOf,
  OrderBy,
  PartialOrNull,
  PolymorphicReference,
  setField,
  setOpts,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import {
  Author,
  Book,
  BookReview,
  Comment,
  commentMeta,
  newComment,
  Publisher,
  User,
  UserId,
  userMeta,
  UserOrder,
} from "./entities";
import type { EntityManager } from "./entities";
export type CommentId = Flavor<string, "Comment">;
export type CommentParent = Author | Book | BookReview | Publisher;
export function getCommentParentConstructors(): MaybeAbstractEntityConstructor<CommentParent>[] {
  return [Author, Book, BookReview, Publisher];
}
export function isCommentParent(maybeEntity: Entity | undefined | null): maybeEntity is CommentParent {
  return maybeEntity !== undefined && maybeEntity !== null &&
    getCommentParentConstructors().some((type) => maybeEntity instanceof type);
}
export interface CommentFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: false };
  text: { kind: "primitive"; type: string; unique: false; nullable: undefined };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  user: { kind: "m2o"; type: User; nullable: undefined };
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
  id?: ValueFilter<CommentId, never>;
  text?: ValueFilter<string, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  user?: EntityFilter<User, UserId, FilterOf<User>, null>;
  likedByUsers?: EntityFilter<User, UserId, FilterOf<User>, null | undefined>;
  parent?: EntityFilter<CommentParent, IdOf<CommentParent>, never, null | undefined>;
}
export interface CommentGraphQLFilter {
  id?: ValueGraphQLFilter<CommentId>;
  text?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  user?: EntityGraphQLFilter<User, UserId, GraphQLFilterOf<User>, null>;
  likedByUsers?: EntityGraphQLFilter<User, UserId, GraphQLFilterOf<User>, null | undefined>;
  parent?: EntityGraphQLFilter<CommentParent, IdOf<CommentParent>, never, null | undefined>;
}
export interface CommentOrder {
  id?: OrderBy;
  text?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  user?: UserOrder;
}
export const commentConfig = new ConfigApi<Comment, Context>();
commentConfig.addRule(newRequiredRule("createdAt"));
commentConfig.addRule(newRequiredRule("updatedAt"));
commentConfig.addRule(newRequiredRule("parent"));
export abstract class CommentCodegen extends BaseEntity<EntityManager> {
  static defaultValues: object = {};
  static readonly tagName = "comment";
  static readonly metadata: EntityMetadata<Comment>;
  declare readonly __orm: EntityOrmField & {
    filterType: CommentFilter;
    gqlFilterType: CommentGraphQLFilter;
    orderType: CommentOrder;
    optsType: CommentOpts;
    fieldsType: CommentFields;
    optIdsType: CommentIdsOpts;
    factoryOptsType: Parameters<typeof newComment>[1];
  };
  readonly user: ManyToOneReference<Comment, User, undefined> = hasOne(userMeta, "user", "createdComments");
  readonly likedByUsers: Collection<Comment, User> = hasManyToMany(
    "users_to_comments",
    "likedByUsers",
    "comment_id",
    userMeta,
    "likedComments",
    "liked_by_user_id",
  );
  readonly parent: PolymorphicReference<Comment, CommentParent, never> = hasOnePolymorphic("parent");
  constructor(em: EntityManager, opts: CommentOpts) {
    super(em, commentMeta, CommentCodegen.defaultValues, opts);
    setOpts((this as any) as Comment, opts, { calledFromConstructor: true });
  }
  get id(): CommentId | undefined {
    return this.idTagged;
  }
  get idOrFail(): CommentId {
    return this.id || fail("Comment has no id yet");
  }
  get idTagged(): CommentId | undefined {
    return this.__orm.data["id"];
  }
  get idTaggedOrFail(): CommentId {
    return this.idTagged || fail("Comment has no id tagged yet");
  }
  get text(): string | undefined {
    return this.__orm.data["text"];
  }
  set text(text: string | undefined) {
    setField(this, "text", cleanStringValue(text));
  }
  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }
  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }
  set(opts: Partial<CommentOpts>): void {
    setOpts((this as any) as Comment, opts);
  }
  setPartial(opts: PartialOrNull<CommentOpts>): void {
    setOpts((this as any) as Comment, opts as OptsOf<Comment>, { partial: true });
  }
  get changes(): Changes<Comment> {
    return (newChangesProxy(this) as any);
  }
  load<U, V>(fn: (lens: Lens<Comment>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens((this as any) as Comment, fn, opts);
  }
  populate<H extends LoadHint<Comment>>(hint: H): Promise<Loaded<Comment, H>>;
  populate<H extends LoadHint<Comment>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Comment, H>>;
  populate<H extends LoadHint<Comment>, V>(hint: H, fn: (comment: Loaded<Comment, H>) => V): Promise<V>;
  populate<H extends LoadHint<Comment>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (comment: Loaded<Comment, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<Comment>, V>(
    hintOrOpts: any,
    fn?: (comment: Loaded<Comment, H>) => V,
  ): Promise<Loaded<Comment, H> | V> {
    return this.em.populate((this as any) as Comment, hintOrOpts, fn);
  }
  isLoaded<H extends LoadHint<Comment>>(hint: H): this is Loaded<Comment, H> {
    return isLoaded((this as any) as Comment, hint);
  }
}
