import {
  BaseEntity,
  Changes,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityOrmField,
  fail,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
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
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import {
  Critic,
  CriticColumn,
  CriticColumnId,
  criticColumnMeta,
  criticMeta,
  newCritic,
  PublisherGroup,
  PublisherGroupId,
  publisherGroupMeta,
  PublisherGroupOrder,
} from "./entities";
import type { EntityManager } from "./entities";

export type CriticId = Flavor<string, "Critic">;

export interface CriticFields {
  name: string;
  group: PublisherGroup | undefined;
}

export interface CriticOpts {
  name: string;
  group?: PublisherGroup | PublisherGroupId | null;
  criticColumn?: CriticColumn | null;
}

export interface CriticIdsOpts {
  groupId?: PublisherGroupId | null;
  criticColumnId?: CriticColumnId | null;
}

export interface CriticFilter {
  id?: ValueFilter<CriticId, never>;
  name?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  group?: EntityFilter<PublisherGroup, PublisherGroupId, FilterOf<PublisherGroup>, null | undefined>;
  criticColumn?: EntityFilter<CriticColumn, CriticColumnId, FilterOf<CriticColumn>, null | undefined>;
}

export interface CriticGraphQLFilter {
  id?: ValueGraphQLFilter<CriticId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  group?: EntityGraphQLFilter<PublisherGroup, PublisherGroupId, GraphQLFilterOf<PublisherGroup>, null | undefined>;
  criticColumn?: EntityGraphQLFilter<CriticColumn, CriticColumnId, GraphQLFilterOf<CriticColumn>, null | undefined>;
}

export interface CriticOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  group?: PublisherGroupOrder;
}

export const criticConfig = new ConfigApi<Critic, Context>();

criticConfig.addRule(newRequiredRule("name"));
criticConfig.addRule(newRequiredRule("createdAt"));
criticConfig.addRule(newRequiredRule("updatedAt"));

export abstract class CriticCodegen extends BaseEntity<EntityManager> {
  static defaultValues: object = {};

  declare readonly __orm: EntityOrmField & {
    filterType: CriticFilter;
    gqlFilterType: CriticGraphQLFilter;
    orderType: CriticOrder;
    optsType: CriticOpts;
    fieldsType: CriticFields;
    optIdsType: CriticIdsOpts;
    factoryOptsType: Parameters<typeof newCritic>[1];
  };

  readonly group: ManyToOneReference<Critic, PublisherGroup, undefined> = hasOne(
    publisherGroupMeta,
    "group",
    "critics",
  );

  readonly criticColumn: OneToOneReference<Critic, CriticColumn> = hasOneToOne(
    criticColumnMeta,
    "criticColumn",
    "critic",
    "critic_id",
  );

  constructor(em: EntityManager, opts: CriticOpts) {
    super(em, criticMeta, CriticCodegen.defaultValues, opts);
    setOpts(this as any as Critic, opts, { calledFromConstructor: true });
  }

  get id(): CriticId | undefined {
    return this.idTagged;
  }

  get idOrFail(): CriticId {
    return this.id || fail("Critic has no id yet");
  }

  get idTagged(): CriticId | undefined {
    return this.__orm.data["id"];
  }

  get idTaggedOrFail(): CriticId {
    return this.idTagged || fail("Critic has no id tagged yet");
  }

  get name(): string {
    return this.__orm.data["name"];
  }

  set name(name: string) {
    setField(this, "name", name);
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
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

  load<U, V>(fn: (lens: Lens<Critic>) => Lens<U, V>): Promise<V> {
    return loadLens(this as any as Critic, fn);
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
}
