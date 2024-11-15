import {
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
  hasOne,
  isLoaded,
  type JsonPayload,
  type Lens,
  type Loaded,
  type LoadHint,
  loadLens,
  type ManyToOneReference,
  mustBeSubType,
  newChangesProxy,
  newRequiredRule,
  type OptsOf,
  type OrderBy,
  type PartialOrNull,
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
  BookAdvance,
  Comment,
  type Entity,
  EntityManager,
  Image,
  newSmallPublisher,
  Publisher,
  type PublisherFields,
  type PublisherFilter,
  type PublisherGraphQLFilter,
  type PublisherIdsOpts,
  type PublisherOpts,
  type PublisherOrder,
  SmallPublisher,
  SmallPublisherGroup,
  type SmallPublisherGroupId,
  smallPublisherGroupMeta,
  type SmallPublisherGroupOrder,
  smallPublisherMeta,
  Tag,
  TaskOld,
  User,
  type UserId,
  userMeta,
} from "../entities";

export type SmallPublisherId = Flavor<string, "Publisher">;

export interface SmallPublisherFields extends PublisherFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  city: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  sharedColumn: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  allAuthorNames: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: true };
  selfReferential: { kind: "m2o"; type: SmallPublisher; nullable: undefined; derived: false };
  group: { kind: "m2o"; type: SmallPublisherGroup; nullable: undefined; derived: false };
}

export interface SmallPublisherOpts extends PublisherOpts {
  city: string;
  sharedColumn?: string | null;
  selfReferential?: SmallPublisher | SmallPublisherId | null;
  group?: SmallPublisherGroup | SmallPublisherGroupId | null;
  smallPublishers?: SmallPublisher[];
  users?: User[];
}

export interface SmallPublisherIdsOpts extends PublisherIdsOpts {
  selfReferentialId?: SmallPublisherId | null;
  groupId?: SmallPublisherGroupId | null;
  smallPublisherIds?: SmallPublisherId[] | null;
  userIds?: UserId[] | null;
}

export interface SmallPublisherFilter extends PublisherFilter {
  city?: ValueFilter<string, never>;
  sharedColumn?: ValueFilter<string, null>;
  allAuthorNames?: ValueFilter<string, null>;
  selfReferential?: EntityFilter<SmallPublisher, SmallPublisherId, FilterOf<SmallPublisher>, null>;
  group?: EntityFilter<SmallPublisherGroup, SmallPublisherGroupId, FilterOf<SmallPublisherGroup>, null>;
  smallPublishers?: EntityFilter<SmallPublisher, SmallPublisherId, FilterOf<SmallPublisher>, null | undefined>;
  users?: EntityFilter<User, UserId, FilterOf<User>, null | undefined>;
  usersAdminUser?: EntityFilter<AdminUser, AdminUserId, FilterOf<AdminUser>, null>;
}

export interface SmallPublisherGraphQLFilter extends PublisherGraphQLFilter {
  city?: ValueGraphQLFilter<string>;
  sharedColumn?: ValueGraphQLFilter<string>;
  allAuthorNames?: ValueGraphQLFilter<string>;
  selfReferential?: EntityGraphQLFilter<SmallPublisher, SmallPublisherId, GraphQLFilterOf<SmallPublisher>, null>;
  group?: EntityGraphQLFilter<SmallPublisherGroup, SmallPublisherGroupId, GraphQLFilterOf<SmallPublisherGroup>, null>;
  smallPublishers?: EntityGraphQLFilter<
    SmallPublisher,
    SmallPublisherId,
    GraphQLFilterOf<SmallPublisher>,
    null | undefined
  >;
  users?: EntityGraphQLFilter<User, UserId, GraphQLFilterOf<User>, null | undefined>;
  usersAdminUser?: EntityGraphQLFilter<AdminUser, AdminUserId, GraphQLFilterOf<AdminUser>, null>;
}

export interface SmallPublisherOrder extends PublisherOrder {
  city?: OrderBy;
  sharedColumn?: OrderBy;
  allAuthorNames?: OrderBy;
  selfReferential?: SmallPublisherOrder;
  group?: SmallPublisherGroupOrder;
}

export const smallPublisherConfig = new ConfigApi<SmallPublisher, Context>();

smallPublisherConfig.addRule(newRequiredRule("city"));
smallPublisherConfig.addRule("group", mustBeSubType("group"));

declare module "joist-orm" {
  interface TypeMap {
    SmallPublisher: {
      entityType: SmallPublisher;
      filterType: SmallPublisherFilter;
      gqlFilterType: SmallPublisherGraphQLFilter;
      orderType: SmallPublisherOrder;
      optsType: SmallPublisherOpts;
      fieldsType: SmallPublisherFields;
      optIdsType: SmallPublisherIdsOpts;
      factoryOptsType: Parameters<typeof newSmallPublisher>[1];
    };
  }
}

export abstract class SmallPublisherCodegen extends Publisher implements Entity {
  static readonly tagName = "p";
  static readonly metadata: EntityMetadata<SmallPublisher>;

  declare readonly __typeMapKeys: { 0: "Publisher"; 1: "SmallPublisher" };

  constructor(em: EntityManager, opts: SmallPublisherOpts) {
    super(em, opts);
    setOpts(this as any as SmallPublisher, opts, { calledFromConstructor: true });
  }

  get id(): SmallPublisherId {
    return this.idMaybe || failNoIdYet("SmallPublisher");
  }

  get idMaybe(): SmallPublisherId | undefined {
    return toIdOf(smallPublisherMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("SmallPublisher");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get city(): string {
    return getField(this, "city");
  }

  set city(city: string) {
    setField(this, "city", cleanStringValue(city));
  }

  get sharedColumn(): string | undefined {
    return getField(this, "sharedColumn");
  }

  set sharedColumn(sharedColumn: string | undefined) {
    setField(this, "sharedColumn", cleanStringValue(sharedColumn));
  }

  abstract readonly allAuthorNames: ReactiveField<SmallPublisher, string | undefined>;

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
  set(opts: Partial<SmallPublisherOpts>): void {
    setOpts(this as any as SmallPublisher, opts);
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
  setPartial(opts: PartialOrNull<SmallPublisherOpts>): void {
    setOpts(this as any as SmallPublisher, opts as OptsOf<SmallPublisher>, { partial: true });
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
  setDeepPartial(opts: DeepPartialOrNull<SmallPublisher>): Promise<void> {
    return updatePartial(this as any as SmallPublisher, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<SmallPublisher> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<SmallPublisher>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as SmallPublisher, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/docs/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<SmallPublisher>>(hint: H): Promise<Loaded<SmallPublisher, H>>;
  populate<const H extends LoadHint<SmallPublisher>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<SmallPublisher, H>>;
  populate<const H extends LoadHint<SmallPublisher>, V>(hint: H, fn: (p: Loaded<SmallPublisher, H>) => V): Promise<V>;
  populate<const H extends LoadHint<SmallPublisher>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (p: Loaded<SmallPublisher, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<SmallPublisher>, V>(
    hintOrOpts: any,
    fn?: (p: Loaded<SmallPublisher, H>) => V,
  ): Promise<Loaded<SmallPublisher, H> | V> {
    return this.em.populate(this as any as SmallPublisher, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<SmallPublisher>>(hint: H): this is Loaded<SmallPublisher | Publisher, H> {
    return isLoaded(this as any as SmallPublisher, hint);
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
  toJSON<const H extends ToJsonHint<SmallPublisher>>(hint: H): Promise<JsonPayload<SmallPublisher, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get smallPublishers(): Collection<SmallPublisher, SmallPublisher> {
    return this.__data.relations.smallPublishers ??= hasMany(
      this,
      smallPublisherMeta,
      "smallPublishers",
      "selfReferential",
      "self_referential_id",
      undefined,
    );
  }

  get users(): Collection<SmallPublisher, User> {
    return this.__data.relations.users ??= hasMany(
      this,
      userMeta,
      "users",
      "favoritePublisher",
      "favorite_publisher_small_id",
      undefined,
    );
  }

  get selfReferential(): ManyToOneReference<SmallPublisher, SmallPublisher, undefined> {
    return this.__data.relations.selfReferential ??= hasOne(
      this,
      smallPublisherMeta,
      "selfReferential",
      "smallPublishers",
    );
  }

  get group(): ManyToOneReference<SmallPublisher, SmallPublisherGroup, undefined> {
    return this.__data.relations.group ??= hasOne(this, smallPublisherGroupMeta, "group", "publishers");
  }

  get authors(): Collection<SmallPublisher, Author> {
    return super.authors as Collection<SmallPublisher, Author>;
  }

  get bookAdvances(): Collection<SmallPublisher, BookAdvance> {
    return super.bookAdvances as Collection<SmallPublisher, BookAdvance>;
  }

  get comments(): Collection<SmallPublisher, Comment> {
    return super.comments as Collection<SmallPublisher, Comment>;
  }

  get images(): Collection<SmallPublisher, Image> {
    return super.images as Collection<SmallPublisher, Image>;
  }

  get tags(): Collection<SmallPublisher, Tag> {
    return super.tags as Collection<SmallPublisher, Tag>;
  }

  get tasks(): Collection<SmallPublisher, TaskOld> {
    return super.tasks as Collection<SmallPublisher, TaskOld>;
  }
}
