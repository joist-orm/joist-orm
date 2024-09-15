import {
  BaseEntity,
  type Changes,
  cleanStringValue,
  type Collection,
  ConfigApi,
  type EntityFilter,
  type EntityGraphQLFilter,
  type EntityMetadata,
  failNoIdYet,
  type FieldsOf,
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
  type RelationsOf,
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
import { type IpAddress, type PasswordValue } from "src/entities/types";
import {
  AdminUser,
  type AdminUserId,
  Author,
  type AuthorId,
  authorMeta,
  type AuthorOrder,
  Comment,
  type CommentId,
  commentMeta,
  type Entity,
  EntityManager,
  LargePublisher,
  newUser,
  SmallPublisher,
  User,
  userMeta,
} from "../entities";

export type UserId = Flavor<string, User>;

export type UserFavoritePublisher = LargePublisher | SmallPublisher;
export function getUserFavoritePublisherConstructors(): MaybeAbstractEntityConstructor<UserFavoritePublisher>[] {
  return [LargePublisher, SmallPublisher];
}
export function isUserFavoritePublisher(maybeEntity: unknown): maybeEntity is UserFavoritePublisher {
  return isEntity(maybeEntity) && getUserFavoritePublisherConstructors().some((type) => maybeEntity instanceof type);
}

export interface UserFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  email: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  ipAddress: { kind: "primitive"; type: IpAddress; unique: false; nullable: undefined; derived: false };
  password: { kind: "primitive"; type: PasswordValue; unique: false; nullable: undefined; derived: false };
  bio: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  originalEmail: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  trialPeriod: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  manager: { kind: "m2o"; type: User; nullable: undefined; derived: false };
  authorManyToOne: { kind: "m2o"; type: Author; nullable: undefined; derived: false };
  favoritePublisher: { kind: "poly"; type: UserFavoritePublisher; nullable: undefined };
}

export interface UserOpts {
  name: string;
  email: string;
  ipAddress?: IpAddress | null;
  password?: PasswordValue | null;
  bio?: string;
  originalEmail?: string;
  trialPeriod?: string | null;
  manager?: User | UserId | null;
  authorManyToOne?: Author | AuthorId | null;
  favoritePublisher?: UserFavoritePublisher;
  createdComments?: Comment[];
  directs?: User[];
  likedComments?: Comment[];
}

export interface UserIdsOpts {
  managerId?: UserId | null;
  authorManyToOneId?: AuthorId | null;
  favoritePublisherId?: IdOf<UserFavoritePublisher> | null;
  createdCommentIds?: CommentId[] | null;
  directIds?: UserId[] | null;
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
  trialPeriod?: ValueFilter<string, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  manager?: EntityFilter<User, UserId, FilterOf<User>, null>;
  managerAdminUser?: EntityFilter<AdminUser, AdminUserId, FilterOf<AdminUser>, null>;
  authorManyToOne?: EntityFilter<Author, AuthorId, FilterOf<Author>, null>;
  createdComments?: EntityFilter<Comment, CommentId, FilterOf<Comment>, null | undefined>;
  directs?: EntityFilter<User, UserId, FilterOf<User>, null | undefined>;
  likedComments?: EntityFilter<Comment, CommentId, FilterOf<Comment>, null | undefined>;
  favoritePublisher?: EntityFilter<UserFavoritePublisher, IdOf<UserFavoritePublisher>, never, null>;
  favoritePublisherLargePublisher?: EntityFilter<LargePublisher, IdOf<LargePublisher>, FilterOf<LargePublisher>, null>;
  favoritePublisherSmallPublisher?: EntityFilter<SmallPublisher, IdOf<SmallPublisher>, FilterOf<SmallPublisher>, null>;
}

export interface UserGraphQLFilter {
  id?: ValueGraphQLFilter<UserId>;
  name?: ValueGraphQLFilter<string>;
  email?: ValueGraphQLFilter<string>;
  ipAddress?: ValueGraphQLFilter<IpAddress>;
  password?: ValueGraphQLFilter<PasswordValue>;
  bio?: ValueGraphQLFilter<string>;
  originalEmail?: ValueGraphQLFilter<string>;
  trialPeriod?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  manager?: EntityGraphQLFilter<User, UserId, GraphQLFilterOf<User>, null>;
  managerAdminUser?: EntityGraphQLFilter<AdminUser, AdminUserId, GraphQLFilterOf<AdminUser>, null>;
  authorManyToOne?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null>;
  createdComments?: EntityGraphQLFilter<Comment, CommentId, GraphQLFilterOf<Comment>, null | undefined>;
  directs?: EntityGraphQLFilter<User, UserId, GraphQLFilterOf<User>, null | undefined>;
  likedComments?: EntityGraphQLFilter<Comment, CommentId, GraphQLFilterOf<Comment>, null | undefined>;
  favoritePublisher?: EntityGraphQLFilter<UserFavoritePublisher, IdOf<UserFavoritePublisher>, never, null>;
  favoritePublisherLargePublisher?: EntityGraphQLFilter<
    LargePublisher,
    IdOf<LargePublisher>,
    FilterOf<LargePublisher>,
    null
  >;
  favoritePublisherSmallPublisher?: EntityGraphQLFilter<
    SmallPublisher,
    IdOf<SmallPublisher>,
    FilterOf<SmallPublisher>,
    null
  >;
}

export interface UserOrder {
  id?: OrderBy;
  name?: OrderBy;
  email?: OrderBy;
  ipAddress?: OrderBy;
  password?: OrderBy;
  bio?: OrderBy;
  originalEmail?: OrderBy;
  trialPeriod?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  manager?: UserOrder;
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
    entityType: User;
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

  get trialPeriod(): string | undefined {
    return getField(this, "trialPeriod");
  }

  set trialPeriod(trialPeriod: string | undefined) {
    setField(this, "trialPeriod", cleanStringValue(trialPeriod));
  }

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  /**
   * Partial update taking any subset of the entities fields.
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   * @example
   * ```
   * entity.setPartial({
   *  firstName: 'foo' // updated
   *  lastName: undefined // do nothing
   *  age: null // unset, (i.e. set it as undefined)
   * })
   * ```
   * @see @{link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  set(opts: Partial<UserOpts>): void {
    setOpts(this as any as User, opts);
  }

  /**
   * Partial update taking any subset of the entities fields.
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   * @example
   * ```
   * entity.setPartial({
   *  firstName: 'foo' // updated
   *  lastName: undefined // do nothing
   *  age: null // unset, (i.e. set it as undefined)
   * })
   * ```
   * @see @{link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setPartial(opts: PartialOrNull<UserOpts>): void {
    setOpts(this as any as User, opts as OptsOf<User>, { partial: true });
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   * @see @{link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<
    User,
    keyof (FieldsOf<User> & RelationsOf<User>) | keyof (FieldsOf<AdminUser> & RelationsOf<AdminUser>)
  > {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens
   */
  load<U, V>(fn: (lens: Lens<User>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as User, fn, opts);
  }

  /**
   * Traverse from this entity using a lens, and load the result
   * @see @{link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  populate<const H extends LoadHint<User>>(hint: H): Promise<Loaded<User, H>>;
  populate<const H extends LoadHint<User>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<User, H>>;
  populate<const H extends LoadHint<User>, V>(hint: H, fn: (u: Loaded<User, H>) => V): Promise<V>;
  populate<const H extends LoadHint<User>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (u: Loaded<User, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<User>, V>(
    hintOrOpts: any,
    fn?: (u: Loaded<User, H>) => V,
  ): Promise<Loaded<User, H> | V> {
    return this.em.populate(this as any as User, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work. Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<User>>(hint: H): this is Loaded<User, H> {
    return isLoaded(this as any as User, hint);
  }

  /**
   * Build a type-safe, loadable and relation aware POJO from this entity, given a hint
   * Note: As the hint might load, this returns a Promise
   * @example
   * ```
   * const payload = await a.toJSON({
   *   id: true,
   *   books: { id: true, reviews: { rating: true } }
   * });
   * ```
   * @see @{link https://joist-orm.io/docs/advanced/json-payloads | Json Payloads} on the Joist docs
   */
  toJSON(): object;
  toJSON<const H extends ToJsonHint<User>>(hint: H): Promise<JsonPayload<User, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get createdComments(): Collection<User, Comment> {
    return this.__data.relations.createdComments ??= hasMany(
      this as any as User,
      commentMeta,
      "createdComments",
      "user",
      "user_id",
      undefined,
    );
  }

  get directs(): Collection<User, User> {
    return this.__data.relations.directs ??= hasMany(
      this as any as User,
      userMeta,
      "directs",
      "manager",
      "manager_id",
      undefined,
    );
  }

  get manager(): ManyToOneReference<User, User, undefined> {
    return this.__data.relations.manager ??= hasOne(this as any as User, userMeta, "manager", "directs");
  }

  get authorManyToOne(): ManyToOneReference<User, Author, undefined> {
    return this.__data.relations.authorManyToOne ??= hasOne(
      this as any as User,
      authorMeta,
      "authorManyToOne",
      "userOneToOne",
    );
  }

  get likedComments(): Collection<User, Comment> {
    return this.__data.relations.likedComments ??= hasManyToMany(
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
    return this.__data.relations.favoritePublisher ??= hasOnePolymorphic(this as any as User, "favoritePublisher");
  }
}
