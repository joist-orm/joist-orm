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
  hasLargeMany,
  hasMany,
  isLoaded,
  LargeCollection,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  OptsOf,
  OrderBy,
  PartialOrNull,
  ReactiveField,
  setField,
  setOpts,
  TaggedId,
  toIdOf,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import {
  Critic,
  criticMeta,
  Entity,
  EntityManager,
  newPublisherGroup,
  Publisher,
  PublisherGroup,
  publisherGroupMeta,
  PublisherId,
  publisherMeta,
} from "../entities";

export type PublisherGroupId = Flavor<string, PublisherGroup>;

export interface PublisherGroupFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  numberOfBookReviews: { kind: "primitive"; type: number; unique: false; nullable: undefined; derived: true };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
}

export interface PublisherGroupOpts {
  name?: string | null;
  publishers?: Publisher[];
}

export interface PublisherGroupIdsOpts {
  publisherIds?: PublisherId[] | null;
}

export interface PublisherGroupFilter {
  id?: ValueFilter<PublisherGroupId, never> | null;
  name?: ValueFilter<string, null>;
  numberOfBookReviews?: ValueFilter<number, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  publishers?: EntityFilter<Publisher, PublisherId, FilterOf<Publisher>, null | undefined>;
}

export interface PublisherGroupGraphQLFilter {
  id?: ValueGraphQLFilter<PublisherGroupId>;
  name?: ValueGraphQLFilter<string>;
  numberOfBookReviews?: ValueGraphQLFilter<number>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  publishers?: EntityGraphQLFilter<Publisher, PublisherId, GraphQLFilterOf<Publisher>, null | undefined>;
}

export interface PublisherGroupOrder {
  id?: OrderBy;
  name?: OrderBy;
  numberOfBookReviews?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
}

export const publisherGroupConfig = new ConfigApi<PublisherGroup, Context>();

publisherGroupConfig.addRule(newRequiredRule("createdAt"));
publisherGroupConfig.addRule(newRequiredRule("updatedAt"));

export abstract class PublisherGroupCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "pg";
  static readonly metadata: EntityMetadata<PublisherGroup>;

  declare readonly __orm: EntityOrmField & {
    filterType: PublisherGroupFilter;
    gqlFilterType: PublisherGroupGraphQLFilter;
    orderType: PublisherGroupOrder;
    optsType: PublisherGroupOpts;
    fieldsType: PublisherGroupFields;
    optIdsType: PublisherGroupIdsOpts;
    factoryOptsType: Parameters<typeof newPublisherGroup>[1];
  };

  constructor(em: EntityManager, opts: PublisherGroupOpts) {
    super(em, publisherGroupMeta, opts);
    setOpts(this as any as PublisherGroup, opts, { calledFromConstructor: true });
  }

  get id(): PublisherGroupId {
    return this.idMaybe || failNoIdYet("PublisherGroup");
  }

  get idMaybe(): PublisherGroupId | undefined {
    return toIdOf(publisherGroupMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("PublisherGroup");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get name(): string | undefined {
    return getField(this, "name");
  }

  set name(name: string | undefined) {
    setField(this, "name", cleanStringValue(name));
  }

  abstract readonly numberOfBookReviews: ReactiveField<PublisherGroup, number | undefined>;

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  set(opts: Partial<PublisherGroupOpts>): void {
    setOpts(this as any as PublisherGroup, opts);
  }

  setPartial(opts: PartialOrNull<PublisherGroupOpts>): void {
    setOpts(this as any as PublisherGroup, opts as OptsOf<PublisherGroup>, { partial: true });
  }

  get changes(): Changes<PublisherGroup> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<PublisherGroup>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as PublisherGroup, fn, opts);
  }

  populate<H extends LoadHint<PublisherGroup>>(hint: H): Promise<Loaded<PublisherGroup, H>>;
  populate<H extends LoadHint<PublisherGroup>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<PublisherGroup, H>>;
  populate<H extends LoadHint<PublisherGroup>, V>(hint: H, fn: (pg: Loaded<PublisherGroup, H>) => V): Promise<V>;
  populate<H extends LoadHint<PublisherGroup>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (pg: Loaded<PublisherGroup, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<PublisherGroup>, V>(
    hintOrOpts: any,
    fn?: (pg: Loaded<PublisherGroup, H>) => V,
  ): Promise<Loaded<PublisherGroup, H> | V> {
    return this.em.populate(this as any as PublisherGroup, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<PublisherGroup>>(hint: H): this is Loaded<PublisherGroup, H> {
    return isLoaded(this as any as PublisherGroup, hint);
  }

  get publishers(): Collection<PublisherGroup, Publisher> {
    const { relations } = getOrmField(this);
    return relations.publishers ??= hasMany(
      this as any as PublisherGroup,
      publisherMeta,
      "publishers",
      "group",
      "group_id",
      undefined,
    );
  }

  get critics(): LargeCollection<PublisherGroup, Critic> {
    const { relations } = getOrmField(this);
    return relations.critics ??= hasLargeMany(
      this as any as PublisherGroup,
      criticMeta,
      "critics",
      "group",
      "group_id",
    );
  }
}
