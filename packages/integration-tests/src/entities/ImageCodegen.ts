import {
  Flavor,
  ValueFilter,
  ValueGraphQLFilter,
  OrderBy,
  ConfigApi,
  BaseEntity,
  EntityManager,
  setOpts,
  PartialOrNull,
  OptsOf,
  Changes,
  newChangesProxy,
  Lens,
  loadLens,
  LoadHint,
  Loaded,
  getEm,
  EntityFilter,
  FilterOf,
  EnumGraphQLFilter,
  EntityGraphQLFilter,
  GraphQLFilterOf,
  newRequiredRule,
  setField,
  ManyToOneReference,
  hasOne,
} from "joist-orm";
import {
  Image,
  newImage,
  imageMeta,
  ImageType,
  Author,
  Book,
  Publisher,
  AuthorId,
  BookId,
  PublisherId,
  AuthorOrder,
  BookOrder,
  PublisherOrder,
  ImageTypeDetails,
  authorMeta,
  bookMeta,
  publisherMeta,
  ImageTypes,
} from "./entities";
import { Context } from "src/context";

export type ImageId = Flavor<string, "Image">;

export interface ImageOpts {
  fileName: string;
  type: ImageType;
  author?: Author | null;
  book?: Book | null;
  publisher?: Publisher | null;
}

export interface ImageIdsOpts {
  authorId?: AuthorId | null;
  bookId?: BookId | null;
  publisherId?: PublisherId | null;
}

export interface ImageFilter {
  id?: ValueFilter<ImageId, never>;
  fileName?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  type?: ValueFilter<ImageType, never>;
  author?: EntityFilter<Author, AuthorId, FilterOf<Author>, null | undefined>;
  book?: EntityFilter<Book, BookId, FilterOf<Book>, null | undefined>;
  publisher?: EntityFilter<Publisher, PublisherId, FilterOf<Publisher>, null | undefined>;
}

export interface ImageGraphQLFilter {
  id?: ValueGraphQLFilter<ImageId>;
  fileName?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  type?: EnumGraphQLFilter<ImageType>;
  author?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>>;
  book?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>>;
  publisher?: EntityGraphQLFilter<Publisher, PublisherId, GraphQLFilterOf<Publisher>>;
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

export abstract class ImageCodegen extends BaseEntity {
  readonly __types: {
    filterType: ImageFilter;
    gqlFilterType: ImageGraphQLFilter;
    orderType: ImageOrder;
    optsType: ImageOpts;
    optIdsType: ImageIdsOpts;
    factoryOptsType: Parameters<typeof newImage>[1];
  } = null!;

  readonly author: ManyToOneReference<Image, Author, undefined> = hasOne(authorMeta, "author", "image");

  readonly book: ManyToOneReference<Image, Book, undefined> = hasOne(bookMeta, "book", "image");

  readonly publisher: ManyToOneReference<Image, Publisher, undefined> = hasOne(publisherMeta, "publisher", "images");

  constructor(em: EntityManager, opts: ImageOpts) {
    super(em, imageMeta, {}, opts);
    setOpts(this as any as Image, opts, { calledFromConstructor: true });
  }

  get id(): ImageId | undefined {
    return this.__orm.data["id"];
  }

  get fileName(): string {
    return this.__orm.data["fileName"];
  }

  set fileName(fileName: string) {
    setField(this, "fileName", fileName);
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  get type(): ImageType {
    return this.__orm.data["type"];
  }

  get typeDetails(): ImageTypeDetails {
    return ImageTypes.getByCode(this.type);
  }

  set type(type: ImageType) {
    setField(this, "type", type);
  }

  get isBookImage(): boolean {
    return this.__orm.data["type"] === ImageType.BookImage;
  }

  get isAuthorImage(): boolean {
    return this.__orm.data["type"] === ImageType.AuthorImage;
  }

  get isPublisherImage(): boolean {
    return this.__orm.data["type"] === ImageType.PublisherImage;
  }

  set(opts: Partial<ImageOpts>): void {
    setOpts(this as any as Image, opts);
  }

  setPartial(opts: PartialOrNull<ImageOpts>): void {
    setOpts(this as any as Image, opts as OptsOf<Image>, { partial: true });
  }

  get changes(): Changes<Image> {
    return newChangesProxy(this as any as Image);
  }

  async load<U, V>(fn: (lens: Lens<Image>) => Lens<U, V>): Promise<V> {
    return loadLens(this as any as Image, fn);
  }

  async populate<H extends LoadHint<Image>>(hint: H): Promise<Loaded<Image, H>> {
    return getEm(this).populate(this as any as Image, hint);
  }
}
