import {
  BaseEntity,
  type Changes,
  cleanStringValue,
  ConfigApi,
  type EntityFilter,
  type EntityGraphQLFilter,
  type EntityMetadata,
  failNoIdYet,
  type FilterOf,
  type Flavor,
  getField,
  type GraphQLFilterOf,
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
  newT5BookReview,
  T5Book,
  type T5BookId,
  t5BookMeta,
  type T5BookOrder,
  T5BookReview,
  t5BookReviewMeta,
} from "../entities";

export type T5BookReviewId = Flavor<number, T5BookReview>;

export interface T5BookReviewFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  title: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  book: { kind: "m2o"; type: T5Book; nullable: undefined; derived: false };
}

export interface T5BookReviewOpts {
  title: string;
  book?: T5Book | T5BookId | null;
}

export interface T5BookReviewIdsOpts {
  bookId?: T5BookId | null;
}

export interface T5BookReviewFilter {
  id?: ValueFilter<T5BookReviewId, never> | null;
  title?: ValueFilter<string, never>;
  book?: EntityFilter<T5Book, T5BookId, FilterOf<T5Book>, null>;
}

export interface T5BookReviewGraphQLFilter {
  id?: ValueGraphQLFilter<T5BookReviewId>;
  title?: ValueGraphQLFilter<string>;
  book?: EntityGraphQLFilter<T5Book, T5BookId, GraphQLFilterOf<T5Book>, null>;
}

export interface T5BookReviewOrder {
  id?: OrderBy;
  title?: OrderBy;
  book?: T5BookOrder;
}

export const t5BookReviewConfig = new ConfigApi<T5BookReview, Context>();

t5BookReviewConfig.addRule(newRequiredRule("title"));

export abstract class T5BookReviewCodegen extends BaseEntity<EntityManager, number> implements Entity {
  static readonly tagName = "tbr";
  static readonly metadata: EntityMetadata<T5BookReview>;

  declare readonly __orm: {
    entityType: T5BookReview;
    filterType: T5BookReviewFilter;
    gqlFilterType: T5BookReviewGraphQLFilter;
    orderType: T5BookReviewOrder;
    optsType: T5BookReviewOpts;
    fieldsType: T5BookReviewFields;
    optIdsType: T5BookReviewIdsOpts;
    factoryOptsType: Parameters<typeof newT5BookReview>[1];
  };

  constructor(em: EntityManager, opts: T5BookReviewOpts) {
    super(em, opts);
    setOpts(this as any as T5BookReview, opts, { calledFromConstructor: true });
  }

  get id(): T5BookReviewId {
    return this.idMaybe || failNoIdYet("T5BookReview");
  }

  get idMaybe(): T5BookReviewId | undefined {
    return toIdOf(t5BookReviewMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("T5BookReview");
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

  set(opts: Partial<T5BookReviewOpts>): void {
    setOpts(this as any as T5BookReview, opts);
  }

  setPartial(opts: PartialOrNull<T5BookReviewOpts>): void {
    setOpts(this as any as T5BookReview, opts as OptsOf<T5BookReview>, { partial: true });
  }

  get changes(): Changes<T5BookReview> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<T5BookReview>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as T5BookReview, fn, opts);
  }

  populate<const H extends LoadHint<T5BookReview>>(hint: H): Promise<Loaded<T5BookReview, H>>;
  populate<const H extends LoadHint<T5BookReview>>(opts: {
    hint: H;
    forceReload?: boolean;
  }): Promise<Loaded<T5BookReview, H>>;
  populate<const H extends LoadHint<T5BookReview>, V>(hint: H, fn: (tbr: Loaded<T5BookReview, H>) => V): Promise<V>;
  populate<const H extends LoadHint<T5BookReview>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (tbr: Loaded<T5BookReview, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<T5BookReview>, V>(
    hintOrOpts: any,
    fn?: (tbr: Loaded<T5BookReview, H>) => V,
  ): Promise<Loaded<T5BookReview, H> | V> {
    return this.em.populate(this as any as T5BookReview, hintOrOpts, fn);
  }

  isLoaded<const H extends LoadHint<T5BookReview>>(hint: H): this is Loaded<T5BookReview, H> {
    return isLoaded(this as any as T5BookReview, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<T5BookReview>>(hint: H): Promise<JsonPayload<T5BookReview, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get book(): ManyToOneReference<T5BookReview, T5Book, undefined> {
    return (this.__data.relations.book ??= hasOne(this as any as T5BookReview, t5BookMeta, "book", "reviews"));
  }
}
