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
  type FieldsOf,
  type FilterOf,
  type Flavor,
  getField,
  type GraphQLFilterOf,
  hasMany,
  hasManyToMany,
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
  type ReactiveField,
  type ReactiveReference,
  type RelationsOf,
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
  Author,
  type AuthorId,
  authorMeta,
  type AuthorOrder,
  BookAdvance,
  type BookAdvanceId,
  bookAdvanceMeta,
  Comment,
  type CommentId,
  commentMeta,
  type Entity,
  EntityManager,
  Image,
  type ImageId,
  imageMeta,
  LargePublisher,
  newPublisher,
  Publisher,
  PublisherGroup,
  type PublisherGroupId,
  publisherGroupMeta,
  type PublisherGroupOrder,
  publisherMeta,
  PublisherSize,
  PublisherSizeDetails,
  PublisherSizes,
  PublisherType,
  PublisherTypeDetails,
  PublisherTypes,
  SmallPublisher,
  SmallPublisherGroup,
  type SmallPublisherGroupId,
  Tag,
  type TagId,
  tagMeta,
  TaskOld,
  type TaskOldId,
  taskOldMeta,
} from "../entities";

export type PublisherId = Flavor<string, "Publisher">;

export interface PublisherFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  latitude: { kind: "primitive"; type: number; unique: false; nullable: undefined; derived: false };
  longitude: { kind: "primitive"; type: number; unique: false; nullable: undefined; derived: false };
  hugeNumber: { kind: "primitive"; type: number; unique: false; nullable: undefined; derived: false };
  numberOfBookReviews: { kind: "primitive"; type: number; unique: false; nullable: never; derived: true };
  deletedAt: { kind: "primitive"; type: Date; unique: false; nullable: undefined; derived: false };
  titlesOfFavoriteBooks: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: true };
  baseSyncDefault: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  baseAsyncDefault: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  size: { kind: "enum"; type: PublisherSize; nullable: undefined };
  type: { kind: "enum"; type: PublisherType; nullable: never };
  favoriteAuthor: { kind: "m2o"; type: Author; nullable: undefined; derived: true };
  group: { kind: "m2o"; type: PublisherGroup; nullable: undefined; derived: false };
}

export interface PublisherOpts {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  hugeNumber?: number | null;
  deletedAt?: Date | null;
  baseSyncDefault?: string;
  baseAsyncDefault?: string;
  size?: PublisherSize | null;
  type?: PublisherType;
  group?: PublisherGroup | PublisherGroupId | null;
  authors?: Author[];
  bookAdvances?: BookAdvance[];
  comments?: Comment[];
  images?: Image[];
  tags?: Tag[];
  tasks?: TaskOld[];
}

export interface PublisherIdsOpts {
  groupId?: PublisherGroupId | null;
  authorIds?: AuthorId[] | null;
  bookAdvanceIds?: BookAdvanceId[] | null;
  commentIds?: CommentId[] | null;
  imageIds?: ImageId[] | null;
  tagIds?: TagId[] | null;
  taskIds?: TaskOldId[] | null;
}

export interface PublisherFilter {
  id?: ValueFilter<PublisherId, never> | null;
  name?: ValueFilter<string, never>;
  latitude?: ValueFilter<number, null>;
  longitude?: ValueFilter<number, null>;
  hugeNumber?: ValueFilter<number, null>;
  numberOfBookReviews?: ValueFilter<number, never>;
  deletedAt?: ValueFilter<Date, null>;
  titlesOfFavoriteBooks?: ValueFilter<string, null>;
  baseSyncDefault?: ValueFilter<string, never>;
  baseAsyncDefault?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  size?: ValueFilter<PublisherSize, null>;
  type?: ValueFilter<PublisherType, never>;
  favoriteAuthor?: EntityFilter<Author, AuthorId, FilterOf<Author>, null>;
  group?: EntityFilter<PublisherGroup, PublisherGroupId, FilterOf<PublisherGroup>, null>;
  groupSmallPublisherGroup?: EntityFilter<
    SmallPublisherGroup,
    SmallPublisherGroupId,
    FilterOf<SmallPublisherGroup>,
    null
  >;
  authors?: EntityFilter<Author, AuthorId, FilterOf<Author>, null | undefined>;
  bookAdvances?: EntityFilter<BookAdvance, BookAdvanceId, FilterOf<BookAdvance>, null | undefined>;
  comments?: EntityFilter<Comment, CommentId, FilterOf<Comment>, null | undefined>;
  images?: EntityFilter<Image, ImageId, FilterOf<Image>, null | undefined>;
  tags?: EntityFilter<Tag, TagId, FilterOf<Tag>, null | undefined>;
  tasks?: EntityFilter<TaskOld, TaskOldId, FilterOf<TaskOld>, null | undefined>;
}

export interface PublisherGraphQLFilter {
  id?: ValueGraphQLFilter<PublisherId>;
  name?: ValueGraphQLFilter<string>;
  latitude?: ValueGraphQLFilter<number>;
  longitude?: ValueGraphQLFilter<number>;
  hugeNumber?: ValueGraphQLFilter<number>;
  numberOfBookReviews?: ValueGraphQLFilter<number>;
  deletedAt?: ValueGraphQLFilter<Date>;
  titlesOfFavoriteBooks?: ValueGraphQLFilter<string>;
  baseSyncDefault?: ValueGraphQLFilter<string>;
  baseAsyncDefault?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  size?: ValueGraphQLFilter<PublisherSize>;
  type?: ValueGraphQLFilter<PublisherType>;
  favoriteAuthor?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null>;
  group?: EntityGraphQLFilter<PublisherGroup, PublisherGroupId, GraphQLFilterOf<PublisherGroup>, null>;
  groupSmallPublisherGroup?: EntityGraphQLFilter<
    SmallPublisherGroup,
    SmallPublisherGroupId,
    GraphQLFilterOf<SmallPublisherGroup>,
    null
  >;
  authors?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null | undefined>;
  bookAdvances?: EntityGraphQLFilter<BookAdvance, BookAdvanceId, GraphQLFilterOf<BookAdvance>, null | undefined>;
  comments?: EntityGraphQLFilter<Comment, CommentId, GraphQLFilterOf<Comment>, null | undefined>;
  images?: EntityGraphQLFilter<Image, ImageId, GraphQLFilterOf<Image>, null | undefined>;
  tags?: EntityGraphQLFilter<Tag, TagId, GraphQLFilterOf<Tag>, null | undefined>;
  tasks?: EntityGraphQLFilter<TaskOld, TaskOldId, GraphQLFilterOf<TaskOld>, null | undefined>;
}

export interface PublisherOrder {
  id?: OrderBy;
  name?: OrderBy;
  latitude?: OrderBy;
  longitude?: OrderBy;
  hugeNumber?: OrderBy;
  numberOfBookReviews?: OrderBy;
  deletedAt?: OrderBy;
  titlesOfFavoriteBooks?: OrderBy;
  baseSyncDefault?: OrderBy;
  baseAsyncDefault?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  size?: OrderBy;
  type?: OrderBy;
  favoriteAuthor?: AuthorOrder;
  group?: PublisherGroupOrder;
}

export const publisherConfig = new ConfigApi<Publisher, Context>();

publisherConfig.addRule(newRequiredRule("name"));
publisherConfig.addRule(newRequiredRule("numberOfBookReviews"));
publisherConfig.addRule(newRequiredRule("baseSyncDefault"));
publisherConfig.addRule(newRequiredRule("baseAsyncDefault"));
publisherConfig.addRule(newRequiredRule("createdAt"));
publisherConfig.addRule(newRequiredRule("updatedAt"));
publisherConfig.addRule(newRequiredRule("type"));
publisherConfig.setDefault("numberOfBookReviews", 0);
publisherConfig.setDefault("type", PublisherType.Big);

declare module "joist-orm" {
  interface TypeMap {
    Publisher: {
      entityType: Publisher;
      filterType: PublisherFilter;
      gqlFilterType: PublisherGraphQLFilter;
      orderType: PublisherOrder;
      optsType: PublisherOpts;
      fieldsType: PublisherFields;
      optIdsType: PublisherIdsOpts;
      factoryOptsType: Parameters<typeof newPublisher>[1];
    };
  }
}

export abstract class PublisherCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "p";
  static readonly metadata: EntityMetadata<Publisher>;

  declare readonly __type: { 0: "Publisher" };

  abstract readonly favoriteAuthor: ReactiveReference<Publisher, Author, undefined>;

  constructor(em: EntityManager, opts: PublisherOpts) {
    super(em, opts);
    setOpts(this as any as Publisher, opts, { calledFromConstructor: true });

    if (this.constructor === Publisher && !(em as any).fakeInstance) {
      throw new Error(`Publisher ${typeof opts === "string" ? opts : ""} must be instantiated via a subtype`);
    }
  }

  get id(): PublisherId {
    return this.idMaybe || failNoIdYet("Publisher");
  }

  get idMaybe(): PublisherId | undefined {
    return toIdOf(publisherMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("Publisher");
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

  get latitude(): number | undefined {
    return getField(this, "latitude");
  }

  set latitude(latitude: number | undefined) {
    setField(this, "latitude", latitude);
  }

  get longitude(): number | undefined {
    return getField(this, "longitude");
  }

  set longitude(longitude: number | undefined) {
    setField(this, "longitude", longitude);
  }

  get hugeNumber(): number | undefined {
    return getField(this, "hugeNumber");
  }

  set hugeNumber(hugeNumber: number | undefined) {
    setField(this, "hugeNumber", hugeNumber);
  }

  abstract readonly numberOfBookReviews: ReactiveField<Publisher, number>;

  get deletedAt(): Date | undefined {
    return getField(this, "deletedAt");
  }

  set deletedAt(deletedAt: Date | undefined) {
    setField(this, "deletedAt", deletedAt);
  }

  abstract readonly titlesOfFavoriteBooks: ReactiveField<Publisher, string | undefined>;

  get baseSyncDefault(): string {
    return getField(this, "baseSyncDefault");
  }

  set baseSyncDefault(baseSyncDefault: string) {
    setField(this, "baseSyncDefault", cleanStringValue(baseSyncDefault));
  }

  get baseAsyncDefault(): string {
    return getField(this, "baseAsyncDefault");
  }

  set baseAsyncDefault(baseAsyncDefault: string) {
    setField(this, "baseAsyncDefault", cleanStringValue(baseAsyncDefault));
  }

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  get size(): PublisherSize | undefined {
    return getField(this, "size");
  }

  get sizeDetails(): PublisherSizeDetails | undefined {
    return this.size ? PublisherSizes.getByCode(this.size) : undefined;
  }

  set size(size: PublisherSize | undefined) {
    setField(this, "size", size);
  }

  get isSizeSmall(): boolean {
    return getField(this, "size") === PublisherSize.Small;
  }

  get isSizeLarge(): boolean {
    return getField(this, "size") === PublisherSize.Large;
  }

  get type(): PublisherType {
    return getField(this, "type");
  }

  get typeDetails(): PublisherTypeDetails {
    return PublisherTypes.getByCode(this.type);
  }

  set type(type: PublisherType) {
    setField(this, "type", type);
  }

  get isTypeSmall(): boolean {
    return getField(this, "type") === PublisherType.Small;
  }

  get isTypeBig(): boolean {
    return getField(this, "type") === PublisherType.Big;
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
  set(opts: Partial<PublisherOpts>): void {
    setOpts(this as any as Publisher, opts);
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
  setPartial(opts: PartialOrNull<PublisherOpts>): void {
    setOpts(this as any as Publisher, opts as OptsOf<Publisher>, { partial: true });
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
  setDeepPartial(opts: DeepPartialOrNull<Publisher>): Promise<void> {
    return updatePartial(this as any as Publisher, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<
    Publisher,
    | keyof (FieldsOf<Publisher> & RelationsOf<Publisher>)
    | keyof (FieldsOf<LargePublisher> & RelationsOf<LargePublisher>)
    | keyof (FieldsOf<SmallPublisher> & RelationsOf<SmallPublisher>)
  > {
    return newChangesProxy(this) as any;
  }

  get isSoftDeletedEntity(): boolean {
    return this.deletedAt !== undefined;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<Publisher>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Publisher, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/docs/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<Publisher>>(hint: H): Promise<Loaded<Publisher, H>>;
  populate<const H extends LoadHint<Publisher>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<Publisher, H>>;
  populate<const H extends LoadHint<Publisher>, V>(hint: H, fn: (p: Loaded<Publisher, H>) => V): Promise<V>;
  populate<const H extends LoadHint<Publisher>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (p: Loaded<Publisher, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<Publisher>, V>(
    hintOrOpts: any,
    fn?: (p: Loaded<Publisher, H>) => V,
  ): Promise<Loaded<Publisher, H> | V> {
    return this.em.populate(this as any as Publisher, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<Publisher>>(hint: H): this is Loaded<Publisher, H> {
    return isLoaded(this as any as Publisher, hint);
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
  toJSON<const H extends ToJsonHint<Publisher>>(hint: H): Promise<JsonPayload<Publisher, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get authors(): Collection<Publisher, Author> {
    return this.__data.relations.authors ??= hasMany(this, authorMeta, "authors", "publisher", "publisher_id", {
      "field": "numberOfBooks",
      "direction": "ASC",
    });
  }

  get bookAdvances(): Collection<Publisher, BookAdvance> {
    return this.__data.relations.bookAdvances ??= hasMany(
      this,
      bookAdvanceMeta,
      "bookAdvances",
      "publisher",
      "publisher_id",
      undefined,
    );
  }

  get comments(): Collection<Publisher, Comment> {
    return this.__data.relations.comments ??= hasMany(
      this,
      commentMeta,
      "comments",
      "parent",
      "parent_publisher_id",
      undefined,
    );
  }

  get images(): Collection<Publisher, Image> {
    return this.__data.relations.images ??= hasMany(this, imageMeta, "images", "publisher", "publisher_id", undefined);
  }

  get group(): ManyToOneReference<Publisher, PublisherGroup, undefined> {
    return this.__data.relations.group ??= hasOne(this, publisherGroupMeta, "group", "publishers");
  }

  get tags(): Collection<Publisher, Tag> {
    return this.__data.relations.tags ??= hasManyToMany(
      this,
      "publishers_to_tags",
      "tags",
      "publisher_id",
      tagMeta,
      "publishers",
      "tag_id",
    );
  }

  get tasks(): Collection<Publisher, TaskOld> {
    return this.__data.relations.tasks ??= hasManyToMany(
      this,
      "tasks_to_publishers",
      "tasks",
      "publisher_id",
      taskOldMeta,
      "publishers",
      "task_id",
    );
  }
}
