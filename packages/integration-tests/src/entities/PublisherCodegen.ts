import {
  Flavor,
  ValueFilter,
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
  newRequiredRule,
  setField,
  Collection,
  OneToManyCollection,
} from "joist-orm";
import { Publisher, publisherMeta, PublisherSize, Author, authorMeta } from "./entities";

export type PublisherId = Flavor<string, "Publisher">;

export interface PublisherOpts {
  name: string;
  size?: PublisherSize | null;
  authors?: Author[];
}

export interface PublisherFilter {
  id?: ValueFilter<PublisherId, never>;
  name?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  size?: ValueFilter<PublisherSize, null | undefined>;
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
  readonly __filterType: PublisherFilter = null!;
  readonly __orderType: PublisherOrder = null!;
  readonly __optsType: PublisherOpts = null!;

  readonly authors: Collection<Publisher, Author> = new OneToManyCollection(
    this as any,
    authorMeta,
    "authors",
    "publisher",
    "publisher_id",
  );

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

  setUnsafe(values: PartialOrNull<PublisherOpts>, opts: { ignoreUndefined?: boolean } = {}): void {
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
