import {
  BaseEntity,
  Changes,
  Collection,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityOrmField,
  EnumGraphQLFilter,
  fail,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  hasMany,
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
import type { EntityManager } from "./entities";
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
  newPublisher,
  Publisher,
  publisherMeta,
  PublisherSize,
  PublisherType,
  Tag,
  TagId,
  tagMeta,
  TagOrder,
} from "./entities";

export type PublisherId = Flavor<string, "Publisher">;

export interface PublisherFields {
  name: string;
  latitude: number | undefined;
  longitude: number | undefined;
  hugeNumber: number | undefined;
  size: PublisherSize | undefined;
  type: PublisherType;
  tag: Tag | undefined;
}

export interface PublisherOpts {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  hugeNumber?: number | null;
  size?: PublisherSize | null;
  type?: PublisherType;
  tag?: Tag | TagId | null;
  authors?: Author[];
  bookAdvances?: BookAdvance[];
  comments?: Comment[];
  images?: Image[];
}

export interface PublisherIdsOpts {
  tagId?: TagId | null;
  authorIds?: AuthorId[] | null;
  bookAdvanceIds?: BookAdvanceId[] | null;
  commentIds?: CommentId[] | null;
  imageIds?: ImageId[] | null;
}

export interface PublisherFilter {
  id?: ValueFilter<PublisherId, never>;
  name?: ValueFilter<string, never>;
  latitude?: ValueFilter<number, null | undefined>;
  longitude?: ValueFilter<number, null | undefined>;
  hugeNumber?: ValueFilter<number, null | undefined>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  size?: ValueFilter<PublisherSize, null | undefined>;
  type?: ValueFilter<PublisherType, never>;
  tag?: EntityFilter<Tag, TagId, FilterOf<Tag>, null | undefined>;
}

export interface PublisherGraphQLFilter {
  id?: ValueGraphQLFilter<PublisherId>;
  name?: ValueGraphQLFilter<string>;
  latitude?: ValueGraphQLFilter<number>;
  longitude?: ValueGraphQLFilter<number>;
  hugeNumber?: ValueGraphQLFilter<number>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  size?: EnumGraphQLFilter<PublisherSize>;
  type?: EnumGraphQLFilter<PublisherType>;
  tag?: EntityGraphQLFilter<Tag, TagId, GraphQLFilterOf<Tag>, null | undefined>;
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
  tag?: TagOrder;
}

export const publisherConfig = new ConfigApi<Publisher, Context>();

publisherConfig.addRule(newRequiredRule("name"));
publisherConfig.addRule(newRequiredRule("createdAt"));
publisherConfig.addRule(newRequiredRule("updatedAt"));
publisherConfig.addRule(newRequiredRule("type"));

export abstract class PublisherCodegen extends BaseEntity<EntityManager> {
  static defaultValues: object = {
    type: PublisherType.Big,
  };

  readonly __orm!: EntityOrmField & {
    filterType: PublisherFilter;
    gqlFilterType: PublisherGraphQLFilter;
    orderType: PublisherOrder;
    optsType: PublisherOpts;
    fieldsType: PublisherFields;
    optIdsType: PublisherIdsOpts;
    factoryOptsType: Parameters<typeof newPublisher>[1];
  };

  readonly authors: Collection<Publisher, Author> = hasMany(authorMeta, "authors", "publisher", "publisher_id");

  readonly bookAdvances: Collection<Publisher, BookAdvance> = hasMany(
    bookAdvanceMeta,
    "bookAdvances",
    "publisher",
    "publisher_id",
  );

  readonly comments: Collection<Publisher, Comment> = hasMany(commentMeta, "comments", "parent", "parent_publisher_id");

  readonly images: Collection<Publisher, Image> = hasMany(imageMeta, "images", "publisher", "publisher_id");

  readonly tag: ManyToOneReference<Publisher, Tag, undefined> = hasOne(tagMeta, "tag", "publishers");

  constructor(em: EntityManager, opts: PublisherOpts) {
    super(em, publisherMeta, PublisherCodegen.defaultValues, opts);
    setOpts(this as any as Publisher, opts, { calledFromConstructor: true });
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
    setField(this, "name", name);
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
    setOpts(this as any as Publisher, opts);
  }

  setPartial(opts: PartialOrNull<PublisherOpts>): void {
    setOpts(this as any as Publisher, opts as OptsOf<Publisher>, { partial: true });
  }

  get changes(): Changes<Publisher> {
    return newChangesProxy(this as any as Publisher);
  }

  load<U, V>(fn: (lens: Lens<Publisher>) => Lens<U, V>): Promise<V> {
    return loadLens(this as any as Publisher, fn);
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
    return this.em.populate(this as any as Publisher, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<Publisher>>(hint: H): this is Loaded<Publisher, H> {
    return isLoaded(this as any as Publisher, hint);
  }
}
