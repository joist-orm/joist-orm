import {
  BaseEntity,
  ConfigApi,
  failNoIdYet,
  getField,
  getInstanceData,
  hasOne,
  isLoaded,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  setField,
  setOpts,
  toIdOf,
  toJSON,
} from "joist-orm";
import type {
  Changes,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  JsonPayload,
  Lens,
  Loaded,
  LoadHint,
  ManyToOneReference,
  NestedJsonHint,
  OptsOf,
  OrderBy,
  PartialOrNull,
  TaggedId,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import {
  AdvanceStatus,
  AdvanceStatusDetails,
  AdvanceStatuses,
  Book,
  BookAdvance,
  bookAdvanceMeta,
  bookMeta,
  EntityManager,
  newBookAdvance,
  Publisher,
  publisherMeta,
} from "../entities";
import type { BookId, BookOrder, Entity, PublisherId, PublisherOrder } from "../entities";

export type BookAdvanceId = Flavor<string, BookAdvance>;

export interface BookAdvanceFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  status: { kind: "enum"; type: AdvanceStatus; nullable: never };
  book: { kind: "m2o"; type: Book; nullable: never; derived: false };
  publisher: { kind: "m2o"; type: Publisher; nullable: never; derived: false };
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
  id?: ValueFilter<BookAdvanceId, never> | null;
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
  status?: ValueGraphQLFilter<AdvanceStatus>;
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

export abstract class BookAdvanceCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "ba";
  static readonly metadata: EntityMetadata<BookAdvance>;

  declare readonly __orm: {
    filterType: BookAdvanceFilter;
    gqlFilterType: BookAdvanceGraphQLFilter;
    orderType: BookAdvanceOrder;
    optsType: BookAdvanceOpts;
    fieldsType: BookAdvanceFields;
    optIdsType: BookAdvanceIdsOpts;
    factoryOptsType: Parameters<typeof newBookAdvance>[1];
  };

  constructor(em: EntityManager, opts: BookAdvanceOpts) {
    super(em, opts);
    setOpts(this as any as BookAdvance, opts, { calledFromConstructor: true });
  }

  get id(): BookAdvanceId {
    return this.idMaybe || failNoIdYet("BookAdvance");
  }

  get idMaybe(): BookAdvanceId | undefined {
    return toIdOf(bookAdvanceMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("BookAdvance");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  get status(): AdvanceStatus {
    return getField(this, "status");
  }

  get statusDetails(): AdvanceStatusDetails {
    return AdvanceStatuses.getByCode(this.status);
  }

  set status(status: AdvanceStatus) {
    setField(this, "status", status);
  }

  get isPending(): boolean {
    return getField(this, "status") === AdvanceStatus.Pending;
  }

  get isSigned(): boolean {
    return getField(this, "status") === AdvanceStatus.Signed;
  }

  get isPaid(): boolean {
    return getField(this, "status") === AdvanceStatus.Paid;
  }

  set(opts: Partial<BookAdvanceOpts>): void {
    setOpts(this as any as BookAdvance, opts);
  }

  setPartial(opts: PartialOrNull<BookAdvanceOpts>): void {
    setOpts(this as any as BookAdvance, opts as OptsOf<BookAdvance>, { partial: true });
  }

  get changes(): Changes<BookAdvance> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<BookAdvance>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as BookAdvance, fn, opts);
  }

  populate<const H extends LoadHint<BookAdvance>>(hint: H): Promise<Loaded<BookAdvance, H>>;
  populate<const H extends LoadHint<BookAdvance>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<BookAdvance, H>>;
  populate<const H extends LoadHint<BookAdvance>, V>(hint: H, fn: (ba: Loaded<BookAdvance, H>) => V): Promise<V>;
  populate<const H extends LoadHint<BookAdvance>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (ba: Loaded<BookAdvance, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<BookAdvance>, V>(
    hintOrOpts: any,
    fn?: (ba: Loaded<BookAdvance, H>) => V,
  ): Promise<Loaded<BookAdvance, H> | V> {
    return this.em.populate(this as any as BookAdvance, hintOrOpts, fn);
  }

  isLoaded<const H extends LoadHint<BookAdvance>>(hint: H): this is Loaded<BookAdvance, H> {
    return isLoaded(this as any as BookAdvance, hint);
  }

  toJSON(): object;
  toJSON<const H extends NestedJsonHint<BookAdvance>>(hint: H): Promise<JsonPayload<BookAdvance, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get book(): ManyToOneReference<BookAdvance, Book, never> {
    const { relations } = getInstanceData(this);
    return relations.book ??= hasOne(this as any as BookAdvance, bookMeta, "book", "advances");
  }

  get publisher(): ManyToOneReference<BookAdvance, Publisher, never> {
    const { relations } = getInstanceData(this);
    return relations.publisher ??= hasOne(this as any as BookAdvance, publisherMeta, "publisher", "bookAdvances");
  }
}
