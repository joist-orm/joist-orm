import {
  BaseEntity,
  Changes,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  EntityOrmField,
  fail,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
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
import { Author, AuthorId, authorMeta, AuthorOrder, Book, bookMeta, newBook } from "./entities";
import type { EntityManager } from "./entities";

export type BookId = Flavor<string, "Book">;

export interface BookFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: false };
  title: { kind: "primitive"; type: string; unique: false; nullable: never };
  author: { kind: "m2o"; type: Author; nullable: never };
}

export interface BookOpts {
  title: string;
  author: Author | AuthorId;
}

export interface BookIdsOpts {
  authorId?: AuthorId | null;
}

export interface BookFilter {
  id?: ValueFilter<BookId, never>;
  title?: ValueFilter<string, never>;
  author?: EntityFilter<Author, AuthorId, FilterOf<Author>, never>;
}

export interface BookGraphQLFilter {
  id?: ValueGraphQLFilter<BookId>;
  title?: ValueGraphQLFilter<string>;
  author?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, never>;
}

export interface BookOrder {
  id?: OrderBy;
  title?: OrderBy;
  author?: AuthorOrder;
}

export const bookConfig = new ConfigApi<Book, Context>();

bookConfig.addRule(newRequiredRule("title"));
bookConfig.addRule(newRequiredRule("author"));

export abstract class BookCodegen extends BaseEntity<EntityManager> {
  static defaultValues: object = {};
  static readonly tagName = "b";
  static readonly metadata: EntityMetadata<Book>;

  declare readonly __orm: EntityOrmField & {
    filterType: BookFilter;
    gqlFilterType: BookGraphQLFilter;
    orderType: BookOrder;
    optsType: BookOpts;
    fieldsType: BookFields;
    optIdsType: BookIdsOpts;
    factoryOptsType: Parameters<typeof newBook>[1];
  };

  readonly author: ManyToOneReference<Book, Author, never> = hasOne(authorMeta, "author", "books");

  constructor(em: EntityManager, opts: BookOpts) {
    super(em, bookMeta, BookCodegen.defaultValues, opts);
    setOpts(this as any as Book, opts, { calledFromConstructor: true });
  }

  get id(): BookId | undefined {
    return this.idTagged;
  }

  get idOrFail(): BookId {
    return this.id || fail("Book has no id yet");
  }

  get idTagged(): BookId | undefined {
    return this.__orm.data["id"];
  }

  get idTaggedOrFail(): BookId {
    return this.idTagged || fail("Book has no id tagged yet");
  }

  get title(): string {
    return this.__orm.data["title"];
  }

  set title(title: string) {
    setField(this, "title", title);
  }

  set(opts: Partial<BookOpts>): void {
    setOpts(this as any as Book, opts);
  }

  setPartial(opts: PartialOrNull<BookOpts>): void {
    setOpts(this as any as Book, opts as OptsOf<Book>, { partial: true });
  }

  get changes(): Changes<Book> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<Book>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Book, fn, opts);
  }

  populate<H extends LoadHint<Book>>(hint: H): Promise<Loaded<Book, H>>;
  populate<H extends LoadHint<Book>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Book, H>>;
  populate<H extends LoadHint<Book>, V>(hint: H, fn: (b: Loaded<Book, H>) => V): Promise<V>;
  populate<H extends LoadHint<Book>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (b: Loaded<Book, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<Book>, V>(hintOrOpts: any, fn?: (b: Loaded<Book, H>) => V): Promise<Loaded<Book, H> | V> {
    return this.em.populate(this as any as Book, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<Book>>(hint: H): this is Loaded<Book, H> {
    return isLoaded(this as any as Book, hint);
  }
}
