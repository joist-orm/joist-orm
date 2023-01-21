import {
  BaseEntity,
  Changes,
  Collection,
  ConfigApi,
  EntityOrmField,
  fail,
  Flavor,
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
  setField,
  setOpts,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import {
  Critic,
  criticMeta,
  newPublisherGroup,
  Publisher,
  PublisherGroup,
  publisherGroupMeta,
  PublisherId,
  publisherMeta,
} from "./entities";
import type { EntityManager } from "./entities";

export type PublisherGroupId = Flavor<string, "PublisherGroup">;

export interface PublisherGroupFields {
  name: string | undefined;
}

export interface PublisherGroupOpts {
  name?: string | null;
  publishers?: Publisher[];
}

export interface PublisherGroupIdsOpts {
  publisherIds?: PublisherId[] | null;
}

export interface PublisherGroupFilter {
  id?: ValueFilter<PublisherGroupId, never>;
  name?: ValueFilter<string, null | undefined>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
}

export interface PublisherGroupGraphQLFilter {
  id?: ValueGraphQLFilter<PublisherGroupId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
}

export interface PublisherGroupOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
}

export const publisherGroupConfig = new ConfigApi<PublisherGroup, Context>();

publisherGroupConfig.addRule(newRequiredRule("createdAt"));
publisherGroupConfig.addRule(newRequiredRule("updatedAt"));

export abstract class PublisherGroupCodegen extends BaseEntity<EntityManager> {
  static defaultValues: object = {};

  readonly __orm!: EntityOrmField & {
    filterType: PublisherGroupFilter;
    gqlFilterType: PublisherGroupGraphQLFilter;
    orderType: PublisherGroupOrder;
    optsType: PublisherGroupOpts;
    fieldsType: PublisherGroupFields;
    optIdsType: PublisherGroupIdsOpts;
    factoryOptsType: Parameters<typeof newPublisherGroup>[1];
  };

  readonly publishers: Collection<Publisher> = hasMany(publisherMeta, "publishers", "group", "group_id");

  readonly critics: LargeCollection<Critic> = hasLargeMany(criticMeta, "critics", "group", "group_id");

  constructor(em: EntityManager, opts: PublisherGroupOpts) {
    super(em, publisherGroupMeta, PublisherGroupCodegen.defaultValues, opts);
    setOpts(this as any as PublisherGroup, opts, { calledFromConstructor: true });
  }

  get id(): PublisherGroupId | undefined {
    return this.idTagged;
  }

  get idOrFail(): PublisherGroupId {
    return this.id || fail("PublisherGroup has no id yet");
  }

  get idTagged(): PublisherGroupId | undefined {
    return this.__orm.data["id"];
  }

  get idTaggedOrFail(): PublisherGroupId {
    return this.idTagged || fail("PublisherGroup has no id tagged yet");
  }

  get name(): string | undefined {
    return this.__orm.data["name"];
  }

  set name(name: string | undefined) {
    setField(this, "name", name);
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
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

  load<U, V>(fn: (lens: Lens<PublisherGroup>) => Lens<U, V>): Promise<V> {
    return loadLens(this as any as PublisherGroup, fn);
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
}
