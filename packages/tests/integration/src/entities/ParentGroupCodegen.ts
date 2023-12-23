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
  isLoaded,
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
  ChildGroup,
  ChildGroupId,
  childGroupMeta,
  Entity,
  EntityManager,
  newParentGroup,
  ParentGroup,
  parentGroupMeta,
  ParentItem,
  ParentItemId,
  parentItemMeta,
} from "./entities";

export type ParentGroupId = Flavor<string, ParentGroup>;

export interface ParentGroupFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
}

export interface ParentGroupOpts {
  name?: string | null;
  childGroups?: ChildGroup[];
  parentItems?: ParentItem[];
}

export interface ParentGroupIdsOpts {
  childGroupIds?: ChildGroupId[] | null;
  parentItemIds?: ParentItemId[] | null;
}

export interface ParentGroupFilter {
  id?: ValueFilter<ParentGroupId, never> | null;
  name?: ValueFilter<string, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  childGroups?: EntityFilter<ChildGroup, ChildGroupId, FilterOf<ChildGroup>, null | undefined>;
  parentItems?: EntityFilter<ParentItem, ParentItemId, FilterOf<ParentItem>, null | undefined>;
}

export interface ParentGroupGraphQLFilter {
  id?: ValueGraphQLFilter<ParentGroupId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  childGroups?: EntityGraphQLFilter<ChildGroup, ChildGroupId, GraphQLFilterOf<ChildGroup>, null | undefined>;
  parentItems?: EntityGraphQLFilter<ParentItem, ParentItemId, GraphQLFilterOf<ParentItem>, null | undefined>;
}

export interface ParentGroupOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
}

export const parentGroupConfig = new ConfigApi<ParentGroup, Context>();

parentGroupConfig.addRule(newRequiredRule("createdAt"));
parentGroupConfig.addRule(newRequiredRule("updatedAt"));

export abstract class ParentGroupCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static defaultValues: object = {};
  static readonly tagName = "parentGroup";
  static readonly metadata: EntityMetadata<ParentGroup>;

  declare readonly __orm: EntityOrmField & {
    filterType: ParentGroupFilter;
    gqlFilterType: ParentGroupGraphQLFilter;
    orderType: ParentGroupOrder;
    optsType: ParentGroupOpts;
    fieldsType: ParentGroupFields;
    optIdsType: ParentGroupIdsOpts;
    factoryOptsType: Parameters<typeof newParentGroup>[1];
  };

  constructor(em: EntityManager, opts: ParentGroupOpts) {
    super(em, parentGroupMeta, ParentGroupCodegen.defaultValues, opts);
    setOpts(this as any as ParentGroup, opts, { calledFromConstructor: true });
  }

  get id(): ParentGroupId {
    return this.idMaybe || failNoIdYet("ParentGroup");
  }

  get idMaybe(): ParentGroupId | undefined {
    return toIdOf(parentGroupMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("ParentGroup");
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

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  set(opts: Partial<ParentGroupOpts>): void {
    setOpts(this as any as ParentGroup, opts);
  }

  setPartial(opts: PartialOrNull<ParentGroupOpts>): void {
    setOpts(this as any as ParentGroup, opts as OptsOf<ParentGroup>, { partial: true });
  }

  get changes(): Changes<ParentGroup> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<ParentGroup>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as ParentGroup, fn, opts);
  }

  populate<H extends LoadHint<ParentGroup>>(hint: H): Promise<Loaded<ParentGroup, H>>;
  populate<H extends LoadHint<ParentGroup>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<ParentGroup, H>>;
  populate<H extends LoadHint<ParentGroup>, V>(hint: H, fn: (parentGroup: Loaded<ParentGroup, H>) => V): Promise<V>;
  populate<H extends LoadHint<ParentGroup>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (parentGroup: Loaded<ParentGroup, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<ParentGroup>, V>(
    hintOrOpts: any,
    fn?: (parentGroup: Loaded<ParentGroup, H>) => V,
  ): Promise<Loaded<ParentGroup, H> | V> {
    return this.em.populate(this as any as ParentGroup, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<ParentGroup>>(hint: H): this is Loaded<ParentGroup, H> {
    return isLoaded(this as any as ParentGroup, hint);
  }

  get childGroups(): Collection<ParentGroup, ChildGroup> {
    const { relations } = getOrmField(this);
    return relations.childGroups ??= hasMany(
      this as any as ParentGroup,
      childGroupMeta,
      "childGroups",
      "parentGroup",
      "parent_group_id",
      undefined,
    );
  }

  get parentItems(): Collection<ParentGroup, ParentItem> {
    const { relations } = getOrmField(this);
    return relations.parentItems ??= hasMany(
      this as any as ParentGroup,
      parentItemMeta,
      "parentItems",
      "parentGroup",
      "parent_group_id",
      undefined,
    );
  }
}
