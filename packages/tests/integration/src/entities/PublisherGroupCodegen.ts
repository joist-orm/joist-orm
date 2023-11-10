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
  fail,
  FilterOf,
  Flavor,
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
  newPublisherGroup,
  Publisher,
  PublisherGroup,
  publisherGroupMeta,
  PublisherId,
  publisherMeta,
} from "./entities";
import type { EntityManager } from "./entities";

export type PublisherGroupId = Flavor<string, PublisherGroup>;

export interface PublisherGroupFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: false };
  name: { kind: "primitive"; type: string; unique: false; nullable: undefined };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
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
  name?: ValueFilter<string, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  publishers?: EntityFilter<Publisher, PublisherId, FilterOf<Publisher>, null | undefined>;
}

export interface PublisherGroupGraphQLFilter {
  id?: ValueGraphQLFilter<PublisherGroupId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  publishers?: EntityGraphQLFilter<Publisher, PublisherId, GraphQLFilterOf<Publisher>, null | undefined>;
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

export abstract class PublisherGroupCodegen extends BaseEntity<EntityManager, string> {
  static defaultValues: object = {};
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
    super(em, publisherGroupMeta, PublisherGroupCodegen.defaultValues, opts);
    setOpts(this as any as PublisherGroup, opts, { calledFromConstructor: true });
  }

  get id(): PublisherGroupId {
    return this.idMaybe || fail("PublisherGroup has no id yet");
  }

  get idMaybe(): PublisherGroupId | undefined {
    return toIdOf(publisherGroupMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || fail("PublisherGroup has no id yet");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return this.__orm.data["id"];
  }

  get name(): string | undefined {
    return this.__orm.data["name"];
  }

  set name(name: string | undefined) {
    setField(this, "name", cleanStringValue(name));
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
    const { relations } = this.__orm;
    if (relations.publishers === undefined) {
      relations.publishers = hasMany(
        this as any as PublisherGroup,
        publisherMeta,
        "publishers",
        "group",
        "group_id",
        undefined,
      );
      if (this.isNewEntity) {
        relations.publishers.initializeForNewEntity?.();
      }
    }
    return relations.publishers as any;
  }

  get critics(): LargeCollection<PublisherGroup, Critic> {
    const { relations } = this.__orm;
    if (relations.critics === undefined) {
      relations.critics = hasLargeMany(this as any as PublisherGroup, criticMeta, "critics", "group", "group_id");
      if (this.isNewEntity) {
        relations.critics.initializeForNewEntity?.();
      }
    }
    return relations.critics as any;
  }
}
