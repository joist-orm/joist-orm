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
  newRequiredRule,
  Collection,
  hasManyToMany,
  setField,
} from "joist-orm";
import { Tag, newTag, tagMeta, Book, BookId, bookMeta } from "./entities";
import { Context } from "src/context";

export type TagId = Flavor<string, "Tag">;

export interface TagOpts {
  name: string;
  books?: Book[];
}

export interface TagIdsOpts {
  bookIds?: BookId[] | null;
}

export interface TagFilter {
  id?: ValueFilter<TagId, never>;
  name?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
}

export interface TagGraphQLFilter {
  id?: ValueGraphQLFilter<TagId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
}

export interface TagOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
}

export const tagConfig = new ConfigApi<Tag, Context>();

tagConfig.addRule(newRequiredRule("name"));
tagConfig.addRule(newRequiredRule("createdAt"));
tagConfig.addRule(newRequiredRule("updatedAt"));

export abstract class TagCodegen extends BaseEntity {
  readonly __types: {
    filterType: TagFilter;
    gqlFilterType: TagGraphQLFilter;
    orderType: TagOrder;
    optsType: TagOpts;
    optIdsType: TagIdsOpts;
    factoryOptsType: Parameters<typeof newTag>[1];
  } = null!;

  readonly books: Collection<Tag, Book> = hasManyToMany(
    "books_to_tags",
    "books",
    "tag_id",
    bookMeta,
    "tags",
    "book_id",
  );

  constructor(em: EntityManager, opts: TagOpts) {
    super(em, tagMeta, {}, opts);
    setOpts((this as any) as Tag, opts, { calledFromConstructor: true });
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

  set(opts: Partial<TagOpts>): void {
    setOpts((this as any) as Tag, opts);
  }

  setPartial(opts: PartialOrNull<TagOpts>): void {
    setOpts((this as any) as Tag, opts as OptsOf<Tag>, { partial: true });
  }

  get changes(): Changes<Tag> {
    return newChangesProxy((this as any) as Tag);
  }

  async load<U, V>(fn: (lens: Lens<Tag>) => Lens<U, V>): Promise<V> {
    return loadLens((this as any) as Tag, fn);
  }

  async populate<H extends LoadHint<Tag>>(hint: H): Promise<Loaded<Tag, H>> {
    return getEm(this).populate((this as any) as Tag, hint);
  }
}
