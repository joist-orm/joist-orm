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
  Child,
  ChildGroup,
  ChildGroupId,
  childGroupMeta,
  childMeta,
  Entity,
  EntityManager,
  newChild,
} from "./entities";

export type ChildId = Flavor<string, Child>;

export interface ChildFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: false };
  name: { kind: "primitive"; type: string; unique: false; nullable: undefined };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
}

export interface ChildOpts {
  name?: string | null;
  groups?: ChildGroup[];
}

export interface ChildIdsOpts {
  groupIds?: ChildGroupId[] | null;
}

export interface ChildFilter {
  id?: ValueFilter<ChildId, never> | null;
  name?: ValueFilter<string, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  groups?: EntityFilter<ChildGroup, ChildGroupId, FilterOf<ChildGroup>, null | undefined>;
}

export interface ChildGraphQLFilter {
  id?: ValueGraphQLFilter<ChildId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  groups?: EntityGraphQLFilter<ChildGroup, ChildGroupId, GraphQLFilterOf<ChildGroup>, null | undefined>;
}

export interface ChildOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
}

export const childConfig = new ConfigApi<Child, Context>();

childConfig.addRule(newRequiredRule("createdAt"));
childConfig.addRule(newRequiredRule("updatedAt"));

export abstract class ChildCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static defaultValues: object = {};
  static readonly tagName = "child";
  static readonly metadata: EntityMetadata<Child>;

  declare readonly __orm: EntityOrmField & {
    filterType: ChildFilter;
    gqlFilterType: ChildGraphQLFilter;
    orderType: ChildOrder;
    optsType: ChildOpts;
    fieldsType: ChildFields;
    optIdsType: ChildIdsOpts;
    factoryOptsType: Parameters<typeof newChild>[1];
  };

  constructor(em: EntityManager, opts: ChildOpts) {
    super(em, childMeta, ChildCodegen.defaultValues, opts);
    setOpts(this as any as Child, opts, { calledFromConstructor: true });
  }

  get id(): ChildId {
    return this.idMaybe || failNoIdYet("Child");
  }

  get idMaybe(): ChildId | undefined {
    return toIdOf(childMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("Child");
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

  set(opts: Partial<ChildOpts>): void {
    setOpts(this as any as Child, opts);
  }

  setPartial(opts: PartialOrNull<ChildOpts>): void {
    setOpts(this as any as Child, opts as OptsOf<Child>, { partial: true });
  }

  get changes(): Changes<Child> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<Child>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Child, fn, opts);
  }

  populate<H extends LoadHint<Child>>(hint: H): Promise<Loaded<Child, H>>;
  populate<H extends LoadHint<Child>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Child, H>>;
  populate<H extends LoadHint<Child>, V>(hint: H, fn: (child: Loaded<Child, H>) => V): Promise<V>;
  populate<H extends LoadHint<Child>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (child: Loaded<Child, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<Child>, V>(
    hintOrOpts: any,
    fn?: (child: Loaded<Child, H>) => V,
  ): Promise<Loaded<Child, H> | V> {
    return this.em.populate(this as any as Child, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<Child>>(hint: H): this is Loaded<Child, H> {
    return isLoaded(this as any as Child, hint);
  }

  get groups(): Collection<Child, ChildGroup> {
    const { relations } = this.__orm;
    return relations.groups ??= hasMany(
      this as any as Child,
      childGroupMeta,
      "groups",
      "childGroupId",
      "child_id_group_id",
      undefined,
    );
  }
}
