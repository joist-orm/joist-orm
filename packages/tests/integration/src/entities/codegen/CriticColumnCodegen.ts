import {
  BaseEntity,
  cleanStringValue,
  ConfigApi,
  failNoIdYet,
  getField,
  getInstanceData,
  hasOne,
  isLoaded,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  setField,
  setOpts,
  toIdOf,
  toJSON,
} from "joist-orm";
import type {
  Changes,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  JsonHint,
  JsonPayload,
  Lens,
  Loaded,
  LoadHint,
  ManyToOneReference,
  OptsOf,
  OrderBy,
  PartialOrNull,
  TaggedId,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import { Critic, CriticColumn, criticColumnMeta, criticMeta, EntityManager, newCriticColumn } from "../entities";
import type { CriticId, CriticOrder, Entity } from "../entities";

export type CriticColumnId = Flavor<string, CriticColumn>;

export interface CriticColumnFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  critic: { kind: "m2o"; type: Critic; nullable: never; derived: false };
}

export interface CriticColumnOpts {
  name: string;
  critic: Critic | CriticId;
}

export interface CriticColumnIdsOpts {
  criticId?: CriticId | null;
}

export interface CriticColumnFilter {
  id?: ValueFilter<CriticColumnId, never> | null;
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

export abstract class CriticColumnCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "cc";
  static readonly metadata: EntityMetadata<CriticColumn>;

  declare readonly __orm: {
    filterType: CriticColumnFilter;
    gqlFilterType: CriticColumnGraphQLFilter;
    orderType: CriticColumnOrder;
    optsType: CriticColumnOpts;
    fieldsType: CriticColumnFields;
    optIdsType: CriticColumnIdsOpts;
    factoryOptsType: Parameters<typeof newCriticColumn>[1];
  };

  constructor(em: EntityManager, opts: CriticColumnOpts) {
    super(em, opts);
    setOpts(this as any as CriticColumn, opts, { calledFromConstructor: true });
  }

  get id(): CriticColumnId {
    return this.idMaybe || failNoIdYet("CriticColumn");
  }

  get idMaybe(): CriticColumnId | undefined {
    return toIdOf(criticColumnMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("CriticColumn");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get name(): string {
    return getField(this, "name");
  }

  set name(name: string) {
    setField(this, "name", cleanStringValue(name));
  }

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  set(opts: Partial<CriticColumnOpts>): void {
    setOpts(this as any as CriticColumn, opts);
  }

  setPartial(opts: PartialOrNull<CriticColumnOpts>): void {
    setOpts(this as any as CriticColumn, opts as OptsOf<CriticColumn>, { partial: true });
  }

  get changes(): Changes<CriticColumn> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<CriticColumn>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as CriticColumn, fn, opts);
  }

  populate<const H extends LoadHint<CriticColumn>>(hint: H): Promise<Loaded<CriticColumn, H>>;
  populate<const H extends LoadHint<CriticColumn>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<CriticColumn, H>>;
  populate<const H extends LoadHint<CriticColumn>, V>(hint: H, fn: (cc: Loaded<CriticColumn, H>) => V): Promise<V>;
  populate<const H extends LoadHint<CriticColumn>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (cc: Loaded<CriticColumn, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<CriticColumn>, V>(
    hintOrOpts: any,
    fn?: (cc: Loaded<CriticColumn, H>) => V,
  ): Promise<Loaded<CriticColumn, H> | V> {
    return this.em.populate(this as any as CriticColumn, hintOrOpts, fn);
  }

  isLoaded<const H extends LoadHint<CriticColumn>>(hint: H): this is Loaded<CriticColumn, H> {
    return isLoaded(this as any as CriticColumn, hint);
  }

  toJSON(): object;
  toJSON<const H extends JsonHint<CriticColumn>>(hint: H): Promise<JsonPayload<CriticColumn, H>>;
  toJSON(hint?: any): object {
    return hint ? toJSON(this, hint) : super.toJSON();
  }

  get critic(): ManyToOneReference<CriticColumn, Critic, never> {
    const { relations } = getInstanceData(this);
    return relations.critic ??= hasOne(this as any as CriticColumn, criticMeta, "critic", "criticColumn");
  }
}
