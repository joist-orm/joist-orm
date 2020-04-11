import {
  Flavor,
  ValueFilter,
  OrderBy,
  BaseEntity,
  EntityOrmField,
  EntityManager,
  setOpts,
  fail,
  setField,
  Collection,
  OneToManyCollection,
} from "joist-orm";
import { publisherMeta, PublisherSize, Author, Publisher, authorMeta } from "./entities";

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

export class PublisherCodegen extends BaseEntity {
  readonly __orm: EntityOrmField;
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
    super();
    this.__orm = { em, metadata: publisherMeta, data: {}, originalData: {} };
    em.register(this);
    setOpts(this, opts);
  }

  get id(): PublisherId | undefined {
    return this.__orm.data["id"];
  }

  get idOrFail(): PublisherId {
    return this.__orm.data["id"] || fail("Entity has no id yet");
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

  toString(): string {
    return "Publisher#" + this.id;
  }

  set(opts: Partial<PublisherOpts>): void {
    setOpts(this, opts, false);
  }
}
