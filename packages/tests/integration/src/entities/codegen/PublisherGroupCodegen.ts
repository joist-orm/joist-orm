import {
  BaseEntity,
  cleanStringValue,
  ConfigApi,
  failNoIdYet,
  getField,
  getInstanceData,
  hasLargeMany,
  hasMany,
  isLoaded,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  setField,
  setFieldValue,
  setOpts,
  toIdOf,
} from "joist-orm";
import type {
  Changes,
  Collection,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  LargeCollection,
  Lens,
  Loaded,
  LoadHint,
  OptsOf,
  OrderBy,
  PartialOrNull,
  ReactiveField,
  TaggedId,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import { Critic, criticMeta, EntityManager, newPublisherGroup, Publisher, PublisherGroup, publisherGroupMeta, publisherMeta } from "../entities";
import type { Entity, PublisherId } from "../entities";

export type PublisherGroupId = Flavor<string, PublisherGroup>;

export interface PublisherGroupFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never; value: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: undefined; value: string | undefined; derived: false };
  numberOfBookReviews: { kind: "primitive"; type: number; unique: false; nullable: never; value: number | never; derived: true };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; value: Date | never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; value: Date | never; derived: true };
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

  getFieldValue<K extends keyof PublisherGroupFields>(key: K): PublisherGroupFields[K]["value"] {
    return getField(this as any, key);
  }

  setFieldValue<K extends keyof PublisherGroupFields>(key: K, value: PublisherGroupFields[K]["value"]): void {
    setFieldValue(this, key, value);
  }

  set(opts: Partial<PublisherGroupOpts>): void {
    setOpts(this as any, opts);
  }

  setPartial(opts: PartialOrNull<PublisherGroupOpts>): void {
    setOpts(this as any, opts as OptsOf<PublisherGroup>, { partial: true });
  }

  get changes(): Changes<PublisherGroup> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<PublisherGroup>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as PublisherGroup, fn, opts);
  }

  populate<H extends LoadHint<PublisherGroup>>(hint: H): Promise<Loaded<PublisherGroup, H>>;
  populate<H extends LoadHint<PublisherGroup>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<PublisherGroup, H>>;
  populate<H extends LoadHint<PublisherGroup>, V>(hint: H, fn: (pg: Loaded<PublisherGroup, H>) => V): Promise<V>;
  populate<H extends LoadHint<PublisherGroup>, V>(opts: { hint: H; forceReload?: boolean }, fn: (pg: Loaded<PublisherGroup, H>) => V): Promise<V>;
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
    const { relations } = getInstanceData(this);
    return relations.publishers ??= hasMany(this as any as PublisherGroup, publisherMeta, "publishers", "group", "group_id", undefined);
  }

  get critics(): LargeCollection<PublisherGroup, Critic> {
    const { relations } = getInstanceData(this);
    return relations.critics ??= hasLargeMany(this as any as PublisherGroup, criticMeta, "critics", "group", "group_id");
  }
}
