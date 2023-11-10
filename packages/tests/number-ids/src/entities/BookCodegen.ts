import {
  BaseEntity,
  Changes,
  cleanStringValue,
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
  TaggedId,
  toIdOf,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import { Author, AuthorId, authorMeta, AuthorOrder, Book, bookMeta, newBook } from "./entities";
import type { EntityManager } from "./entities";

export type BookId = Flavor<number, Book>;

export interface BookFields {
  id: { kind: "primitive"; type: bigint; unique: true; nullable: false };
  title: { kind: "primitive"; type: string; unique: false; nullable: never };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
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
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  author?: EntityFilter<Author, AuthorId, FilterOf<Author>, never>;
}

export interface BookGraphQLFilter {
  id?: ValueGraphQLFilter<BookId>;
  title?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  author?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, never>;
}

export interface BookOrder {
  id?: OrderBy;
  title?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  author?: AuthorOrder;
}

export const bookConfig = new ConfigApi<Book, Context>();

bookConfig.addRule(newRequiredRule("title"));
bookConfig.addRule(newRequiredRule("createdAt"));
bookConfig.addRule(newRequiredRule("updatedAt"));
bookConfig.addRule(newRequiredRule("author"));

export abstract class BookCodegen extends BaseEntity<EntityManager, number> {
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

  constructor(em: EntityManager, opts: BookOpts) {
    super(em, bookMeta, BookCodegen.defaultValues, opts);
    setOpts(this as any as Book, opts, { calledFromConstructor: true });
  }

  get id(): BookId {
    return this.idMaybe || fail("Book has no id yet");
  }

  get idMaybe(): BookId | undefined {
    return toIdOf(bookMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || fail("Book has no id yet");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return this.__orm.data["id"];
  }

  get title(): string {
    return this.__orm.data["title"];
  }

  set title(title: string) {
    setField(this, "title", cleanStringValue(title));
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
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

  get author(): ManyToOneReference<Book, Author, never> {
    const { relations } = this.__orm;
    if (relations.author === undefined) {
      relations.author = hasOne(this as any as Book, authorMeta, "author", "books");
    }
    return relations.author as any;
  }
}
