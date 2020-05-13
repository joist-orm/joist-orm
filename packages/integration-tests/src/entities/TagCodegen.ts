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
  newChangesProxy,
  Entity,
  Lens,
  FieldStatus,
  newRequiredRule,
  Collection,
  ManyToManyCollection,
  setField,
} from "joist-orm";
import { Tag, tagMeta, Book } from "./entities";

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

interface TagChanges {
  name: FieldStatus<string>;
  createdAt: FieldStatus<Date>;
  updatedAt: FieldStatus<Date>;
}

export const tagConfig = new ConfigApi<Tag>();

tagConfig.addRule(newRequiredRule("name"));
tagConfig.addRule(newRequiredRule("createdAt"));
tagConfig.addRule(newRequiredRule("updatedAt"));

export abstract class TagCodegen extends BaseEntity {
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
    super(em, tagMeta);
    this.set(opts as TagOpts, { calledFromConstructor: true } as any);
  }

  get id(): TagId | undefined {
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

  set(values: Partial<TagOpts>, opts: { ignoreUndefined?: boolean } = {}): void {
    setOpts(this, values as OptsOf<this>, opts);
  }

  setUnsafe(values: PartialOrNull<TagOpts>, opts: { ignoreUndefined?: boolean } = {}): void {
    setOpts(this, values as OptsOf<this>, { ignoreUndefined: true, ...opts });
  }

  get changes(): TagChanges {
    return newChangesProxy(this);
  }

  async load<U extends Entity, V extends U | U[]>(fn: (lens: Lens<Tag, Tag>) => Lens<U, V>): Promise<V> {
    return super.load(fn);
  }
}
