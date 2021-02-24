import {
  Flavor,
  ValueFilter,
  ValueGraphQLFilter,
  OrderBy,
  ConfigApi,
  BaseEntity,
  EntityManager,
  setOpts,
  PartialOrNull,
  OptsOf,
  Changes,
  newChangesProxy,
  Lens,
  loadLens,
  LoadHint,
  Loaded,
  getEm,
  newRequiredRule,
  setField,
} from "joist-orm";
import { Critic, newCritic, criticMeta } from "./entities";
import { Context } from "src/context";

export type CriticId = Flavor<string, "Critic">;

export interface CriticOpts {
  name: string;
}

export interface CriticIdsOpts {}

export interface CriticFilter {
  id?: ValueFilter<CriticId, never>;
  name?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
}

export interface CriticGraphQLFilter {
  id?: ValueGraphQLFilter<CriticId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
}

export interface CriticOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
}

export const criticConfig = new ConfigApi<Critic, Context>();

criticConfig.addRule(newRequiredRule("name"));
criticConfig.addRule(newRequiredRule("createdAt"));
criticConfig.addRule(newRequiredRule("updatedAt"));

export abstract class CriticCodegen extends BaseEntity {
  readonly __types: {
    filterType: CriticFilter;
    gqlFilterType: CriticGraphQLFilter;
    orderType: CriticOrder;
    optsType: CriticOpts;
    optIdsType: CriticIdsOpts;
    factoryOptsType: Parameters<typeof newCritic>[1];
  } = null!;

  constructor(em: EntityManager, opts: CriticOpts) {
    super(em, criticMeta, {}, opts);
    setOpts((this as any) as Critic, opts, { calledFromConstructor: true });
  }

  get id(): CriticId | undefined {
    return this.__orm.data["id"];
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
    setOpts((this as any) as Critic, opts);
  }

  setPartial(opts: PartialOrNull<CriticOpts>): void {
    setOpts((this as any) as Critic, opts as OptsOf<Critic>, { partial: true });
  }

  get changes(): Changes<Critic> {
    return newChangesProxy((this as any) as Critic);
  }

  async load<U, V>(fn: (lens: Lens<Critic>) => Lens<U, V>): Promise<V> {
    return loadLens((this as any) as Critic, fn);
  }

  async populate<H extends LoadHint<Critic>>(hint: H): Promise<Loaded<Critic, H>> {
    return getEm(this).populate((this as any) as Critic, hint);
  }
}
