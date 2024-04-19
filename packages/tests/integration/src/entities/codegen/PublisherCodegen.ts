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
  FieldsOf,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  JsonPayload,
  Lens,
  Loaded,
  LoadHint,
  ManyToOneReference,
  NestedJsonHint,
  OptsOf,
  OrderBy,
  PartialOrNull,
  ReactiveField,
  RelationsOf,
  TaggedId,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import {
  Author,
  authorMeta,
  BookAdvance,
  bookAdvanceMeta,
  Comment,
  commentMeta,
  EntityManager,
  Image,
  imageMeta,
  LargePublisher,
  newPublisher,
  Publisher,
  PublisherGroup,
  publisherGroupMeta,
  publisherMeta,
  PublisherSize,
  PublisherSizeDetails,
  PublisherSizes,
  PublisherType,
  PublisherTypeDetails,
  PublisherTypes,
  SmallPublisher,
  Tag,
  tagMeta,
  TaskOld,
  taskOldMeta,
} from "../entities";
import type {
  AuthorId,
  BookAdvanceId,
  CommentId,
  Entity,
  ImageId,
  PublisherGroupId,
  PublisherGroupOrder,
  TagId,
  TaskOldId,
} from "../entities";

export type PublisherId = Flavor<string, Publisher>;

export interface PublisherFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  latitude: { kind: "primitive"; type: number; unique: false; nullable: undefined; derived: false };
  longitude: { kind: "primitive"; type: number; unique: false; nullable: undefined; derived: false };
  hugeNumber: { kind: "primitive"; type: number; unique: false; nullable: undefined; derived: false };
  numberOfBookReviews: { kind: "primitive"; type: number; unique: false; nullable: never; derived: true };
  deletedAt: { kind: "primitive"; type: Date; unique: false; nullable: undefined; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  size: { kind: "enum"; type: PublisherSize; nullable: undefined };
  type: { kind: "enum"; type: PublisherType; nullable: never };
  group: { kind: "m2o"; type: PublisherGroup; nullable: undefined; derived: false };
}

export interface PublisherOpts {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  hugeNumber?: number | null;
  deletedAt?: Date | null;
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
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  size?: ValueFilter<PublisherSize, null>;
  type?: ValueFilter<PublisherType, never>;
  group?: EntityFilter<PublisherGroup, PublisherGroupId, FilterOf<PublisherGroup>, null>;
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
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  size?: ValueGraphQLFilter<PublisherSize>;
  type?: ValueGraphQLFilter<PublisherType>;
  group?: EntityGraphQLFilter<PublisherGroup, PublisherGroupId, GraphQLFilterOf<PublisherGroup>, null>;
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
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  size?: OrderBy;
  type?: OrderBy;
  group?: PublisherGroupOrder;
}

export const publisherConfig = new ConfigApi<Publisher, Context>();

publisherConfig.addRule(newRequiredRule("name"));
publisherConfig.addRule(newRequiredRule("numberOfBookReviews"));
publisherConfig.addRule(newRequiredRule("createdAt"));
publisherConfig.addRule(newRequiredRule("updatedAt"));
publisherConfig.addRule(newRequiredRule("type"));
publisherConfig.setDefault("numberOfBookReviews", 0);
publisherConfig.setDefault("type", PublisherType.Big);

export abstract class PublisherCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "p";
  static readonly metadata: EntityMetadata<Publisher>;

  declare readonly __orm: {
    filterType: PublisherFilter;
    gqlFilterType: PublisherGraphQLFilter;
    orderType: PublisherOrder;
    optsType: PublisherOpts;
    fieldsType: PublisherFields;
    optIdsType: PublisherIdsOpts;
    factoryOptsType: Parameters<typeof newPublisher>[1];
  };

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

  set(opts: Partial<PublisherOpts>): void {
    setOpts(this as any as Publisher, opts);
  }

  setPartial(opts: PartialOrNull<PublisherOpts>): void {
    setOpts(this as any as Publisher, opts as OptsOf<Publisher>, { partial: true });
  }

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

  load<U, V>(fn: (lens: Lens<Publisher>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Publisher, fn, opts);
  }

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

  isLoaded<const H extends LoadHint<Publisher>>(hint: H): this is Loaded<Publisher, H> {
    return isLoaded(this as any as Publisher, hint);
  }

  toJSON(): object;
  toJSON<const H extends NestedJsonHint<Publisher>>(hint: H): Promise<JsonPayload<Publisher, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get authors(): Collection<Publisher, Author> {
    const { relations } = getInstanceData(this);
    return relations.authors ??= hasMany(
      this as any as Publisher,
      authorMeta,
      "authors",
      "publisher",
      "publisher_id",
      undefined,
    );
  }

  get bookAdvances(): Collection<Publisher, BookAdvance> {
    const { relations } = getInstanceData(this);
    return relations.bookAdvances ??= hasMany(
      this as any as Publisher,
      bookAdvanceMeta,
      "bookAdvances",
      "publisher",
      "publisher_id",
      undefined,
    );
  }

  get comments(): Collection<Publisher, Comment> {
    const { relations } = getInstanceData(this);
    return relations.comments ??= hasMany(
      this as any as Publisher,
      commentMeta,
      "comments",
      "parent",
      "parent_publisher_id",
      undefined,
    );
  }

  get images(): Collection<Publisher, Image> {
    const { relations } = getInstanceData(this);
    return relations.images ??= hasMany(
      this as any as Publisher,
      imageMeta,
      "images",
      "publisher",
      "publisher_id",
      undefined,
    );
  }

  get group(): ManyToOneReference<Publisher, PublisherGroup, undefined> {
    const { relations } = getInstanceData(this);
    return relations.group ??= hasOne(this as any as Publisher, publisherGroupMeta, "group", "publishers");
  }

  get tags(): Collection<Publisher, Tag> {
    const { relations } = getInstanceData(this);
    return relations.tags ??= hasManyToMany(
      this as any as Publisher,
      "publishers_to_tags",
      "tags",
      "publisher_id",
      tagMeta,
      "publishers",
      "tag_id",
    );
  }

  get tasks(): Collection<Publisher, TaskOld> {
    const { relations } = getInstanceData(this);
    return relations.tasks ??= hasManyToMany(
      this as any as Publisher,
      "tasks_to_publishers",
      "tasks",
      "publisher_id",
      taskOldMeta,
      "publishers",
      "task_id",
    );
  }
}
