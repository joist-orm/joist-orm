import {
  Flavor,
  ValueFilter,
  ValueGraphQLFilter,
  OrderBy,
  ConfigApi,
  BaseEntity,
  EntityManager,
  setOpts,
  OptsOf,
  PartialOrNull,
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
import { JsonDatum, jsonDatumMeta } from "./entities";

export type JsonDatumId = Flavor<string, "JsonDatum">;

export interface JsonDatumOpts {
  notNullJson: unknown;
  nullableJson?: unknown | null;
}

export interface JsonDatumFilter {
  id?: ValueFilter<JsonDatumId, never>;
  notNullJson?: ValueFilter<unknown, never>;
  nullableJson?: ValueFilter<unknown, null | undefined>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
}

export interface JsonDatumGraphQLFilter {
  id?: ValueGraphQLFilter<JsonDatumId>;
  notNullJson?: ValueGraphQLFilter<unknown>;
  nullableJson?: ValueGraphQLFilter<unknown>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
}

export interface JsonDatumOrder {
  id?: OrderBy;
  notNullJson?: OrderBy;
  nullableJson?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
}

export const jsonDatumConfig = new ConfigApi<JsonDatum>();

jsonDatumConfig.addRule(newRequiredRule("notNullJson"));
jsonDatumConfig.addRule(newRequiredRule("createdAt"));
jsonDatumConfig.addRule(newRequiredRule("updatedAt"));

export abstract class JsonDatumCodegen extends BaseEntity {
  readonly __filterType: JsonDatumFilter = null!;
  readonly __gqlFilterType: JsonDatumGraphQLFilter = null!;
  readonly __orderType: JsonDatumOrder = null!;
  readonly __optsType: JsonDatumOpts = null!;

  constructor(em: EntityManager, opts: JsonDatumOpts) {
    super(em, jsonDatumMeta);
    this.set(opts as JsonDatumOpts, { calledFromConstructor: true } as any);
  }

  get id(): JsonDatumId | undefined {
    return this.__orm.data["id"];
  }

  get notNullJson(): unknown {
    return this.__orm.data["notNullJson"];
  }

  set notNullJson(notNullJson: unknown) {
    setField(this, "notNullJson", notNullJson);
  }

  get nullableJson(): unknown | undefined {
    return this.__orm.data["nullableJson"];
  }

  set nullableJson(nullableJson: unknown | undefined) {
    setField(this, "nullableJson", nullableJson);
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  set(values: Partial<JsonDatumOpts>, opts: { ignoreUndefined?: boolean } = {}): void {
    setOpts(this, values as OptsOf<this>, opts);
  }

  setUnsafe(values: PartialOrNull<JsonDatumOpts>, opts: { ignoreUndefined?: boolean } = {}): void {
    setOpts(this, values as OptsOf<this>, { ignoreUndefined: true, ...opts });
  }

  get changes(): Changes<JsonDatum> {
    return newChangesProxy((this as any) as JsonDatum);
  }

  async load<U, V>(fn: (lens: Lens<JsonDatum>) => Lens<U, V>): Promise<V> {
    return loadLens((this as any) as JsonDatum, fn);
  }

  async populate<H extends LoadHint<JsonDatum>>(hint: H): Promise<Loaded<JsonDatum, H>> {
    return getEm(this).populate((this as any) as JsonDatum, hint);
  }
}
