import {
  BaseEntity,
  type Changes,
  cleanStringValue,
  ConfigApi,
  type EntityMetadata,
  failNoIdYet,
  type Flavor,
  getField,
  isLoaded,
  type JsonPayload,
  type Lens,
  type Loaded,
  type LoadHint,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  type OptsOf,
  type OrderBy,
  type PartialOrNull,
  setField,
  setOpts,
  type TaggedId,
  toIdOf,
  toJSON,
  type ToJsonHint,
  type ValueFilter,
  type ValueGraphQLFilter,
} from "joist-orm";
import { type Context } from "src/context";
import { DatabaseOwner, databaseOwnerMeta, type Entity, EntityManager, newDatabaseOwner } from "../entities";

export type DatabaseOwnerId = Flavor<string, DatabaseOwner>;

export interface DatabaseOwnerFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
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
    entityType: DatabaseOwner;
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

  populate<const H extends LoadHint<DatabaseOwner>>(hint: H): Promise<Loaded<DatabaseOwner, H>>;
  populate<const H extends LoadHint<DatabaseOwner>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<DatabaseOwner, H>>;
  populate<const H extends LoadHint<DatabaseOwner>, V>(
    hint: H,
    fn: (databaseOwner: Loaded<DatabaseOwner, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<DatabaseOwner>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (databaseOwner: Loaded<DatabaseOwner, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<DatabaseOwner>, V>(
    hintOrOpts: any,
    fn?: (databaseOwner: Loaded<DatabaseOwner, H>) => V,
  ): Promise<Loaded<DatabaseOwner, H> | V> {
    return this.em.populate(this as any as DatabaseOwner, hintOrOpts, fn);
  }

  isLoaded<const H extends LoadHint<DatabaseOwner>>(hint: H): this is Loaded<DatabaseOwner, H> {
    return isLoaded(this as any as DatabaseOwner, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<DatabaseOwner>>(hint: H): Promise<JsonPayload<DatabaseOwner, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }
}
