import {
  BaseEntity,
  cleanStringValue,
  ConfigApi,
  failNoIdYet,
  getField,
  isLoaded,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  setField,
  setOpts,
  toIdOf,
} from "joist-orm";
import type {
  Changes,
  EntityMetadata,
  Flavor,
  Lens,
  Loaded,
  LoadHint,
  OptsOf,
  OrderBy,
  PartialOrNull,
  TaggedId,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import { DatabaseOwner, databaseOwnerMeta, EntityManager, newDatabaseOwner } from "../entities";
import type { Entity } from "../entities";

export type DatabaseOwnerId = Flavor<string, DatabaseOwner>;

export interface DatabaseOwnerFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
}

export interface DatabaseOwnerOpts {
  name: string;
}

export interface DatabaseOwnerIdsOpts {
}

export interface DatabaseOwnerFilter {
  id?: ValueFilter<DatabaseOwnerId, never> | null;
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

export abstract class DatabaseOwnerCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "do";
  static readonly metadata: EntityMetadata<DatabaseOwner>;

  declare readonly __orm: {
    filterType: DatabaseOwnerFilter;
    gqlFilterType: DatabaseOwnerGraphQLFilter;
    orderType: DatabaseOwnerOrder;
    optsType: DatabaseOwnerOpts;
    fieldsType: DatabaseOwnerFields;
    optIdsType: DatabaseOwnerIdsOpts;
    factoryOptsType: Parameters<typeof newDatabaseOwner>[1];
  };

  constructor(em: EntityManager, opts: DatabaseOwnerOpts) {
    super(em, opts);
    setOpts(this as any as DatabaseOwner, opts, { calledFromConstructor: true });
  }

  get id(): DatabaseOwnerId {
    return this.idMaybe || failNoIdYet("DatabaseOwner");
  }

  get idMaybe(): DatabaseOwnerId | undefined {
    return toIdOf(databaseOwnerMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("DatabaseOwner");
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
