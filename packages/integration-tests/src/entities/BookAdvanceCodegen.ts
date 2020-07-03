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
  EntityFilter,
  FilterOf,
  EnumGraphQLFilter,
  EntityGraphQLFilter,
  GraphQLFilterOf,
  newRequiredRule,
  setField,
  Reference,
  hasOne,
} from "joist-orm";
import {
  BookAdvance,
  bookAdvanceMeta,
  AdvanceStatus,
  Book,
  Publisher,
  BookId,
  PublisherId,
  BookOrder,
  PublisherOrder,
  bookMeta,
  publisherMeta,
} from "./entities";

export type BookAdvanceId = Flavor<string, "BookAdvance">;

export interface BookAdvanceOpts {
  status: AdvanceStatus;
  book: Book;
  publisher: Publisher;
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
  book?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>>;
  publisher?: EntityGraphQLFilter<Publisher, PublisherId, GraphQLFilterOf<Publisher>>;
}

export interface BookAdvanceOrder {
  id?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  status?: OrderBy;
  book?: BookOrder;
  publisher?: PublisherOrder;
}

export const bookAdvanceConfig = new ConfigApi<BookAdvance>();

bookAdvanceConfig.addRule(newRequiredRule("createdAt"));
bookAdvanceConfig.addRule(newRequiredRule("updatedAt"));
bookAdvanceConfig.addRule(newRequiredRule("status"));
bookAdvanceConfig.addRule(newRequiredRule("book"));
bookAdvanceConfig.addRule(newRequiredRule("publisher"));

export abstract class BookAdvanceCodegen extends BaseEntity {
  readonly __filterType: BookAdvanceFilter = null!;
  readonly __gqlFilterType: BookAdvanceGraphQLFilter = null!;
  readonly __orderType: BookAdvanceOrder = null!;
  readonly __optsType: BookAdvanceOpts = null!;

  readonly book: Reference<BookAdvance, Book, never> = hasOne(bookMeta, "book", "advances");

  readonly publisher: Reference<BookAdvance, Publisher, never> = hasOne(publisherMeta, "publisher", "bookAdvances");

  constructor(em: EntityManager, opts: BookAdvanceOpts) {
    super(em, bookAdvanceMeta);
    this.set(opts as BookAdvanceOpts, { calledFromConstructor: true } as any);
  }

  get id(): BookAdvanceId | undefined {
    return this.__orm.data["id"];
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

  set(values: Partial<BookAdvanceOpts>, opts: { ignoreUndefined?: boolean } = {}): void {
    setOpts(this, values as OptsOf<this>, opts);
  }

  setPartial(values: PartialOrNull<BookAdvanceOpts>, opts: { ignoreUndefined?: boolean } = {}): void {
    setOpts(this, values as OptsOf<this>, { ignoreUndefined: true, ...opts });
  }

  get changes(): Changes<BookAdvance> {
    return newChangesProxy((this as any) as BookAdvance);
  }

  async load<U, V>(fn: (lens: Lens<BookAdvance>) => Lens<U, V>): Promise<V> {
    return loadLens((this as any) as BookAdvance, fn);
  }

  async populate<H extends LoadHint<BookAdvance>>(hint: H): Promise<Loaded<BookAdvance, H>> {
    return getEm(this).populate((this as any) as BookAdvance, hint);
  }
}
