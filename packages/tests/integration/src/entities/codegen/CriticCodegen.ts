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
  hasOneToOne,
  isLoaded,
  type JsonPayload,
  type Lens,
  type Loaded,
  type LoadHint,
  loadLens,
  type ManyToOneReference,
  newChangesProxy,
  newRequiredRule,
  type OneToOneReference,
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
  BookReview,
  type BookReviewId,
  bookReviewMeta,
  Critic,
  CriticColumn,
  type CriticColumnId,
  criticColumnMeta,
  criticMeta,
  type Entity,
  EntityManager,
  LargePublisher,
  type LargePublisherId,
  largePublisherMeta,
  type LargePublisherOrder,
  newCritic,
  PublisherGroup,
  type PublisherGroupId,
  publisherGroupMeta,
  type PublisherGroupOrder,
} from "../entities";

export type CriticId = Flavor<string, Critic>;

export interface CriticFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  favoriteLargePublisher: { kind: "m2o"; type: LargePublisher; nullable: undefined; derived: false };
  group: { kind: "m2o"; type: PublisherGroup; nullable: undefined; derived: false };
}

export interface CriticOpts {
  name: string;
  favoriteLargePublisher?: LargePublisher | LargePublisherId | null;
  group?: PublisherGroup | PublisherGroupId | null;
  criticColumn?: CriticColumn | null;
  bookReviews?: BookReview[];
}

export interface CriticIdsOpts {
  favoriteLargePublisherId?: LargePublisherId | null;
  groupId?: PublisherGroupId | null;
  criticColumnId?: CriticColumnId | null;
  bookReviewIds?: BookReviewId[] | null;
}

export interface CriticFilter {
  id?: ValueFilter<CriticId, never> | null;
  name?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  favoriteLargePublisher?: EntityFilter<LargePublisher, LargePublisherId, FilterOf<LargePublisher>, null>;
  group?: EntityFilter<PublisherGroup, PublisherGroupId, FilterOf<PublisherGroup>, null>;
  criticColumn?: EntityFilter<CriticColumn, CriticColumnId, FilterOf<CriticColumn>, null | undefined>;
  bookReviews?: EntityFilter<BookReview, BookReviewId, FilterOf<BookReview>, null | undefined>;
}

export interface CriticGraphQLFilter {
  id?: ValueGraphQLFilter<CriticId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  favoriteLargePublisher?: EntityGraphQLFilter<LargePublisher, LargePublisherId, GraphQLFilterOf<LargePublisher>, null>;
  group?: EntityGraphQLFilter<PublisherGroup, PublisherGroupId, GraphQLFilterOf<PublisherGroup>, null>;
  criticColumn?: EntityGraphQLFilter<CriticColumn, CriticColumnId, GraphQLFilterOf<CriticColumn>, null | undefined>;
  bookReviews?: EntityGraphQLFilter<BookReview, BookReviewId, GraphQLFilterOf<BookReview>, null | undefined>;
}

export interface CriticOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  favoriteLargePublisher?: LargePublisherOrder;
  group?: PublisherGroupOrder;
}

export const criticConfig = new ConfigApi<Critic, Context>();

criticConfig.addRule(newRequiredRule("name"));
criticConfig.addRule(newRequiredRule("createdAt"));
criticConfig.addRule(newRequiredRule("updatedAt"));

export abstract class CriticCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "c";
  static readonly metadata: EntityMetadata<Critic>;

  declare readonly __orm: {
    filterType: CriticFilter;
    gqlFilterType: CriticGraphQLFilter;
    orderType: CriticOrder;
    optsType: CriticOpts;
    fieldsType: CriticFields;
    optIdsType: CriticIdsOpts;
    factoryOptsType: Parameters<typeof newCritic>[1];
  };

  constructor(em: EntityManager, opts: CriticOpts) {
    super(em, opts);
    setOpts(this as any as Critic, opts, { calledFromConstructor: true });
  }

  get id(): CriticId {
    return this.idMaybe || failNoIdYet("Critic");
  }

  get idMaybe(): CriticId | undefined {
    return toIdOf(criticMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("Critic");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get name(): string {
    return getField(this, "name");
  }

  set name(name: string) {
    setField(this, "name", cleanStringValue(name));
  }

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  set(opts: Partial<CriticOpts>): void {
    setOpts(this as any as Critic, opts);
  }

  setPartial(opts: PartialOrNull<CriticOpts>): void {
    setOpts(this as any as Critic, opts as OptsOf<Critic>, { partial: true });
  }

  get changes(): Changes<Critic> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<Critic>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Critic, fn, opts);
  }

  populate<const H extends LoadHint<Critic>>(hint: H): Promise<Loaded<Critic, H>>;
  populate<const H extends LoadHint<Critic>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Critic, H>>;
  populate<const H extends LoadHint<Critic>, V>(hint: H, fn: (c: Loaded<Critic, H>) => V): Promise<V>;
  populate<const H extends LoadHint<Critic>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (c: Loaded<Critic, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<Critic>, V>(
    hintOrOpts: any,
    fn?: (c: Loaded<Critic, H>) => V,
  ): Promise<Loaded<Critic, H> | V> {
    return this.em.populate(this as any as Critic, hintOrOpts, fn);
  }

  isLoaded<const H extends LoadHint<Critic>>(hint: H): this is Loaded<Critic, H> {
    return isLoaded(this as any as Critic, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<Critic>>(hint: H): Promise<JsonPayload<Critic, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get bookReviews(): Collection<Critic, BookReview> {
    return this.__data.relations.bookReviews ??= hasMany(
      this as any as Critic,
      bookReviewMeta,
      "bookReviews",
      "critic",
      "critic_id",
      undefined,
    );
  }

  get favoriteLargePublisher(): ManyToOneReference<Critic, LargePublisher, undefined> {
    return this.__data.relations.favoriteLargePublisher ??= hasOne(
      this as any as Critic,
      largePublisherMeta,
      "favoriteLargePublisher",
      "critics",
    );
  }

  get group(): ManyToOneReference<Critic, PublisherGroup, undefined> {
    return this.__data.relations.group ??= hasOne(this as any as Critic, publisherGroupMeta, "group", "critics");
  }

  get criticColumn(): OneToOneReference<Critic, CriticColumn> {
    return this.__data.relations.criticColumn ??= hasOneToOne(
      this as any as Critic,
      criticColumnMeta,
      "criticColumn",
      "critic",
      "critic_id",
    );
  }
}
