import {
  Flavor,
  ValueFilter,
  ValueGraphQLFilter,
  OrderBy,
  ConfigApi,
  BaseEntity,
  EntityManager,
  setOpts,
  OptsOf,
  PartialOrNull,
  Changes,
  newChangesProxy,
  Lens,
  loadLens,
  LoadHint,
  Loaded,
  getEm,
  EnumGraphQLFilter,
  newRequiredRule,
  setField,
  Collection,
  hasMany,
  Reference,
  hasOneToOne,
} from "joist-orm";
import {
  Publisher,
  newPublisher,
  publisherMeta,
  PublisherSize,
  Image,
  Author,
  BookAdvance,
  authorMeta,
  bookAdvanceMeta,
  imageMeta,
} from "./entities";

export type PublisherId = Flavor<string, "Publisher">;

export interface PublisherOpts {
  name: string;
  size?: PublisherSize | null;
  image?: Image | null;
  authors?: Author[];
  bookAdvances?: BookAdvance[];
}

export interface PublisherFilter {
  id?: ValueFilter<PublisherId, never>;
  name?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  size?: ValueFilter<PublisherSize, null | undefined>;
}

export interface PublisherGraphQLFilter {
  id?: ValueGraphQLFilter<PublisherId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  size?: EnumGraphQLFilter<PublisherSize>;
}

export interface PublisherOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  size?: OrderBy;
}

export const publisherConfig = new ConfigApi<Publisher>();

publisherConfig.addRule(newRequiredRule("name"));
publisherConfig.addRule(newRequiredRule("createdAt"));
publisherConfig.addRule(newRequiredRule("updatedAt"));

export abstract class PublisherCodegen extends BaseEntity {
  readonly __types: {
    filterType: PublisherFilter;
    gqlFilterType: PublisherGraphQLFilter;
    orderType: PublisherOrder;
    optsType: PublisherOpts;
    factoryOptsType: Parameters<typeof newPublisher>[1];
  } = null!;

  readonly authors: Collection<Publisher, Author> = hasMany(authorMeta, "authors", "publisher", "publisher_id");

  readonly bookAdvances: Collection<Publisher, BookAdvance> = hasMany(
    bookAdvanceMeta,
    "bookAdvances",
    "publisher",
    "publisher_id",
  );

  readonly image: Reference<Publisher, Image, undefined> = hasOneToOne(imageMeta, "image", "publisher");

  constructor(em: EntityManager, opts: PublisherOpts) {
    super(em, publisherMeta);
    this.set(opts as PublisherOpts, { calledFromConstructor: true } as any);
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

  set(values: Partial<PublisherOpts>, opts: { ignoreUndefined?: boolean } = {}): void {
    setOpts(this, values as OptsOf<this>, opts);
  }

  setPartial(values: PartialOrNull<PublisherOpts>, opts: { ignoreUndefined?: boolean } = {}): void {
    setOpts(this, values as OptsOf<this>, { ignoreUndefined: true, ...opts });
  }

  get changes(): Changes<Publisher> {
    return newChangesProxy((this as any) as Publisher);
  }

  async load<U, V>(fn: (lens: Lens<Publisher>) => Lens<U, V>): Promise<V> {
    return loadLens((this as any) as Publisher, fn);
  }

  async populate<H extends LoadHint<Publisher>>(hint: H): Promise<Loaded<Publisher, H>> {
    return getEm(this).populate((this as any) as Publisher, hint);
  }
}
