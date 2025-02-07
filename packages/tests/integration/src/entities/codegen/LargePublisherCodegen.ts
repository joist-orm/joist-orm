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
  type AuthorId,
  authorMeta,
  type AuthorOrder,
  BookAdvance,
  Comment,
  Critic,
  type CriticId,
  criticMeta,
  type Entity,
  EntityManager,
  Image,
  LargePublisher,
  largePublisherMeta,
  newLargePublisher,
  Publisher,
  type PublisherFields,
  type PublisherFilter,
  type PublisherGraphQLFilter,
  PublisherGroup,
  type PublisherIdsOpts,
  type PublisherOpts,
  type PublisherOrder,
  Tag,
  TaskOld,
  User,
  type UserId,
  userMeta,
} from "../entities";

export type LargePublisherId = Flavor<string, "Publisher">;

export interface LargePublisherFields extends PublisherFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  sharedColumn: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  country: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  spotlightAuthor: { kind: "m2o"; type: Author; nullable: never; derived: false };
}

export interface LargePublisherOpts extends PublisherOpts {
  sharedColumn?: string | null;
  country?: string | null;
  spotlightAuthor: Author | AuthorId;
  critics?: Critic[];
  users?: User[];
}

export interface LargePublisherIdsOpts extends PublisherIdsOpts {
  spotlightAuthorId?: AuthorId | null;
  criticIds?: CriticId[] | null;
  userIds?: UserId[] | null;
}

export interface LargePublisherFilter extends PublisherFilter {
  sharedColumn?: ValueFilter<string, null>;
  country?: ValueFilter<string, null>;
  spotlightAuthor?: EntityFilter<Author, AuthorId, FilterOf<Author>, never>;
  critics?: EntityFilter<Critic, CriticId, FilterOf<Critic>, null | undefined>;
  users?: EntityFilter<User, UserId, FilterOf<User>, null | undefined>;
  usersAdminUser?: EntityFilter<AdminUser, AdminUserId, FilterOf<AdminUser>, null>;
}

export interface LargePublisherGraphQLFilter extends PublisherGraphQLFilter {
  sharedColumn?: ValueGraphQLFilter<string>;
  country?: ValueGraphQLFilter<string>;
  spotlightAuthor?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, never>;
  critics?: EntityGraphQLFilter<Critic, CriticId, GraphQLFilterOf<Critic>, null | undefined>;
  users?: EntityGraphQLFilter<User, UserId, GraphQLFilterOf<User>, null | undefined>;
  usersAdminUser?: EntityGraphQLFilter<AdminUser, AdminUserId, GraphQLFilterOf<AdminUser>, null>;
}

export interface LargePublisherOrder extends PublisherOrder {
  sharedColumn?: OrderBy;
  country?: OrderBy;
  spotlightAuthor?: AuthorOrder;
}

export interface LargePublisherFactoryExtras {
}

export const largePublisherConfig = new ConfigApi<LargePublisher, Context>();

largePublisherConfig.addRule(newRequiredRule("spotlightAuthor"));
largePublisherConfig.addRule("spotlightAuthor", mustBeSubType("spotlightAuthor"));

declare module "joist-orm" {
  interface TypeMap {
    LargePublisher: {
      entityType: LargePublisher;
      filterType: LargePublisherFilter;
      gqlFilterType: LargePublisherGraphQLFilter;
      orderType: LargePublisherOrder;
      optsType: LargePublisherOpts;
      fieldsType: LargePublisherFields;
      optIdsType: LargePublisherIdsOpts;
      factoryExtrasType: LargePublisherFactoryExtras;
      factoryOptsType: Parameters<typeof newLargePublisher>[1];
    };
  }
}

export abstract class LargePublisherCodegen extends Publisher implements Entity {
  static readonly tagName = "p";
  static readonly metadata: EntityMetadata<LargePublisher>;

  declare readonly __type: { 0: "Publisher"; 1: "LargePublisher" };

  constructor(em: EntityManager, opts: LargePublisherOpts) {
    super(em, opts);
    setOpts(this as any as LargePublisher, opts, { calledFromConstructor: true });
  }

  get id(): LargePublisherId {
    return this.idMaybe || failNoIdYet("LargePublisher");
  }

  get idMaybe(): LargePublisherId | undefined {
    return toIdOf(largePublisherMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("LargePublisher");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get sharedColumn(): string | undefined {
    return getField(this, "sharedColumn");
  }

  set sharedColumn(sharedColumn: string | undefined) {
    setField(this, "sharedColumn", cleanStringValue(sharedColumn));
  }

  get country(): string | undefined {
    return getField(this, "country");
  }

  set country(country: string | undefined) {
    setField(this, "country", cleanStringValue(country));
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
  set(opts: Partial<LargePublisherOpts>): void {
    setOpts(this as any as LargePublisher, opts);
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
  setPartial(opts: PartialOrNull<LargePublisherOpts>): void {
    setOpts(this as any as LargePublisher, opts as OptsOf<LargePublisher>, { partial: true });
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
  setDeepPartial(opts: DeepPartialOrNull<LargePublisher>): Promise<void> {
    return updatePartial(this as any as LargePublisher, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<LargePublisher> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<LargePublisher>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as LargePublisher, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/docs/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<LargePublisher>>(hint: H): Promise<Loaded<LargePublisher, H>>;
  populate<const H extends LoadHint<LargePublisher>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<LargePublisher, H>>;
  populate<const H extends LoadHint<LargePublisher>, V>(hint: H, fn: (p: Loaded<LargePublisher, H>) => V): Promise<V>;
  populate<const H extends LoadHint<LargePublisher>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (p: Loaded<LargePublisher, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<LargePublisher>, V>(
    hintOrOpts: any,
    fn?: (p: Loaded<LargePublisher, H>) => V,
  ): Promise<Loaded<LargePublisher, H> | V> {
    return this.em.populate(this as any as LargePublisher, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<LargePublisher>>(hint: H): this is Loaded<LargePublisher | Publisher, H> {
    return isLoaded(this as any as LargePublisher, hint);
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
  toJSON<const H extends ToJsonHint<LargePublisher>>(hint: H): Promise<JsonPayload<LargePublisher, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get critics(): Collection<LargePublisher, Critic> {
    return this.__data.relations.critics ??= hasMany(
      this,
      criticMeta,
      "critics",
      "favoriteLargePublisher",
      "favorite_large_publisher_id",
      undefined,
    );
  }

  get users(): Collection<LargePublisher, User> {
    return this.__data.relations.users ??= hasMany(
      this,
      userMeta,
      "users",
      "favoritePublisher",
      "favorite_publisher_large_id",
      undefined,
    );
  }

  get spotlightAuthor(): ManyToOneReference<LargePublisher, Author, never> {
    return this.__data.relations.spotlightAuthor ??= hasOne(
      this,
      authorMeta,
      "spotlightAuthor",
      "spotlightAuthorPublishers",
    );
  }

  get authors(): Collection<LargePublisher, Author> {
    return super.authors as Collection<LargePublisher, Author>;
  }

  get bookAdvances(): Collection<LargePublisher, BookAdvance> {
    return super.bookAdvances as Collection<LargePublisher, BookAdvance>;
  }

  get comments(): Collection<LargePublisher, Comment> {
    return super.comments as Collection<LargePublisher, Comment>;
  }

  get images(): Collection<LargePublisher, Image> {
    return super.images as Collection<LargePublisher, Image>;
  }

  get group(): ManyToOneReference<LargePublisher, PublisherGroup, undefined> {
    return super.group as ManyToOneReference<LargePublisher, PublisherGroup, undefined>;
  }

  get tags(): Collection<LargePublisher, Tag> {
    return super.tags as Collection<LargePublisher, Tag>;
  }

  get tasks(): Collection<LargePublisher, TaskOld> {
    return super.tasks as Collection<LargePublisher, TaskOld>;
  }
}
