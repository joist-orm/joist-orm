import {
  BaseEntity,
  Changes,
  cleanStringValue,
  ConfigApi,
  EntityMetadata,
  EntityOrmField,
  failNoIdYet,
  Flavor,
  getField,
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
import { AuthorStat, authorStatMeta, Entity, EntityManager, newAuthorStat } from "../entities";

export type AuthorStatId = Flavor<string, AuthorStat>;

export interface AuthorStatFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  smallint: { kind: "primitive"; type: number; unique: false; nullable: never; derived: false };
  integer: { kind: "primitive"; type: number; unique: false; nullable: never; derived: false };
  nullableInteger: { kind: "primitive"; type: number; unique: false; nullable: undefined; derived: false };
  bigint: { kind: "primitive"; type: bigint; unique: false; nullable: never; derived: false };
  decimal: { kind: "primitive"; type: number; unique: false; nullable: never; derived: false };
  real: { kind: "primitive"; type: number; unique: false; nullable: never; derived: false };
  smallserial: { kind: "primitive"; type: number; unique: false; nullable: never; derived: false };
  serial: { kind: "primitive"; type: number; unique: false; nullable: never; derived: false };
  bigserial: { kind: "primitive"; type: bigint; unique: false; nullable: never; derived: false };
  doublePrecision: { kind: "primitive"; type: number; unique: false; nullable: never; derived: false };
  nullableText: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  json: { kind: "primitive"; type: Object; unique: false; nullable: undefined; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
}

export interface AuthorStatOpts {
  smallint: number;
  integer: number;
  nullableInteger?: number | null;
  bigint: bigint;
  decimal: number;
  real: number;
  smallserial: number;
  serial: number;
  bigserial: bigint;
  doublePrecision: number;
  nullableText?: string | null;
  json?: Object | null;
}

export interface AuthorStatIdsOpts {
}

export interface AuthorStatFilter {
  id?: ValueFilter<AuthorStatId, never> | null;
  smallint?: ValueFilter<number, never>;
  integer?: ValueFilter<number, never>;
  nullableInteger?: ValueFilter<number, null>;
  bigint?: ValueFilter<bigint, never>;
  decimal?: ValueFilter<number, never>;
  real?: ValueFilter<number, never>;
  smallserial?: ValueFilter<number, never>;
  serial?: ValueFilter<number, never>;
  bigserial?: ValueFilter<bigint, never>;
  doublePrecision?: ValueFilter<number, never>;
  nullableText?: ValueFilter<string, null>;
  json?: ValueFilter<Object, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
}

export interface AuthorStatGraphQLFilter {
  id?: ValueGraphQLFilter<AuthorStatId>;
  smallint?: ValueGraphQLFilter<number>;
  integer?: ValueGraphQLFilter<number>;
  nullableInteger?: ValueGraphQLFilter<number>;
  bigint?: ValueGraphQLFilter<bigint>;
  decimal?: ValueGraphQLFilter<number>;
  real?: ValueGraphQLFilter<number>;
  smallserial?: ValueGraphQLFilter<number>;
  serial?: ValueGraphQLFilter<number>;
  bigserial?: ValueGraphQLFilter<bigint>;
  doublePrecision?: ValueGraphQLFilter<number>;
  nullableText?: ValueGraphQLFilter<string>;
  json?: ValueGraphQLFilter<Object>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
}

export interface AuthorStatOrder {
  id?: OrderBy;
  smallint?: OrderBy;
  integer?: OrderBy;
  nullableInteger?: OrderBy;
  bigint?: OrderBy;
  decimal?: OrderBy;
  real?: OrderBy;
  smallserial?: OrderBy;
  serial?: OrderBy;
  bigserial?: OrderBy;
  doublePrecision?: OrderBy;
  nullableText?: OrderBy;
  json?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
}

export const authorStatConfig = new ConfigApi<AuthorStat, Context>();

authorStatConfig.addRule(newRequiredRule("smallint"));
authorStatConfig.addRule(newRequiredRule("integer"));
authorStatConfig.addRule(newRequiredRule("bigint"));
authorStatConfig.addRule(newRequiredRule("decimal"));
authorStatConfig.addRule(newRequiredRule("real"));
authorStatConfig.addRule(newRequiredRule("smallserial"));
authorStatConfig.addRule(newRequiredRule("serial"));
authorStatConfig.addRule(newRequiredRule("bigserial"));
authorStatConfig.addRule(newRequiredRule("doublePrecision"));
authorStatConfig.addRule(newRequiredRule("createdAt"));
authorStatConfig.addRule(newRequiredRule("updatedAt"));

export abstract class AuthorStatCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "as";
  static readonly metadata: EntityMetadata<AuthorStat>;

  declare readonly __orm: EntityOrmField & {
    filterType: AuthorStatFilter;
    gqlFilterType: AuthorStatGraphQLFilter;
    orderType: AuthorStatOrder;
    optsType: AuthorStatOpts;
    fieldsType: AuthorStatFields;
    optIdsType: AuthorStatIdsOpts;
    factoryOptsType: Parameters<typeof newAuthorStat>[1];
  };

  constructor(em: EntityManager, opts: AuthorStatOpts) {
    super(em, authorStatMeta, opts);
    setOpts(this as any as AuthorStat, opts, { calledFromConstructor: true });
  }

  get id(): AuthorStatId {
    return this.idMaybe || failNoIdYet("AuthorStat");
  }

  get idMaybe(): AuthorStatId | undefined {
    return toIdOf(authorStatMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("AuthorStat");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get smallint(): number {
    return getField(this, "smallint");
  }

  set smallint(smallint: number) {
    setField(this, "smallint", smallint);
  }

  get integer(): number {
    return getField(this, "integer");
  }

  set integer(integer: number) {
    setField(this, "integer", integer);
  }

  get nullableInteger(): number | undefined {
    return getField(this, "nullableInteger");
  }

  set nullableInteger(nullableInteger: number | undefined) {
    setField(this, "nullableInteger", nullableInteger);
  }

  get bigint(): bigint {
    return getField(this, "bigint");
  }

  set bigint(bigint: bigint) {
    setField(this, "bigint", bigint);
  }

  get decimal(): number {
    return getField(this, "decimal");
  }

  set decimal(decimal: number) {
    setField(this, "decimal", decimal);
  }

  get real(): number {
    return getField(this, "real");
  }

  set real(real: number) {
    setField(this, "real", real);
  }

  get smallserial(): number {
    return getField(this, "smallserial");
  }

  set smallserial(smallserial: number) {
    setField(this, "smallserial", smallserial);
  }

  get serial(): number {
    return getField(this, "serial");
  }

  set serial(serial: number) {
    setField(this, "serial", serial);
  }

  get bigserial(): bigint {
    return getField(this, "bigserial");
  }

  set bigserial(bigserial: bigint) {
    setField(this, "bigserial", bigserial);
  }

  get doublePrecision(): number {
    return getField(this, "doublePrecision");
  }

  set doublePrecision(doublePrecision: number) {
    setField(this, "doublePrecision", doublePrecision);
  }

  get nullableText(): string | undefined {
    return getField(this, "nullableText");
  }

  set nullableText(nullableText: string | undefined) {
    setField(this, "nullableText", cleanStringValue(nullableText));
  }

  get json(): Object | undefined {
    return getField(this, "json");
  }

  set json(json: Object | undefined) {
    setField(this, "json", json);
  }

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  set(opts: Partial<AuthorStatOpts>): void {
    setOpts(this as any as AuthorStat, opts);
  }

  setPartial(opts: PartialOrNull<AuthorStatOpts>): void {
    setOpts(this as any as AuthorStat, opts as OptsOf<AuthorStat>, { partial: true });
  }

  get changes(): Changes<AuthorStat> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<AuthorStat>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as AuthorStat, fn, opts);
  }

  populate<H extends LoadHint<AuthorStat>>(hint: H): Promise<Loaded<AuthorStat, H>>;
  populate<H extends LoadHint<AuthorStat>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<AuthorStat, H>>;
  populate<H extends LoadHint<AuthorStat>, V>(hint: H, fn: (as: Loaded<AuthorStat, H>) => V): Promise<V>;
  populate<H extends LoadHint<AuthorStat>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (as: Loaded<AuthorStat, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<AuthorStat>, V>(
    hintOrOpts: any,
    fn?: (as: Loaded<AuthorStat, H>) => V,
  ): Promise<Loaded<AuthorStat, H> | V> {
    return this.em.populate(this as any as AuthorStat, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<AuthorStat>>(hint: H): this is Loaded<AuthorStat, H> {
    return isLoaded(this as any as AuthorStat, hint);
  }
}
