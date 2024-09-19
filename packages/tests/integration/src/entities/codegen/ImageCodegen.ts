import {
  BaseEntity,
  type Changes,
  cleanStringValue,
  ConfigApi,
  type EntityFilter,
  type EntityGraphQLFilter,
  type EntityMetadata,
  failNoIdYet,
  type FilterOf,
  type Flavor,
  getField,
  type GraphQLFilterOf,
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
  type ValueFilter,
  type ValueGraphQLFilter,
} from "joist-orm";
import { type Context } from "src/context";
import {
  Author,
  type AuthorId,
  authorMeta,
  type AuthorOrder,
  Book,
  type BookId,
  bookMeta,
  type BookOrder,
  type Entity,
  EntityManager,
  Image,
  imageMeta,
  ImageType,
  ImageTypeDetails,
  ImageTypes,
  LargePublisher,
  type LargePublisherId,
  newImage,
  Publisher,
  type PublisherId,
  publisherMeta,
  type PublisherOrder,
  SmallPublisher,
  type SmallPublisherId,
} from "../entities";

export type ImageId = Flavor<string, Image>;

export interface ImageFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  fileName: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  type: { kind: "enum"; type: ImageType; nullable: never };
  author: { kind: "m2o"; type: Author; nullable: undefined; derived: false };
  book: { kind: "m2o"; type: Book; nullable: undefined; derived: false };
  publisher: { kind: "m2o"; type: Publisher; nullable: undefined; derived: false };
}

export interface ImageOpts {
  fileName: string;
  type: ImageType;
  author?: Author | AuthorId | null;
  book?: Book | BookId | null;
  publisher?: Publisher | PublisherId | null;
}

export interface ImageIdsOpts {
  authorId?: AuthorId | null;
  bookId?: BookId | null;
  publisherId?: PublisherId | null;
}

export interface ImageFilter {
  id?: ValueFilter<ImageId, never> | null;
  fileName?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  type?: ValueFilter<ImageType, never>;
  author?: EntityFilter<Author, AuthorId, FilterOf<Author>, null>;
  book?: EntityFilter<Book, BookId, FilterOf<Book>, null>;
  publisher?: EntityFilter<Publisher, PublisherId, FilterOf<Publisher>, null>;
  publisherLargePublisher?: EntityFilter<LargePublisher, LargePublisherId, FilterOf<LargePublisher>, null>;
  publisherSmallPublisher?: EntityFilter<SmallPublisher, SmallPublisherId, FilterOf<SmallPublisher>, null>;
}

export interface ImageGraphQLFilter {
  id?: ValueGraphQLFilter<ImageId>;
  fileName?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  type?: ValueGraphQLFilter<ImageType>;
  author?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null>;
  book?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>, null>;
  publisher?: EntityGraphQLFilter<Publisher, PublisherId, GraphQLFilterOf<Publisher>, null>;
  publisherLargePublisher?: EntityGraphQLFilter<
    LargePublisher,
    LargePublisherId,
    GraphQLFilterOf<LargePublisher>,
    null
  >;
  publisherSmallPublisher?: EntityGraphQLFilter<
    SmallPublisher,
    SmallPublisherId,
    GraphQLFilterOf<SmallPublisher>,
    null
  >;
}

export interface ImageOrder {
  id?: OrderBy;
  fileName?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  type?: OrderBy;
  author?: AuthorOrder;
  book?: BookOrder;
  publisher?: PublisherOrder;
}

export const imageConfig = new ConfigApi<Image, Context>();

imageConfig.addRule(newRequiredRule("fileName"));
imageConfig.addRule(newRequiredRule("createdAt"));
imageConfig.addRule(newRequiredRule("updatedAt"));
imageConfig.addRule(newRequiredRule("type"));

export abstract class ImageCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "i";
  static readonly metadata: EntityMetadata<Image>;

  declare readonly __orm: {
    entityType: Image;
    filterType: ImageFilter;
    gqlFilterType: ImageGraphQLFilter;
    orderType: ImageOrder;
    optsType: ImageOpts;
    fieldsType: ImageFields;
    optIdsType: ImageIdsOpts;
    factoryOptsType: Parameters<typeof newImage>[1];
  };

  constructor(em: EntityManager, opts: ImageOpts) {
    super(em, opts);
    setOpts(this as any as Image, opts, { calledFromConstructor: true });
  }

  get id(): ImageId {
    return this.idMaybe || failNoIdYet("Image");
  }

  get idMaybe(): ImageId | undefined {
    return toIdOf(imageMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("Image");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get fileName(): string {
    return getField(this, "fileName");
  }

  set fileName(fileName: string) {
    setField(this, "fileName", cleanStringValue(fileName));
  }

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  get type(): ImageType {
    return getField(this, "type");
  }

  get typeDetails(): ImageTypeDetails {
    return ImageTypes.getByCode(this.type);
  }

  set type(type: ImageType) {
    setField(this, "type", type);
  }

  get isBookImage(): boolean {
    return getField(this, "type") === ImageType.BookImage;
  }

  get isAuthorImage(): boolean {
    return getField(this, "type") === ImageType.AuthorImage;
  }

  get isPublisherImage(): boolean {
    return getField(this, "type") === ImageType.PublisherImage;
  }

  set(opts: Partial<ImageOpts>): void {
    setOpts(this as any as Image, opts);
  }

  setPartial(opts: PartialOrNull<ImageOpts>): void {
    setOpts(this as any as Image, opts as OptsOf<Image>, { partial: true });
  }

  get changes(): Changes<Image> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<Image>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Image, fn, opts);
  }

  populate<const H extends LoadHint<Image>>(hint: H): Promise<Loaded<Image, H>>;
  populate<const H extends LoadHint<Image>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Image, H>>;
  populate<const H extends LoadHint<Image>, V>(hint: H, fn: (i: Loaded<Image, H>) => V): Promise<V>;
  populate<const H extends LoadHint<Image>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (i: Loaded<Image, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<Image>, V>(
    hintOrOpts: any,
    fn?: (i: Loaded<Image, H>) => V,
  ): Promise<Loaded<Image, H> | V> {
    return this.em.populate(this as any as Image, hintOrOpts, fn);
  }

  isLoaded<const H extends LoadHint<Image>>(hint: H): this is Loaded<Image, H> {
    return isLoaded(this as any as Image, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<Image>>(hint: H): Promise<JsonPayload<Image, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get author(): ManyToOneReference<Image, Author, undefined> {
    return this.__data.relations.author ??= hasOne(this as any as Image, authorMeta, "author", "image");
  }

  get book(): ManyToOneReference<Image, Book, undefined> {
    return this.__data.relations.book ??= hasOne(this as any as Image, bookMeta, "book", "image");
  }

  get publisher(): ManyToOneReference<Image, Publisher, undefined> {
    return this.__data.relations.publisher ??= hasOne(this as any as Image, publisherMeta, "publisher", "images");
  }
}
