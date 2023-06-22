import {
  BaseEntity,
  Changes,
  cleanStringValue,
  ConfigApi,
  EntityMetadata,
  EntityOrmField,
  fail,
  Flavor,
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
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import { DatabaseOwner, databaseOwnerMeta, newDatabaseOwner } from "./entities";
import type { EntityManager } from "./entities";

export type DatabaseOwnerId = Flavor<string, "DatabaseOwner">;

export interface DatabaseOwnerFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: false };
  name: { kind: "primitive"; type: string; unique: false; nullable: never };
}

export interface DatabaseOwnerOpts {
  name: string;
}

export interface DatabaseOwnerIdsOpts {
}

export interface DatabaseOwnerFilter {
  id?: ValueFilter<DatabaseOwnerId, never>;
  name?: ValueFilter<string, never>;
}

export interface DatabaseOwnerGraphQLFilter {
  id?: ValueGraphQLFilter<DatabaseOwnerId>;
  name?: ValueGraphQLFilter<string>;
}

export interface DatabaseOwnerOrder {
  id?: OrderBy;
  name?: OrderBy;
}

export const databaseOwnerConfig = new ConfigApi<DatabaseOwner, Context>();

databaseOwnerConfig.addRule(newRequiredRule("name"));

export abstract class DatabaseOwnerCodegen extends BaseEntity<EntityManager> {
  static defaultValues: object = {};
  static readonly tagName = "do";
  static readonly metadata: EntityMetadata<DatabaseOwner>;

  declare readonly __orm: EntityOrmField & {
    filterType: DatabaseOwnerFilter;
    gqlFilterType: DatabaseOwnerGraphQLFilter;
    orderType: DatabaseOwnerOrder;
    optsType: DatabaseOwnerOpts;
    fieldsType: DatabaseOwnerFields;
    optIdsType: DatabaseOwnerIdsOpts;
    factoryOptsType: Parameters<typeof newDatabaseOwner>[1];
  };

  constructor(em: EntityManager, opts: DatabaseOwnerOpts) {
    super(em, databaseOwnerMeta, DatabaseOwnerCodegen.defaultValues, opts);
    setOpts(this as any as DatabaseOwner, opts, { calledFromConstructor: true });
  }

  get id(): DatabaseOwnerId | undefined {
    return this.idTagged;
  }

  get idOrFail(): DatabaseOwnerId {
    return this.id || fail("DatabaseOwner has no id yet");
  }

  get idTagged(): DatabaseOwnerId | undefined {
    return this.__orm.data["id"];
  }

  get idTaggedOrFail(): DatabaseOwnerId {
    return this.idTagged || fail("DatabaseOwner has no id tagged yet");
  }

  get name(): string {
    return this.__orm.data["name"];
  }

  set name(name: string) {
    setField(this, "name", cleanStringValue(name));
  }

  set(opts: Partial<DatabaseOwnerOpts>): void {
    setOpts(this as any as DatabaseOwner, opts);
  }

  setPartial(opts: PartialOrNull<DatabaseOwnerOpts>): void {
    setOpts(this as any as DatabaseOwner, opts as OptsOf<DatabaseOwner>, { partial: true });
  }

  get changes(): Changes<DatabaseOwner> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<DatabaseOwner>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as DatabaseOwner, fn, opts);
  }

  populate<H extends LoadHint<DatabaseOwner>>(hint: H): Promise<Loaded<DatabaseOwner, H>>;
  populate<H extends LoadHint<DatabaseOwner>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<DatabaseOwner, H>>;
  populate<H extends LoadHint<DatabaseOwner>, V>(
    hint: H,
    fn: (databaseOwner: Loaded<DatabaseOwner, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<DatabaseOwner>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (databaseOwner: Loaded<DatabaseOwner, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<DatabaseOwner>, V>(
    hintOrOpts: any,
    fn?: (databaseOwner: Loaded<DatabaseOwner, H>) => V,
  ): Promise<Loaded<DatabaseOwner, H> | V> {
    return this.em.populate(this as any as DatabaseOwner, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<DatabaseOwner>>(hint: H): this is Loaded<DatabaseOwner, H> {
    return isLoaded(this as any as DatabaseOwner, hint);
  }
}
