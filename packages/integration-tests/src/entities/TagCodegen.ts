import {
  Flavor,
  ValueFilter,
  OrderBy,
  BaseEntity,
  EntityOrmField,
  EntityManager,
  setOpts,
  fail,
  Collection,
  ManyToManyCollection,
  setField,
} from "joist-orm";
import { tagMeta, Book, Tag } from "./entities";

export type TagId = Flavor<string, "Tag">;

export interface TagOpts {
  name: string;
  books?: Book[];
}

export interface TagFilter {
  id?: ValueFilter<TagId, never>;
  name?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
}

export interface TagOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
}

export class TagCodegen extends BaseEntity {
  readonly __orm: EntityOrmField;
  readonly __filterType: TagFilter = null!;
  readonly __orderType: TagOrder = null!;
  readonly __optsType: TagOpts = null!;

  readonly books: Collection<Tag, Book> = new ManyToManyCollection(
    "books_to_tags",
    this,
    "books",
    "tag_id",
    Book,
    "tags",
    "book_id",
  );

  constructor(em: EntityManager, opts: TagOpts) {
    super();
    this.__orm = { em, metadata: tagMeta, data: {}, originalData: {} };
    em.register(this);
    setOpts(this, opts);
  }

  get id(): TagId | undefined {
    return this.__orm.data["id"];
  }

  get idOrFail(): TagId {
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

  toString(): string {
    return "Tag#" + this.id;
  }

  set(opts: Partial<TagOpts>): void {
    setOpts(this, opts, false);
  }
}
