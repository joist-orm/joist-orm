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
  GraphQLFilterOf,
  hasMany,
  hasOne,
  isLoaded,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  ManyToOneReference,
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
  Child,
  ChildGroup,
  childGroupMeta,
  ChildId,
  ChildItem,
  ChildItemId,
  childItemMeta,
  childMeta,
  ChildOrder,
  Entity,
  EntityManager,
  newChildGroup,
  ParentGroup,
  ParentGroupId,
  parentGroupMeta,
  ParentGroupOrder,
} from "./entities";

export type ChildGroupId = Flavor<string, ChildGroup>;

export interface ChildGroupFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: false };
  name: { kind: "primitive"; type: string; unique: false; nullable: undefined };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  childGroupId: { kind: "m2o"; type: Child; nullable: never };
  parentGroup: { kind: "m2o"; type: ParentGroup; nullable: never };
}

export interface ChildGroupOpts {
  name?: string | null;
  childGroupId: Child | ChildId;
  parentGroup: ParentGroup | ParentGroupId;
  childItems?: ChildItem[];
}

export interface ChildGroupIdsOpts {
  childGroupIdId?: ChildId | null;
  parentGroupId?: ParentGroupId | null;
  childItemIds?: ChildItemId[] | null;
}

export interface ChildGroupFilter {
  id?: ValueFilter<ChildGroupId, never> | null;
  name?: ValueFilter<string, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  childGroupId?: EntityFilter<Child, ChildId, FilterOf<Child>, never>;
  parentGroup?: EntityFilter<ParentGroup, ParentGroupId, FilterOf<ParentGroup>, never>;
  childItems?: EntityFilter<ChildItem, ChildItemId, FilterOf<ChildItem>, null | undefined>;
}

export interface ChildGroupGraphQLFilter {
  id?: ValueGraphQLFilter<ChildGroupId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  childGroupId?: EntityGraphQLFilter<Child, ChildId, GraphQLFilterOf<Child>, never>;
  parentGroup?: EntityGraphQLFilter<ParentGroup, ParentGroupId, GraphQLFilterOf<ParentGroup>, never>;
  childItems?: EntityGraphQLFilter<ChildItem, ChildItemId, GraphQLFilterOf<ChildItem>, null | undefined>;
}

export interface ChildGroupOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  childGroupId?: ChildOrder;
  parentGroup?: ParentGroupOrder;
}

export const childGroupConfig = new ConfigApi<ChildGroup, Context>();

childGroupConfig.addRule(newRequiredRule("createdAt"));
childGroupConfig.addRule(newRequiredRule("updatedAt"));
childGroupConfig.addRule(newRequiredRule("childGroupId"));
childGroupConfig.addRule(newRequiredRule("parentGroup"));

export abstract class ChildGroupCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static defaultValues: object = {};
  static readonly tagName = "cg";
  static readonly metadata: EntityMetadata<ChildGroup>;

  declare readonly __orm: EntityOrmField & {
    filterType: ChildGroupFilter;
    gqlFilterType: ChildGroupGraphQLFilter;
    orderType: ChildGroupOrder;
    optsType: ChildGroupOpts;
    fieldsType: ChildGroupFields;
    optIdsType: ChildGroupIdsOpts;
    factoryOptsType: Parameters<typeof newChildGroup>[1];
  };

  constructor(em: EntityManager, opts: ChildGroupOpts) {
    super(em, childGroupMeta, ChildGroupCodegen.defaultValues, opts);
    setOpts(this as any as ChildGroup, opts, { calledFromConstructor: true });
  }

  get id(): ChildGroupId {
    return this.idMaybe || failNoIdYet("ChildGroup");
  }

  get idMaybe(): ChildGroupId | undefined {
    return toIdOf(childGroupMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("ChildGroup");
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

  set(opts: Partial<ChildGroupOpts>): void {
    setOpts(this as any as ChildGroup, opts);
  }

  setPartial(opts: PartialOrNull<ChildGroupOpts>): void {
    setOpts(this as any as ChildGroup, opts as OptsOf<ChildGroup>, { partial: true });
  }

  get changes(): Changes<ChildGroup> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<ChildGroup>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as ChildGroup, fn, opts);
  }

  populate<H extends LoadHint<ChildGroup>>(hint: H): Promise<Loaded<ChildGroup, H>>;
  populate<H extends LoadHint<ChildGroup>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<ChildGroup, H>>;
  populate<H extends LoadHint<ChildGroup>, V>(hint: H, fn: (cg: Loaded<ChildGroup, H>) => V): Promise<V>;
  populate<H extends LoadHint<ChildGroup>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (cg: Loaded<ChildGroup, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<ChildGroup>, V>(
    hintOrOpts: any,
    fn?: (cg: Loaded<ChildGroup, H>) => V,
  ): Promise<Loaded<ChildGroup, H> | V> {
    return this.em.populate(this as any as ChildGroup, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<ChildGroup>>(hint: H): this is Loaded<ChildGroup, H> {
    return isLoaded(this as any as ChildGroup, hint);
  }

  get childItems(): Collection<ChildGroup, ChildItem> {
    const { relations } = this.__orm;
    return relations.childItems ??= hasMany(
      this as any as ChildGroup,
      childItemMeta,
      "childItems",
      "childGroup",
      "child_group_id",
      undefined,
    );
  }

  get childGroupId(): ManyToOneReference<ChildGroup, Child, never> {
    const { relations } = this.__orm;
    return relations.childGroupId ??= hasOne(this as any as ChildGroup, childMeta, "childGroupId", "groups");
  }

  get parentGroup(): ManyToOneReference<ChildGroup, ParentGroup, never> {
    const { relations } = this.__orm;
    return relations.parentGroup ??= hasOne(this as any as ChildGroup, parentGroupMeta, "parentGroup", "childGroups");
  }
}
