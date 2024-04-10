import {
  BaseEntity,
  cleanStringValue,
  ConfigApi,
  failNoIdYet,
  getField,
  getInstanceData,
  hasMany,
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
} from "joist-orm";
import type {
  Changes,
  Collection,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  FieldsOf,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  IdOf,
  Lens,
  Loaded,
  LoadHint,
  ManyToOneReference,
  MaybeAbstractEntityConstructor,
  OptsOf,
  OrderBy,
  PartialOrNull,
  PolymorphicReference,
  TaggedId,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import type { IpAddress, PasswordValue } from "src/entities/types";
import {
  AdminUser,
  Author,
  authorMeta,
  Comment,
  commentMeta,
  EntityManager,
  LargePublisher,
  newUser,
  SmallPublisher,
  User,
  userMeta,
} from "../entities";
import type { AuthorId, AuthorOrder, CommentId, Entity } from "../entities";

export type UserId = Flavor<string, User>;

export type UserFavoritePublisher = LargePublisher | SmallPublisher;
export function getUserFavoritePublisherConstructors(): MaybeAbstractEntityConstructor<UserFavoritePublisher>[] {
  return [LargePublisher, SmallPublisher];
}
export function isUserFavoritePublisher(maybeEntity: unknown): maybeEntity is UserFavoritePublisher {
  return isEntity(maybeEntity) && getUserFavoritePublisherConstructors().some((type) => maybeEntity instanceof type);
}

export interface UserFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  email: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  ipAddress: { kind: "primitive"; type: IpAddress; unique: false; nullable: undefined; derived: false };
  password: { kind: "primitive"; type: PasswordValue; unique: false; nullable: undefined; derived: false };
  bio: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  originalEmail: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  authorManyToOne: { kind: "m2o"; type: Author; nullable: undefined; derived: false };
  favoritePublisher: { kind: "poly"; type: UserFavoritePublisher; nullable: undefined };
}

export interface UserOpts {
  name: string;
  email: string;
  ipAddress?: IpAddress | null;
  password?: PasswordValue | null;
  bio?: string;
  originalEmail: string;
  authorManyToOne?: Author | AuthorId | null;
  favoritePublisher?: UserFavoritePublisher;
  createdComments?: Comment[];
  likedComments?: Comment[];
}

export interface UserIdsOpts {
  authorManyToOneId?: AuthorId | null;
  favoritePublisherId?: IdOf<UserFavoritePublisher> | null;
  createdCommentIds?: CommentId[] | null;
  likedCommentIds?: CommentId[] | null;
}

export interface UserFilter {
  id?: ValueFilter<UserId, never> | null;
  name?: ValueFilter<string, never>;
  email?: ValueFilter<string, never>;
  ipAddress?: ValueFilter<IpAddress, null>;
  password?: ValueFilter<PasswordValue, null>;
  bio?: ValueFilter<string, never>;
  originalEmail?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  authorManyToOne?: EntityFilter<Author, AuthorId, FilterOf<Author>, null>;
  createdComments?: EntityFilter<Comment, CommentId, FilterOf<Comment>, null | undefined>;
  likedComments?: EntityFilter<Comment, CommentId, FilterOf<Comment>, null | undefined>;
  favoritePublisher?: EntityFilter<UserFavoritePublisher, IdOf<UserFavoritePublisher>, never, null | undefined>;
}

export interface UserGraphQLFilter {
  id?: ValueGraphQLFilter<UserId>;
  name?: ValueGraphQLFilter<string>;
  email?: ValueGraphQLFilter<string>;
  ipAddress?: ValueGraphQLFilter<IpAddress>;
  password?: ValueGraphQLFilter<PasswordValue>;
  bio?: ValueGraphQLFilter<string>;
  originalEmail?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  authorManyToOne?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null>;
  createdComments?: EntityGraphQLFilter<Comment, CommentId, GraphQLFilterOf<Comment>, null | undefined>;
  likedComments?: EntityGraphQLFilter<Comment, CommentId, GraphQLFilterOf<Comment>, null | undefined>;
  favoritePublisher?: EntityGraphQLFilter<UserFavoritePublisher, IdOf<UserFavoritePublisher>, never, null | undefined>;
}

export interface UserOrder {
  id?: OrderBy;
  name?: OrderBy;
  email?: OrderBy;
  ipAddress?: OrderBy;
  password?: OrderBy;
  bio?: OrderBy;
  originalEmail?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  authorManyToOne?: AuthorOrder;
}

export const userConfig = new ConfigApi<User, Context>();

userConfig.addRule(newRequiredRule("name"));
userConfig.addRule(newRequiredRule("email"));
userConfig.addRule(newRequiredRule("bio"));
userConfig.addRule(newRequiredRule("originalEmail"));
userConfig.addRule(newRequiredRule("createdAt"));
userConfig.addRule(newRequiredRule("updatedAt"));
userConfig.setDefault("bio", "");

export abstract class UserCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "u";
  static readonly metadata: EntityMetadata<User>;

  declare readonly __orm: {
    filterType: UserFilter;
    gqlFilterType: UserGraphQLFilter;
    orderType: UserOrder;
    optsType: UserOpts;
    fieldsType: UserFields;
    optIdsType: UserIdsOpts;
    factoryOptsType: Parameters<typeof newUser>[1];
  };

  constructor(em: EntityManager, opts: UserOpts) {
    super(em, opts);
    setOpts(this as any as User, opts, { calledFromConstructor: true });
  }

  get id(): UserId {
    return this.idMaybe || failNoIdYet("User");
  }

  get idMaybe(): UserId | undefined {
    return toIdOf(userMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("User");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get name(): string {
    return getField(this, "name");
  }

  set name(name: string) {
    setField(this, "name", cleanStringValue(name));
  }

  get email(): string {
    return getField(this, "email");
  }

  set email(email: string) {
    setField(this, "email", cleanStringValue(email));
  }

  get ipAddress(): IpAddress | undefined {
    return getField(this, "ipAddress");
  }

  set ipAddress(ipAddress: IpAddress | undefined) {
    setField(this, "ipAddress", ipAddress);
  }

  get password(): PasswordValue | undefined {
    return getField(this, "password");
  }

  set password(password: PasswordValue | undefined) {
    setField(this, "password", password);
  }

  get bio(): string {
    return getField(this, "bio");
  }

  set bio(bio: string) {
    setField(this, "bio", bio);
  }

  get originalEmail(): string {
    return getField(this, "originalEmail");
  }

  set originalEmail(originalEmail: string) {
    setField(this, "originalEmail", cleanStringValue(originalEmail));
  }

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  set(opts: Partial<UserOpts>): void {
    setOpts(this as any as User, opts);
  }

  setPartial(opts: PartialOrNull<UserOpts>): void {
    setOpts(this as any as User, opts as OptsOf<User>, { partial: true });
  }

  get changes(): Changes<User, keyof FieldsOf<User> | keyof FieldsOf<AdminUser>> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<User>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as User, fn, opts);
  }

  populate<H extends LoadHint<User>>(hint: H): Promise<Loaded<User, H>>;
  populate<H extends LoadHint<User>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<User, H>>;
  populate<H extends LoadHint<User>, V>(hint: H, fn: (u: Loaded<User, H>) => V): Promise<V>;
  populate<H extends LoadHint<User>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (u: Loaded<User, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<User>, V>(hintOrOpts: any, fn?: (u: Loaded<User, H>) => V): Promise<Loaded<User, H> | V> {
    return this.em.populate(this as any as User, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<User>>(hint: H): this is Loaded<User, H> {
    return isLoaded(this as any as User, hint);
  }

  get createdComments(): Collection<User, Comment> {
    const { relations } = getInstanceData(this);
    return relations.createdComments ??= hasMany(
      this as any as User,
      commentMeta,
      "createdComments",
      "user",
      "user_id",
      undefined,
    );
  }

  get authorManyToOne(): ManyToOneReference<User, Author, undefined> {
    const { relations } = getInstanceData(this);
    return relations.authorManyToOne ??= hasOne(this as any as User, authorMeta, "authorManyToOne", "userOneToOne");
  }

  get likedComments(): Collection<User, Comment> {
    const { relations } = getInstanceData(this);
    return relations.likedComments ??= hasManyToMany(
      this as any as User,
      "users_to_comments",
      "likedComments",
      "liked_by_user_id",
      commentMeta,
      "likedByUsers",
      "comment_id",
    );
  }

  get favoritePublisher(): PolymorphicReference<User, UserFavoritePublisher, undefined> {
    const { relations } = getInstanceData(this);
    return relations.favoritePublisher ??= hasOnePolymorphic(this as any as User, "favoritePublisher");
  }
}
