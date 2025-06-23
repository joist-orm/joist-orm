import {
  BaseEntity,
  type Changes,
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
  type Entity,
  EntityManager,
  newUserPublisherGroup,
  SmallPublisherGroup,
  TinyPublisherGroup,
  User,
  type UserId,
  userMeta,
  type UserOrder,
  UserPublisherGroup,
  userPublisherGroupMeta,
} from "../entities";

export type UserPublisherGroupId = Flavor<string, "UserPublisherGroup">;

export type UserPublisherGroupPublisher = SmallPublisherGroup | TinyPublisherGroup;
export function getUserPublisherGroupPublisherConstructors(): MaybeAbstractEntityConstructor<
  UserPublisherGroupPublisher
>[] {
  return [SmallPublisherGroup, TinyPublisherGroup];
}
export function isUserPublisherGroupPublisher(maybeEntity: unknown): maybeEntity is UserPublisherGroupPublisher {
  return isEntity(maybeEntity) &&
    getUserPublisherGroupPublisherConstructors().some((type) => maybeEntity instanceof type);
}

export interface UserPublisherGroupFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  user: { kind: "m2o"; type: User; nullable: never; derived: false };
  publisher: { kind: "poly"; type: UserPublisherGroupPublisher; nullable: never };
}

export interface UserPublisherGroupOpts {
  user: User | UserId;
  publisher: UserPublisherGroupPublisher;
}

export interface UserPublisherGroupIdsOpts {
  userId?: UserId | null;
  publisherId?: IdOf<UserPublisherGroupPublisher> | null;
}

export interface UserPublisherGroupFilter {
  id?: ValueFilter<UserPublisherGroupId, never> | null;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  user?: EntityFilter<User, UserId, FilterOf<User>, never>;
  userAdminUser?: EntityFilter<AdminUser, AdminUserId, FilterOf<AdminUser>, never>;
  publisher?: EntityFilter<UserPublisherGroupPublisher, IdOf<UserPublisherGroupPublisher>, never, never>;
  publisherSmallPublisherGroup?: EntityFilter<
    SmallPublisherGroup,
    IdOf<SmallPublisherGroup>,
    FilterOf<SmallPublisherGroup>,
    null
  >;
  publisherTinyPublisherGroup?: EntityFilter<
    TinyPublisherGroup,
    IdOf<TinyPublisherGroup>,
    FilterOf<TinyPublisherGroup>,
    null
  >;
}

export interface UserPublisherGroupGraphQLFilter {
  id?: ValueGraphQLFilter<UserPublisherGroupId>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  user?: EntityGraphQLFilter<User, UserId, GraphQLFilterOf<User>, never>;
  userAdminUser?: EntityGraphQLFilter<AdminUser, AdminUserId, GraphQLFilterOf<AdminUser>, never>;
  publisher?: EntityGraphQLFilter<UserPublisherGroupPublisher, IdOf<UserPublisherGroupPublisher>, never, never>;
  publisherSmallPublisherGroup?: EntityGraphQLFilter<
    SmallPublisherGroup,
    IdOf<SmallPublisherGroup>,
    FilterOf<SmallPublisherGroup>,
    null
  >;
  publisherTinyPublisherGroup?: EntityGraphQLFilter<
    TinyPublisherGroup,
    IdOf<TinyPublisherGroup>,
    FilterOf<TinyPublisherGroup>,
    null
  >;
}

export interface UserPublisherGroupOrder {
  id?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  user?: UserOrder;
}

export interface UserPublisherGroupFactoryExtras {
}

export const userPublisherGroupConfig = new ConfigApi<UserPublisherGroup, Context>();

userPublisherGroupConfig.addRule(newRequiredRule("createdAt"));
userPublisherGroupConfig.addRule(newRequiredRule("updatedAt"));
userPublisherGroupConfig.addRule(newRequiredRule("user"));
userPublisherGroupConfig.addRule(newRequiredRule("publisher"));

declare module "joist-orm" {
  interface TypeMap {
    UserPublisherGroup: {
      entityType: UserPublisherGroup;
      filterType: UserPublisherGroupFilter;
      gqlFilterType: UserPublisherGroupGraphQLFilter;
      orderType: UserPublisherGroupOrder;
      optsType: UserPublisherGroupOpts;
      fieldsType: UserPublisherGroupFields;
      optIdsType: UserPublisherGroupIdsOpts;
      factoryExtrasType: UserPublisherGroupFactoryExtras;
      factoryOptsType: Parameters<typeof newUserPublisherGroup>[1];
    };
  }
}

export abstract class UserPublisherGroupCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "upg";
  static readonly metadata: EntityMetadata<UserPublisherGroup>;

  declare readonly __type: { 0: "UserPublisherGroup" };

  constructor(em: EntityManager, opts: UserPublisherGroupOpts) {
    super(em, opts);
    setOpts(this as any as UserPublisherGroup, opts, { calledFromConstructor: true });
  }

  get id(): UserPublisherGroupId {
    return this.idMaybe || failNoIdYet("UserPublisherGroup");
  }

  get idMaybe(): UserPublisherGroupId | undefined {
    return toIdOf(userPublisherGroupMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("UserPublisherGroup");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
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
  set(opts: Partial<UserPublisherGroupOpts>): void {
    setOpts(this as any as UserPublisherGroup, opts);
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
  setPartial(opts: PartialOrNull<UserPublisherGroupOpts>): void {
    setOpts(this as any as UserPublisherGroup, opts as OptsOf<UserPublisherGroup>, { partial: true });
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
  setDeepPartial(opts: DeepPartialOrNull<UserPublisherGroup>): Promise<void> {
    return updatePartial(this as any as UserPublisherGroup, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<UserPublisherGroup> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<UserPublisherGroup>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as UserPublisherGroup, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<UserPublisherGroup>>(hint: H): Promise<Loaded<UserPublisherGroup, H>>;
  populate<const H extends LoadHint<UserPublisherGroup>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<UserPublisherGroup, H>>;
  populate<const H extends LoadHint<UserPublisherGroup>, V>(
    hint: H,
    fn: (upg: Loaded<UserPublisherGroup, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<UserPublisherGroup>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (upg: Loaded<UserPublisherGroup, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<UserPublisherGroup>, V>(
    hintOrOpts: any,
    fn?: (upg: Loaded<UserPublisherGroup, H>) => V,
  ): Promise<Loaded<UserPublisherGroup, H> | V> {
    return this.em.populate(this as any as UserPublisherGroup, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<UserPublisherGroup>>(hint: H): this is Loaded<UserPublisherGroup, H> {
    return isLoaded(this as any as UserPublisherGroup, hint);
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
  toJSON<const H extends ToJsonHint<UserPublisherGroup>>(hint: H): Promise<JsonPayload<UserPublisherGroup, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get user(): ManyToOneReference<UserPublisherGroup, User, never> {
    return this.__data.relations.user ??= hasOne(this, userMeta, "user", "publisherGroups");
  }

  get publisher(): PolymorphicReference<UserPublisherGroup, UserPublisherGroupPublisher, never> {
    return this.__data.relations.publisher ??= hasOnePolymorphic(this, "publisher");
  }
}
