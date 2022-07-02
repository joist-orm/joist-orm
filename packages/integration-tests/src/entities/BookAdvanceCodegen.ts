import {
  BaseEntity,
  Changes,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityOrmField,
  EnumGraphQLFilter,
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
import type { EntityManager } from "./entities";
import {
  AdvanceStatus,
  Book,
  BookAdvance,
  bookAdvanceMeta,
  BookId,
  bookMeta,
  BookOrder,
  newBookAdvance,
  Publisher,
  PublisherId,
  publisherMeta,
  PublisherOrder,
} from "./entities";

export type BookAdvanceId = Flavor<string, "BookAdvance">;

export interface BookAdvanceFields {
  status: AdvanceStatus;
  book: Book;
  publisher: Publisher;
}

export interface BookAdvanceOpts {
  status: AdvanceStatus;
  book: Book | BookId;
  publisher: Publisher | PublisherId;
}

export interface BookAdvanceIdsOpts {
  bookId?: BookId | null;
  publisherId?: PublisherId | null;
}

export interface BookAdvanceFilter {
  id?: ValueFilter<BookAdvanceId, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  status?: ValueFilter<AdvanceStatus, never>;
  book?: EntityFilter<Book, BookId, FilterOf<Book>, never>;
  publisher?: EntityFilter<Publisher, PublisherId, FilterOf<Publisher>, never>;
}

export interface BookAdvanceGraphQLFilter {
  id?: ValueGraphQLFilter<BookAdvanceId>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  status?: EnumGraphQLFilter<AdvanceStatus>;
  book?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>, never>;
  publisher?: EntityGraphQLFilter<Publisher, PublisherId, GraphQLFilterOf<Publisher>, never>;
}

export interface BookAdvanceOrder {
  id?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  status?: OrderBy;
  book?: BookOrder;
  publisher?: PublisherOrder;
}

export const bookAdvanceConfig = new ConfigApi<BookAdvance, Context>();

bookAdvanceConfig.addRule(newRequiredRule("createdAt"));
bookAdvanceConfig.addRule(newRequiredRule("updatedAt"));
bookAdvanceConfig.addRule(newRequiredRule("status"));
bookAdvanceConfig.addRule(newRequiredRule("book"));
bookAdvanceConfig.addRule(newRequiredRule("publisher"));

export abstract class BookAdvanceCodegen extends BaseEntity<EntityManager> {
  static defaultValues: object = {};

  readonly __orm!: EntityOrmField & {
    filterType: BookAdvanceFilter;
    gqlFilterType: BookAdvanceGraphQLFilter;
    orderType: BookAdvanceOrder;
    optsType: BookAdvanceOpts;
    fieldsType: BookAdvanceFields;
    optIdsType: BookAdvanceIdsOpts;
    factoryOptsType: Parameters<typeof newBookAdvance>[1];
  };

  readonly book: ManyToOneReference<BookAdvance, Book, never> = hasOne(bookMeta, "book", "advances");

  readonly publisher: ManyToOneReference<BookAdvance, Publisher, never> = hasOne(
    publisherMeta,
    "publisher",
    "bookAdvances",
  );

  constructor(em: EntityManager, opts: BookAdvanceOpts) {
    super(em, bookAdvanceMeta, BookAdvanceCodegen.defaultValues, opts);
    setOpts(this as any as BookAdvance, opts, { calledFromConstructor: true });
  }

  get id(): BookAdvanceId | undefined {
    return this.idTagged;
  }

  get idOrFail(): BookAdvanceId {
    return this.id || fail("BookAdvance has no id yet");
  }

  get idTagged(): BookAdvanceId | undefined {
    return this.__orm.data["id"];
  }

  get idTaggedOrFail(): BookAdvanceId {
    return this.idTagged || fail("BookAdvance has no id tagged yet");
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  get status(): AdvanceStatus {
    return this.__orm.data["status"];
  }

  set status(status: AdvanceStatus) {
    setField(this, "status", status);
  }

  get isPending(): boolean {
    return this.__orm.data["status"] === AdvanceStatus.Pending;
  }

  get isSigned(): boolean {
    return this.__orm.data["status"] === AdvanceStatus.Signed;
  }

  get isPaid(): boolean {
    return this.__orm.data["status"] === AdvanceStatus.Paid;
  }

  set(opts: Partial<BookAdvanceOpts>): void {
    setOpts(this as any as BookAdvance, opts);
  }

  setPartial(opts: PartialOrNull<BookAdvanceOpts>): void {
    setOpts(this as any as BookAdvance, opts as OptsOf<BookAdvance>, { partial: true });
  }

  get changes(): Changes<BookAdvance> {
    return newChangesProxy(this as any as BookAdvance);
  }

  load<U, V>(fn: (lens: Lens<BookAdvance>) => Lens<U, V>): Promise<V> {
    return loadLens(this as any as BookAdvance, fn);
  }

  populate<H extends LoadHint<BookAdvance>>(hint: H): Promise<Loaded<BookAdvance, H>>;
  populate<H extends LoadHint<BookAdvance>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<BookAdvance, H>>;
  populate<H extends LoadHint<BookAdvance>, V>(hint: H, fn: (ba: Loaded<BookAdvance, H>) => V): Promise<V>;
  populate<H extends LoadHint<BookAdvance>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (ba: Loaded<BookAdvance, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<BookAdvance>, V>(
    hintOrOpts: any,
    fn?: (ba: Loaded<BookAdvance, H>) => V,
  ): Promise<Loaded<BookAdvance, H> | V> {
    return this.em.populate(this as any as BookAdvance, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<BookAdvance>>(hint: H): this is Loaded<BookAdvance, H> {
    return isLoaded(this as any as BookAdvance, hint);
  }
}
