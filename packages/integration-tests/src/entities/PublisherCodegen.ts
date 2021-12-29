import {
  BaseEntity,
  Changes,
  ConfigApi,
  EntityManager,
  EnumGraphQLFilter,
  Flavor,
  getEm,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  OptsOf,
  OrderBy,
  OrmApi,
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
  Image,
  ImageId,
  imageMeta,
  newPublisher,
  Publisher,
  publisherMeta,
  PublisherSize,
  PublisherSizeDetails,
  PublisherSizes,
  PublisherType,
  PublisherTypeDetails,
  PublisherTypes,
} from "./entities";

export type PublisherId = Flavor<string, "Publisher">;

export interface PublisherOpts {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  hugeNumber?: number | null;
  size?: PublisherSize | null;
  type?: PublisherType | null;
  authors?: Author[];
  bookAdvances?: BookAdvance[];
  images?: Image[];
}

export interface PublisherIdsOpts {
  authorIds?: AuthorId[] | null;
  bookAdvanceIds?: BookAdvanceId[] | null;
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
  type?: ValueFilter<PublisherType, null | undefined>;
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
}

export const publisherDefaultValues = { type: PublisherType.Small };

export const publisherConfig = new ConfigApi<Publisher, Context>();

publisherConfig.addRule(newRequiredRule("name"));
publisherConfig.addRule(newRequiredRule("createdAt"));
publisherConfig.addRule(newRequiredRule("updatedAt"));

export abstract class PublisherCodegen extends BaseEntity {
  readonly __types: {
    filterType: PublisherFilter;
    gqlFilterType: PublisherGraphQLFilter;
    orderType: PublisherOrder;
    optsType: PublisherOpts;
    optIdsType: PublisherIdsOpts;
    factoryOptsType: Parameters<typeof newPublisher>[1];
  } = null!;
  protected readonly orm = new OrmApi(this as any as Publisher);

  readonly authors = this.orm.hasMany(authorMeta, "authors", "publisher", "publisher_id");

  readonly bookAdvances = this.orm.hasMany(bookAdvanceMeta, "bookAdvances", "publisher", "publisher_id");

  readonly images = this.orm.hasMany(imageMeta, "images", "publisher", "publisher_id");

  constructor(em: EntityManager, opts: PublisherOpts) {
    super(em, publisherMeta, publisherDefaultValues, opts);
    setOpts(this as any as Publisher, opts, { calledFromConstructor: true });
  }

  get id(): PublisherId | undefined {
    return this.__orm.data["id"];
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

  get type(): PublisherType | undefined {
    return this.__orm.data["type"];
  }

  get typeDetails(): PublisherTypeDetails | undefined {
    return this.type ? PublisherTypes.getByCode(this.type) : undefined;
  }

  set type(type: PublisherType | undefined) {
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

  async load<U, V>(fn: (lens: Lens<Publisher>) => Lens<U, V>): Promise<V> {
    return loadLens(this as any as Publisher, fn);
  }

  async populate<H extends LoadHint<Publisher>>(hint: H): Promise<Loaded<Publisher, H>> {
    return getEm(this).populate(this as any as Publisher, hint);
  }
}
