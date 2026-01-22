import {
  type Changes,
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
import type { Context } from "src/context";
import {
  type AdminUser,
  type AdminUserId,
  type Author,
  type AuthorId,
  type AuthorOrder,
  type BookAdvance,
  type Comment,
  type Critic,
  type CriticId,
  type Entity,
  type Image,
  type LargePublisher,
  largePublisherMeta,
  newLargePublisher,
  Publisher,
  type PublisherFields,
  type PublisherFilter,
  type PublisherGraphQLFilter,
  type PublisherGroup,
  type PublisherIdsOpts,
  type PublisherOpts,
  type PublisherOrder,
  type Tag,
  type TaskOld,
  type User,
  type UserId,
} from "../entities";

export type LargePublisherId = Flavor<string, "Publisher">;

export interface LargePublisherFields extends PublisherFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  sharedColumn: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  country: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  rating: { kind: "primitive"; type: number; unique: false; nullable: never; derived: false };
  spotlightAuthor: { kind: "m2o"; type: Author; nullable: never; derived: false };
  critics: { kind: "o2m"; type: Critic };
  users: { kind: "o2m"; type: User };
}

export interface LargePublisherOpts extends PublisherOpts {
  sharedColumn?: string | null;
  country?: string | null;
  rating: number;
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
  rating?: ValueFilter<number, never>;
  spotlightAuthor?: EntityFilter<Author, AuthorId, FilterOf<Author>, never>;
  critics?: EntityFilter<Critic, CriticId, FilterOf<Critic>, null | undefined>;
  users?: EntityFilter<User, UserId, FilterOf<User>, null | undefined>;
  usersAdminUser?: EntityFilter<AdminUser, AdminUserId, FilterOf<AdminUser>, null>;
}

export interface LargePublisherGraphQLFilter extends PublisherGraphQLFilter {
  sharedColumn?: ValueGraphQLFilter<string>;
  country?: ValueGraphQLFilter<string>;
  rating?: ValueGraphQLFilter<number>;
  spotlightAuthor?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, never>;
  critics?: EntityGraphQLFilter<Critic, CriticId, GraphQLFilterOf<Critic>, null | undefined>;
  users?: EntityGraphQLFilter<User, UserId, GraphQLFilterOf<User>, null | undefined>;
  usersAdminUser?: EntityGraphQLFilter<AdminUser, AdminUserId, GraphQLFilterOf<AdminUser>, null>;
}

export interface LargePublisherOrder extends PublisherOrder {
  sharedColumn?: OrderBy;
  country?: OrderBy;
  rating?: OrderBy;
  spotlightAuthor?: AuthorOrder;
}

export interface LargePublisherFactoryExtras {
}

export const largePublisherConfig = new ConfigApi<LargePublisher, Context>();

largePublisherConfig.addRule(newRequiredRule("rating"));
largePublisherConfig.addRule(newRequiredRule("spotlightAuthor"));

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

  readonly critics: Collection<LargePublisher, Critic> = hasMany();
  readonly users: Collection<LargePublisher, User> = hasMany();
  readonly spotlightAuthor: ManyToOneReference<LargePublisher, Author, never> = hasOne();
  declare readonly authors: Collection<LargePublisher, Author>;
  declare readonly bookAdvances: Collection<LargePublisher, BookAdvance>;
  declare readonly comments: Collection<LargePublisher, Comment>;
  declare readonly images: Collection<LargePublisher, Image>;
  declare readonly group: ManyToOneReference<LargePublisher, PublisherGroup, undefined>;
  declare readonly tags: Collection<LargePublisher, Tag>;
  declare readonly tasks: Collection<LargePublisher, TaskOld>;

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
    setField(this, "sharedColumn", sharedColumn);
  }

  get country(): string | undefined {
    return getField(this, "country");
  }

  set country(country: string | undefined) {
    setField(this, "country", country);
  }

  get rating(): number {
    return getField(this, "rating");
  }

  set rating(rating: number) {
    setField(this, "rating", rating);
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
  setDeepPartial(opts: DeepPartialOrNull<LargePublisher>): Promise<void> {
    return updatePartial(this as any as LargePublisher, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<LargePublisher> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<LargePublisher>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as LargePublisher, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
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
   * @see {@link https://joist-orm.io/advanced/json-payloads | Json Payloads} on the Joist docs
   */
  toJSON(): object;
  toJSON<const H extends ToJsonHint<LargePublisher>>(hint: H): Promise<JsonPayload<LargePublisher, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }
}
