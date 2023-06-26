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
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import { Critic, CriticColumn, criticColumnMeta, CriticId, criticMeta, CriticOrder, newCriticColumn } from "./entities";
import type { EntityManager } from "./entities";
export type CriticColumnId = Flavor<string, "CriticColumn">;
export interface CriticColumnFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: false };
  name: { kind: "primitive"; type: string; unique: false; nullable: never };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  critic: { kind: "m2o"; type: Critic; nullable: never };
}
export interface CriticColumnOpts {
  name: string;
  critic: Critic | CriticId;
}
export interface CriticColumnIdsOpts {
  criticId?: CriticId | null;
}
export interface CriticColumnFilter {
  id?: ValueFilter<CriticColumnId, never>;
  name?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  critic?: EntityFilter<Critic, CriticId, FilterOf<Critic>, never>;
}
export interface CriticColumnGraphQLFilter {
  id?: ValueGraphQLFilter<CriticColumnId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  critic?: EntityGraphQLFilter<Critic, CriticId, GraphQLFilterOf<Critic>, never>;
}
export interface CriticColumnOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  critic?: CriticOrder;
}
export const criticColumnConfig = new ConfigApi<CriticColumn, Context>();
criticColumnConfig.addRule(newRequiredRule("name"));
criticColumnConfig.addRule(newRequiredRule("createdAt"));
criticColumnConfig.addRule(newRequiredRule("updatedAt"));
criticColumnConfig.addRule(newRequiredRule("critic"));
export abstract class CriticColumnCodegen extends BaseEntity<EntityManager> {
  static defaultValues: object = {};
  static readonly tagName = "cc";
  static readonly metadata: EntityMetadata<CriticColumn>;
  declare readonly __orm: EntityOrmField & {
    filterType: CriticColumnFilter;
    gqlFilterType: CriticColumnGraphQLFilter;
    orderType: CriticColumnOrder;
    optsType: CriticColumnOpts;
    fieldsType: CriticColumnFields;
    optIdsType: CriticColumnIdsOpts;
    factoryOptsType: Parameters<typeof newCriticColumn>[1];
  };
  readonly critic: ManyToOneReference<CriticColumn, Critic, never> = hasOne(criticMeta, "critic", "criticColumn");
  constructor(em: EntityManager, opts: CriticColumnOpts) {
    super(em, criticColumnMeta, CriticColumnCodegen.defaultValues, opts);
    setOpts((this as any) as CriticColumn, opts, { calledFromConstructor: true });
  }
  get id(): CriticColumnId | undefined {
    return this.idTagged;
  }
  get idOrFail(): CriticColumnId {
    return this.id || fail("CriticColumn has no id yet");
  }
  get idTagged(): CriticColumnId | undefined {
    return this.__orm.data["id"];
  }
  get idTaggedOrFail(): CriticColumnId {
    return this.idTagged || fail("CriticColumn has no id tagged yet");
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
  set(opts: Partial<CriticColumnOpts>): void {
    setOpts((this as any) as CriticColumn, opts);
  }
  setPartial(opts: PartialOrNull<CriticColumnOpts>): void {
    setOpts((this as any) as CriticColumn, opts as OptsOf<CriticColumn>, { partial: true });
  }
  get changes(): Changes<CriticColumn> {
    return (newChangesProxy(this) as any);
  }
  load<U, V>(fn: (lens: Lens<CriticColumn>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens((this as any) as CriticColumn, fn, opts);
  }
  populate<H extends LoadHint<CriticColumn>>(hint: H): Promise<Loaded<CriticColumn, H>>;
  populate<H extends LoadHint<CriticColumn>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<CriticColumn, H>>;
  populate<H extends LoadHint<CriticColumn>, V>(hint: H, fn: (cc: Loaded<CriticColumn, H>) => V): Promise<V>;
  populate<H extends LoadHint<CriticColumn>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (cc: Loaded<CriticColumn, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<CriticColumn>, V>(
    hintOrOpts: any,
    fn?: (cc: Loaded<CriticColumn, H>) => V,
  ): Promise<Loaded<CriticColumn, H> | V> {
    return this.em.populate((this as any) as CriticColumn, hintOrOpts, fn);
  }
  isLoaded<H extends LoadHint<CriticColumn>>(hint: H): this is Loaded<CriticColumn, H> {
    return isLoaded((this as any) as CriticColumn, hint);
  }
}
