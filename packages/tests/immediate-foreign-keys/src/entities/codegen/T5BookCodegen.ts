import {
  BaseEntity,
  type Changes,
  cleanStringValue,
  type Collection,
  ConfigApi,
  type EntityFilter,
  type EntityGraphQLFilter,
  type EntityMetadata,
  failNoIdYet,
  type FilterOf,
  type Flavor,
  getField,
  type GraphQLFilterOf,
  hasMany,
  hasOne,
  isLoaded,
  type JsonPayload,
  type Lens,
  type Loaded,
  type LoadHint,
  loadLens,
  type ManyToOneReference,
  newChangesProxy,
  newRequiredRule,
  type OptsOf,
  type OrderBy,
  type PartialOrNull,
  setField,
  setOpts,
  type TaggedId,
  toIdOf,
  toJSON,
  type ToJsonHint,
  type ValueFilter,
  type ValueGraphQLFilter,
} from "joist-orm";
import { type Context } from "src/context";
import {
  type Entity,
  EntityManager,
  newT5Book,
  T5Author,
  type T5AuthorId,
  t5AuthorMeta,
  type T5AuthorOrder,
  T5Book,
  t5BookMeta,
  T5BookReview,
  type T5BookReviewId,
  t5BookReviewMeta,
} from "../entities";

export type T5BookId = Flavor<number, T5Book>;

export interface T5BookFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  title: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  author: { kind: "m2o"; type: T5Author; nullable: never; derived: false };
}

export interface T5BookOpts {
  title: string;
  author: T5Author | T5AuthorId;
  reviews?: T5BookReview[];
}

export interface T5BookIdsOpts {
  authorId?: T5AuthorId | null;
  reviewIds?: T5BookReviewId[] | null;
}

export interface T5BookFilter {
  id?: ValueFilter<T5BookId, never> | null;
  title?: ValueFilter<string, never>;
  author?: EntityFilter<T5Author, T5AuthorId, FilterOf<T5Author>, never>;
  reviews?: EntityFilter<T5BookReview, T5BookReviewId, FilterOf<T5BookReview>, null | undefined>;
}

export interface T5BookGraphQLFilter {
  id?: ValueGraphQLFilter<T5BookId>;
  title?: ValueGraphQLFilter<string>;
  author?: EntityGraphQLFilter<T5Author, T5AuthorId, GraphQLFilterOf<T5Author>, never>;
  reviews?: EntityGraphQLFilter<T5BookReview, T5BookReviewId, GraphQLFilterOf<T5BookReview>, null | undefined>;
}

export interface T5BookOrder {
  id?: OrderBy;
  title?: OrderBy;
  author?: T5AuthorOrder;
}

export const t5BookConfig = new ConfigApi<T5Book, Context>();

t5BookConfig.addRule(newRequiredRule("title"));
t5BookConfig.addRule(newRequiredRule("author"));

export abstract class T5BookCodegen extends BaseEntity<EntityManager, number> implements Entity {
  static readonly tagName = "t5Book";
  static readonly metadata: EntityMetadata<T5Book>;

  declare readonly __orm: {
    entityType: T5Book;
    filterType: T5BookFilter;
    gqlFilterType: T5BookGraphQLFilter;
    orderType: T5BookOrder;
    optsType: T5BookOpts;
    fieldsType: T5BookFields;
    optIdsType: T5BookIdsOpts;
    factoryOptsType: Parameters<typeof newT5Book>[1];
  };

  constructor(em: EntityManager, opts: T5BookOpts) {
    super(em, opts);
    setOpts(this as any as T5Book, opts, { calledFromConstructor: true });
  }

  get id(): T5BookId {
    return this.idMaybe || failNoIdYet("T5Book");
  }

  get idMaybe(): T5BookId | undefined {
    return toIdOf(t5BookMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("T5Book");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get title(): string {
    return getField(this, "title");
  }

  set title(title: string) {
    setField(this, "title", cleanStringValue(title));
  }

  set(opts: Partial<T5BookOpts>): void {
    setOpts(this as any as T5Book, opts);
  }

  setPartial(opts: PartialOrNull<T5BookOpts>): void {
    setOpts(this as any as T5Book, opts as OptsOf<T5Book>, { partial: true });
  }

  get changes(): Changes<T5Book> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<T5Book>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as T5Book, fn, opts);
  }

  populate<const H extends LoadHint<T5Book>>(hint: H): Promise<Loaded<T5Book, H>>;
  populate<const H extends LoadHint<T5Book>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<T5Book, H>>;
  populate<const H extends LoadHint<T5Book>, V>(hint: H, fn: (t5Book: Loaded<T5Book, H>) => V): Promise<V>;
  populate<const H extends LoadHint<T5Book>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (t5Book: Loaded<T5Book, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<T5Book>, V>(
    hintOrOpts: any,
    fn?: (t5Book: Loaded<T5Book, H>) => V,
  ): Promise<Loaded<T5Book, H> | V> {
    return this.em.populate(this as any as T5Book, hintOrOpts, fn);
  }

  isLoaded<const H extends LoadHint<T5Book>>(hint: H): this is Loaded<T5Book, H> {
    return isLoaded(this as any as T5Book, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<T5Book>>(hint: H): Promise<JsonPayload<T5Book, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get reviews(): Collection<T5Book, T5BookReview> {
    return this.__data.relations.reviews ??= hasMany(this, t5BookReviewMeta, "reviews", "book", "book_id", undefined);
  }

  get author(): ManyToOneReference<T5Book, T5Author, never> {
    return this.__data.relations.author ??= hasOne(this, t5AuthorMeta, "author", "t5Books");
  }
}
