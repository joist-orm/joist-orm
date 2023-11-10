import {
  BaseEntity,
  Changes,
  cleanStringValue,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
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
  TaggedId,
  toIdOf,
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
  LargePublisher,
  LargePublisherId,
  largePublisherMeta,
  LargePublisherOrder,
  newCritic,
  PublisherGroup,
  PublisherGroupId,
  publisherGroupMeta,
  PublisherGroupOrder,
} from "./entities";
import type { EntityManager } from "./entities";

export type CriticId = Flavor<string, Critic>;

export interface CriticFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: false };
  name: { kind: "primitive"; type: string; unique: false; nullable: never };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  favoriteLargePublisher: { kind: "m2o"; type: LargePublisher; nullable: undefined };
  group: { kind: "m2o"; type: PublisherGroup; nullable: undefined };
}

export interface CriticOpts {
  name: string;
  favoriteLargePublisher?: LargePublisher | LargePublisherId | null;
  group?: PublisherGroup | PublisherGroupId | null;
  criticColumn?: CriticColumn | null;
}

export interface CriticIdsOpts {
  favoriteLargePublisherId?: LargePublisherId | null;
  groupId?: PublisherGroupId | null;
  criticColumnId?: CriticColumnId | null;
}

export interface CriticFilter {
  id?: ValueFilter<CriticId, never>;
  name?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  favoriteLargePublisher?: EntityFilter<LargePublisher, LargePublisherId, FilterOf<LargePublisher>, null>;
  group?: EntityFilter<PublisherGroup, PublisherGroupId, FilterOf<PublisherGroup>, null>;
  criticColumn?: EntityFilter<CriticColumn, CriticColumnId, FilterOf<CriticColumn>, null | undefined>;
}

export interface CriticGraphQLFilter {
  id?: ValueGraphQLFilter<CriticId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  favoriteLargePublisher?: EntityGraphQLFilter<LargePublisher, LargePublisherId, GraphQLFilterOf<LargePublisher>, null>;
  group?: EntityGraphQLFilter<PublisherGroup, PublisherGroupId, GraphQLFilterOf<PublisherGroup>, null>;
  criticColumn?: EntityGraphQLFilter<CriticColumn, CriticColumnId, GraphQLFilterOf<CriticColumn>, null | undefined>;
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

export abstract class CriticCodegen extends BaseEntity<EntityManager, string> {
  static defaultValues: object = {};
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
    super(em, criticMeta, CriticCodegen.defaultValues, opts);
    setOpts(this as any as Critic, opts, { calledFromConstructor: true });
  }

  get id(): CriticId {
    return this.idMaybe || fail("Critic has no id yet");
  }

  get idMaybe(): CriticId | undefined {
    return toIdOf(criticMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || fail("Critic has no id yet");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return this.__orm.data["id"];
  }

  get name(): string {
    return this.__orm.data["name"];
  }

  set name(name: string) {
    setField(this, "name", cleanStringValue(name));
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

  get favoriteLargePublisher(): ManyToOneReference<Critic, LargePublisher, undefined> {
    const { relations } = this.__orm;
    if (relations.favoriteLargePublisher === undefined) {
      relations.favoriteLargePublisher = hasOne(
        this as any as Critic,
        largePublisherMeta,
        "favoriteLargePublisher",
        "critics",
      );
      if (this.isNewEntity) {
        relations.favoriteLargePublisher.initializeForNewEntity?.();
      }
    }
    return relations.favoriteLargePublisher as any;
  }

  get group(): ManyToOneReference<Critic, PublisherGroup, undefined> {
    const { relations } = this.__orm;
    if (relations.group === undefined) {
      relations.group = hasOne(this as any as Critic, publisherGroupMeta, "group", "critics");
      if (this.isNewEntity) {
        relations.group.initializeForNewEntity?.();
      }
    }
    return relations.group as any;
  }

  get criticColumn(): OneToOneReference<Critic, CriticColumn> {
    const { relations } = this.__orm;
    if (relations.criticColumn === undefined) {
      relations.criticColumn = hasOneToOne(
        this as any as Critic,
        criticColumnMeta,
        "criticColumn",
        "critic",
        "critic_id",
      );
      if (this.isNewEntity) {
        relations.criticColumn.initializeForNewEntity?.();
      }
    }
    return relations.criticColumn as any;
  }
}
