import {
  BaseEntity,
  Changes,
  cleanStringValue,
  Collection,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  EntityOrmField,
  failNoIdYet,
  FilterOf,
  Flavor,
  getField,
  getOrmField,
  GraphQLFilterOf,
  hasMany,
  hasOne,
  hasOneToOne,
  isLoaded,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  ManyToOneReference,
  newChangesProxy,
  newRequiredRule,
  OneToOneReference,
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
import {
  BookReview,
  BookReviewId,
  bookReviewMeta,
  Critic,
  CriticColumn,
  CriticColumnId,
  criticColumnMeta,
  criticMeta,
  Entity,
  EntityManager,
  LargePublisher,
  LargePublisherId,
  largePublisherMeta,
  LargePublisherOrder,
  newCritic,
  PublisherGroup,
  PublisherGroupId,
  publisherGroupMeta,
  PublisherGroupOrder,
} from "../entities";

export type CriticId = Flavor<string, Critic>;

export interface CriticFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
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

  declare readonly __orm: EntityOrmField & {
    filterType: CriticFilter;
    gqlFilterType: CriticGraphQLFilter;
    orderType: CriticOrder;
    optsType: CriticOpts;
    fieldsType: CriticFields;
    optIdsType: CriticIdsOpts;
    factoryOptsType: Parameters<typeof newCritic>[1];
  };

  constructor(em: EntityManager, opts: CriticOpts) {
    super(em, criticMeta, opts);
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

  populate<H extends LoadHint<Critic>>(hint: H): Promise<Loaded<Critic, H>>;
  populate<H extends LoadHint<Critic>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Critic, H>>;
  populate<H extends LoadHint<Critic>, V>(hint: H, fn: (c: Loaded<Critic, H>) => V): Promise<V>;
  populate<H extends LoadHint<Critic>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (c: Loaded<Critic, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<Critic>, V>(
    hintOrOpts: any,
    fn?: (c: Loaded<Critic, H>) => V,
  ): Promise<Loaded<Critic, H> | V> {
    return this.em.populate(this as any as Critic, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<Critic>>(hint: H): this is Loaded<Critic, H> {
    return isLoaded(this as any as Critic, hint);
  }

  get bookReviews(): Collection<Critic, BookReview> {
    const { relations } = getOrmField(this);
    return relations.bookReviews ??= hasMany(
      this as any as Critic,
      bookReviewMeta,
      "bookReviews",
      "critic",
      "critic_id",
      undefined,
    );
  }

  get favoriteLargePublisher(): ManyToOneReference<Critic, LargePublisher, undefined> {
    const { relations } = getOrmField(this);
    return relations.favoriteLargePublisher ??= hasOne(
      this as any as Critic,
      largePublisherMeta,
      "favoriteLargePublisher",
      "critics",
    );
  }

  get group(): ManyToOneReference<Critic, PublisherGroup, undefined> {
    const { relations } = getOrmField(this);
    return relations.group ??= hasOne(this as any as Critic, publisherGroupMeta, "group", "critics");
  }

  get criticColumn(): OneToOneReference<Critic, CriticColumn> {
    const { relations } = getOrmField(this);
    return relations.criticColumn ??= hasOneToOne(
      this as any as Critic,
      criticColumnMeta,
      "criticColumn",
      "critic",
      "critic_id",
    );
  }
}
