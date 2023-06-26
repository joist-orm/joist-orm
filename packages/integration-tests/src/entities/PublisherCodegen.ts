import {
  BaseEntity,
  Changes,
  cleanStringValue,
  Collection,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  EntityOrmField,
  fail,
  FieldsOf,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  hasMany,
  hasManyToMany,
  hasOne,
  isLoaded,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  ManyToOneReference,
  newChangesProxy,
  newRequiredRule,
  OptsOf,
  OrderBy,
  PartialOrNull,
  setField,
  setOpts,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import {
  Author,
  AuthorId,
  authorMeta,
  BookAdvance,
  BookAdvanceId,
  bookAdvanceMeta,
  Comment,
  CommentId,
  commentMeta,
  Image,
  ImageId,
  imageMeta,
  LargePublisher,
  newPublisher,
  Publisher,
  PublisherGroup,
  PublisherGroupId,
  publisherGroupMeta,
  PublisherGroupOrder,
  publisherMeta,
  PublisherSize,
  PublisherSizeDetails,
  PublisherSizes,
  PublisherType,
  PublisherTypeDetails,
  PublisherTypes,
  SmallPublisher,
  Tag,
  TagId,
  tagMeta,
} from "./entities";
import type { EntityManager } from "./entities";
export type PublisherId = Flavor<string, "Publisher">;
export interface PublisherFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: false };
  name: { kind: "primitive"; type: string; unique: false; nullable: never };
  latitude: { kind: "primitive"; type: number; unique: false; nullable: undefined };
  longitude: { kind: "primitive"; type: number; unique: false; nullable: undefined };
  hugeNumber: { kind: "primitive"; type: number; unique: false; nullable: undefined };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  size: { kind: "enum"; type: PublisherSize; nullable: undefined };
  type: { kind: "enum"; type: PublisherType; nullable: never };
  group: { kind: "m2o"; type: PublisherGroup; nullable: undefined };
}
export interface PublisherOpts {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  hugeNumber?: number | null;
  size?: PublisherSize | null;
  type?: PublisherType;
  group?: PublisherGroup | PublisherGroupId | null;
  authors?: Author[];
  bookAdvances?: BookAdvance[];
  comments?: Comment[];
  images?: Image[];
  tags?: Tag[];
}
export interface PublisherIdsOpts {
  groupId?: PublisherGroupId | null;
  authorIds?: AuthorId[] | null;
  bookAdvanceIds?: BookAdvanceId[] | null;
  commentIds?: CommentId[] | null;
  imageIds?: ImageId[] | null;
  tagIds?: TagId[] | null;
}
export interface PublisherFilter {
  id?: ValueFilter<PublisherId, never>;
  name?: ValueFilter<string, never>;
  latitude?: ValueFilter<number, null>;
  longitude?: ValueFilter<number, null>;
  hugeNumber?: ValueFilter<number, null>;
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
}
export interface PublisherGraphQLFilter {
  id?: ValueGraphQLFilter<PublisherId>;
  name?: ValueGraphQLFilter<string>;
  latitude?: ValueGraphQLFilter<number>;
  longitude?: ValueGraphQLFilter<number>;
  hugeNumber?: ValueGraphQLFilter<number>;
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
}
export interface PublisherOrder {
  id?: OrderBy;
  name?: OrderBy;
  latitude?: OrderBy;
  longitude?: OrderBy;
  hugeNumber?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  size?: OrderBy;
  type?: OrderBy;
  group?: PublisherGroupOrder;
}
export const publisherConfig = new ConfigApi<Publisher, Context>();
publisherConfig.addRule(newRequiredRule("name"));
publisherConfig.addRule(newRequiredRule("createdAt"));
publisherConfig.addRule(newRequiredRule("updatedAt"));
publisherConfig.addRule(newRequiredRule("type"));
export abstract class PublisherCodegen extends BaseEntity<EntityManager> {
  static defaultValues: object = { type: PublisherType.Big };
  static readonly tagName = "p";
  static readonly metadata: EntityMetadata<Publisher>;
  declare readonly __orm: EntityOrmField & {
    filterType: PublisherFilter;
    gqlFilterType: PublisherGraphQLFilter;
    orderType: PublisherOrder;
    optsType: PublisherOpts;
    fieldsType: PublisherFields;
    optIdsType: PublisherIdsOpts;
    factoryOptsType: Parameters<typeof newPublisher>[1];
  };
  readonly authors: Collection<Publisher, Author> = hasMany(
    authorMeta,
    "authors",
    "publisher",
    "publisher_id",
    undefined,
  );
  readonly bookAdvances: Collection<Publisher, BookAdvance> = hasMany(
    bookAdvanceMeta,
    "bookAdvances",
    "publisher",
    "publisher_id",
    undefined,
  );
  readonly comments: Collection<Publisher, Comment> = hasMany(
    commentMeta,
    "comments",
    "parent",
    "parent_publisher_id",
    undefined,
  );
  readonly images: Collection<Publisher, Image> = hasMany(imageMeta, "images", "publisher", "publisher_id", undefined);
  readonly group: ManyToOneReference<Publisher, PublisherGroup, undefined> = hasOne(
    publisherGroupMeta,
    "group",
    "publishers",
  );
  readonly tags: Collection<Publisher, Tag> = hasManyToMany(
    "publishers_to_tags",
    "tags",
    "publisher_id",
    tagMeta,
    "publishers",
    "tag_id",
  );
  constructor(em: EntityManager, opts: PublisherOpts) {
    if (arguments.length === 4) {
      // @ts-ignore
      super(em, arguments[1], { ...arguments[2], ...PublisherCodegen.defaultValues }, arguments[3]);
    } else {
      super(em, publisherMeta, PublisherCodegen.defaultValues, opts);
      setOpts((this as any) as Publisher, opts, { calledFromConstructor: true });
    }
    if (this.constructor === Publisher && !(em as any).fakeInstance) {
      throw new Error(`Publisher ${typeof opts === "string" ? opts : ""} must be instantiated via a subtype`);
    }
  }
  get id(): PublisherId | undefined {
    return this.idTagged;
  }
  get idOrFail(): PublisherId {
    return this.id || fail("Publisher has no id yet");
  }
  get idTagged(): PublisherId | undefined {
    return this.__orm.data["id"];
  }
  get idTaggedOrFail(): PublisherId {
    return this.idTagged || fail("Publisher has no id tagged yet");
  }
  get name(): string {
    return this.__orm.data["name"];
  }
  set name(name: string) {
    setField(this, "name", cleanStringValue(name));
  }
  get latitude(): number | undefined {
    return this.__orm.data["latitude"];
  }
  set latitude(latitude: number | undefined) {
    setField(this, "latitude", latitude);
  }
  get longitude(): number | undefined {
    return this.__orm.data["longitude"];
  }
  set longitude(longitude: number | undefined) {
    setField(this, "longitude", longitude);
  }
  get hugeNumber(): number | undefined {
    return this.__orm.data["hugeNumber"];
  }
  set hugeNumber(hugeNumber: number | undefined) {
    setField(this, "hugeNumber", hugeNumber);
  }
  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }
  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }
  get size(): PublisherSize | undefined {
    return this.__orm.data["size"];
  }
  get sizeDetails(): PublisherSizeDetails | undefined {
    return this.size ? PublisherSizes.getByCode(this.size) : undefined;
  }
  set size(size: PublisherSize | undefined) {
    setField(this, "size", size);
  }
  get isSizeSmall(): boolean {
    return this.__orm.data["size"] === PublisherSize.Small;
  }
  get isSizeLarge(): boolean {
    return this.__orm.data["size"] === PublisherSize.Large;
  }
  get type(): PublisherType {
    return this.__orm.data["type"];
  }
  get typeDetails(): PublisherTypeDetails {
    return PublisherTypes.getByCode(this.type);
  }
  set type(type: PublisherType) {
    setField(this, "type", type);
  }
  get isTypeSmall(): boolean {
    return this.__orm.data["type"] === PublisherType.Small;
  }
  get isTypeBig(): boolean {
    return this.__orm.data["type"] === PublisherType.Big;
  }
  set(opts: Partial<PublisherOpts>): void {
    setOpts((this as any) as Publisher, opts);
  }
  setPartial(opts: PartialOrNull<PublisherOpts>): void {
    setOpts((this as any) as Publisher, opts as OptsOf<Publisher>, { partial: true });
  }
  get changes(): Changes<
    Publisher,
    keyof FieldsOf<Publisher> | keyof FieldsOf<LargePublisher> | keyof FieldsOf<SmallPublisher>
  > {
    return (newChangesProxy(this) as any);
  }
  load<U, V>(fn: (lens: Lens<Publisher>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens((this as any) as Publisher, fn, opts);
  }
  populate<H extends LoadHint<Publisher>>(hint: H): Promise<Loaded<Publisher, H>>;
  populate<H extends LoadHint<Publisher>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Publisher, H>>;
  populate<H extends LoadHint<Publisher>, V>(hint: H, fn: (p: Loaded<Publisher, H>) => V): Promise<V>;
  populate<H extends LoadHint<Publisher>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (p: Loaded<Publisher, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<Publisher>, V>(
    hintOrOpts: any,
    fn?: (p: Loaded<Publisher, H>) => V,
  ): Promise<Loaded<Publisher, H> | V> {
    return this.em.populate((this as any) as Publisher, hintOrOpts, fn);
  }
  isLoaded<H extends LoadHint<Publisher>>(hint: H): this is Loaded<Publisher, H> {
    return isLoaded((this as any) as Publisher, hint);
  }
}
