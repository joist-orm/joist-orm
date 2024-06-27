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
  hasLargeMany,
  hasMany,
  isLoaded,
  type JsonPayload,
  type LargeCollection,
  type Lens,
  type Loaded,
  type LoadHint,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  type OptsOf,
  type OrderBy,
  type PartialOrNull,
  type ReactiveField,
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
  Critic,
  criticMeta,
  type Entity,
  EntityManager,
  newPublisherGroup,
  Publisher,
  PublisherGroup,
  publisherGroupMeta,
  type PublisherId,
  publisherMeta,
} from "../entities";

export type PublisherGroupId = Flavor<string, PublisherGroup>;

export interface PublisherGroupFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  numberOfBookReviews: { kind: "primitive"; type: number; unique: false; nullable: never; derived: true };
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
  numberOfBookReviews?: ValueFilter<number, never>;
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

publisherGroupConfig.addRule(newRequiredRule("numberOfBookReviews"));
publisherGroupConfig.addRule(newRequiredRule("createdAt"));
publisherGroupConfig.addRule(newRequiredRule("updatedAt"));

export abstract class PublisherGroupCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "pg";
  static readonly metadata: EntityMetadata<PublisherGroup>;

  declare readonly __orm: {
    filterType: PublisherGroupFilter;
    gqlFilterType: PublisherGroupGraphQLFilter;
    orderType: PublisherGroupOrder;
    optsType: PublisherGroupOpts;
    fieldsType: PublisherGroupFields;
    optIdsType: PublisherGroupIdsOpts;
    factoryOptsType: Parameters<typeof newPublisherGroup>[1];
  };

  constructor(em: EntityManager, opts: PublisherGroupOpts) {
    super(em, opts);
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

  abstract readonly numberOfBookReviews: ReactiveField<PublisherGroup, number>;

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

  populate<const H extends LoadHint<PublisherGroup>>(hint: H): Promise<Loaded<PublisherGroup, H>>;
  populate<const H extends LoadHint<PublisherGroup>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<PublisherGroup, H>>;
  populate<const H extends LoadHint<PublisherGroup>, V>(hint: H, fn: (pg: Loaded<PublisherGroup, H>) => V): Promise<V>;
  populate<const H extends LoadHint<PublisherGroup>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (pg: Loaded<PublisherGroup, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<PublisherGroup>, V>(
    hintOrOpts: any,
    fn?: (pg: Loaded<PublisherGroup, H>) => V,
  ): Promise<Loaded<PublisherGroup, H> | V> {
    return this.em.populate(this as any as PublisherGroup, hintOrOpts, fn);
  }

  isLoaded<const H extends LoadHint<PublisherGroup>>(hint: H): this is Loaded<PublisherGroup, H> {
    return isLoaded(this as any as PublisherGroup, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<PublisherGroup>>(hint: H): Promise<JsonPayload<PublisherGroup, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get publishers(): Collection<PublisherGroup, Publisher> {
    return this.__data.relations.publishers ??= hasMany(
      this as any as PublisherGroup,
      publisherMeta,
      "publishers",
      "group",
      "group_id",
      undefined,
    );
  }

  get critics(): LargeCollection<PublisherGroup, Critic> {
    return this.__data.relations.critics ??= hasLargeMany(
      this as any as PublisherGroup,
      criticMeta,
      "critics",
      "group",
      "group_id",
    );
  }
}
