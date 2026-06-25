import {
  BaseEntity,
  type Changes,
  type Collection,
  ConfigApi,
  type DeepPartialOrNull,
  type EntityFilter,
  type EntityGraphQLFilter,
  type EntityMetadata,
  failNoIdYet,
  type FilterOf,
  type Flavor,
  getField,
  type GraphQLFilterOf,
  hasManyToMany,
  isLoaded,
  type JsonPayload,
  type Lens,
  type Loaded,
  type LoadHint,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  newScopeFn,
  type OptsOf,
  type OrderBy,
  type PartialOrNull,
  type Scope,
  setField,
  setOpts,
  type TaggedId,
  toIdOf,
  toJSON,
  type ToJsonHint,
  updatePartial,
  type ValueFilter,
  type ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import {
  type DatabaseOwner,
  databaseOwnerMeta,
  type Entity,
  EntityManager,
  newDatabaseOwner,
  type Tag,
  type TagId,
} from "../entities";

export type DatabaseOwnerId = Flavor<string, "DatabaseOwner">;

export interface DatabaseOwnerFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  tags: { kind: "m2m"; type: Tag };
}

export interface DatabaseOwnerOpts {
  name: string;
  tags?: Tag[];
}

export interface DatabaseOwnerIdsOpts {
  tagIds?: TagId[] | null;
}

export interface DatabaseOwnerFilter {
  id?: ValueFilter<DatabaseOwnerId, never> | null;
  name?: ValueFilter<string, never>;
  tags?: EntityFilter<Tag, TagId, FilterOf<Tag>, null | undefined>;
}

export interface DatabaseOwnerGraphQLFilter {
  id?: ValueGraphQLFilter<DatabaseOwnerId>;
  name?: ValueGraphQLFilter<string>;
  tags?: EntityGraphQLFilter<Tag, TagId, GraphQLFilterOf<Tag>, null | undefined>;
}

export interface DatabaseOwnerOrder {
  id?: OrderBy;
  name?: OrderBy;
}

export interface DatabaseOwnerFactoryExtras {
}

export interface DatabaseOwnerScopes {
}

export type DatabaseOwnerScope = Scope<DatabaseOwner, DatabaseOwnerScopes>;

export const databaseOwnerConfig = new ConfigApi<DatabaseOwner, Context>();

export const databaseOwnerScope = newScopeFn<DatabaseOwner, DatabaseOwnerScope>("DatabaseOwner");

databaseOwnerConfig.addRule(newRequiredRule("name"));

declare module "joist-core" {
  interface TypeMap {
    DatabaseOwner: {
      entityType: DatabaseOwner;
      filterType: DatabaseOwnerFilter;
      gqlFilterType: DatabaseOwnerGraphQLFilter;
      orderType: DatabaseOwnerOrder;
      optsType: DatabaseOwnerOpts;
      fieldsType: DatabaseOwnerFields;
      optIdsType: DatabaseOwnerIdsOpts;
      factoryExtrasType: DatabaseOwnerFactoryExtras;
      factoryOptsType: Parameters<typeof newDatabaseOwner>[1];
    };
  }
}

export abstract class DatabaseOwnerCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "do";
  static readonly metadata: EntityMetadata<DatabaseOwner>;

  declare readonly __type: { 0: "DatabaseOwner" };

  readonly tags: Collection<DatabaseOwner, Tag> = hasManyToMany(); // database_owner_to_tags databaseOwnerId tagId

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
    setField(this, "name", name);
  }

  /**
   * Partial update taking any subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  set(opts: Partial<DatabaseOwnerOpts>): void {
    setOpts(this as any as DatabaseOwner, opts);
  }

  /**
   * Partial update taking any subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setPartial(opts: PartialOrNull<DatabaseOwnerOpts>): void {
    setOpts(this as any as DatabaseOwner, opts as OptsOf<DatabaseOwner>, { partial: true });
  }

  /**
   * Partial update taking any nested subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setDeepPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   *   books: [{ title: "b1" }], // create a child book
   * });
   * ```
   * @see {@link https://joist-orm.io/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setDeepPartial(opts: DeepPartialOrNull<DatabaseOwner>): Promise<void> {
    return updatePartial(this as any as DatabaseOwner, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<DatabaseOwner> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<DatabaseOwner>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as DatabaseOwner, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
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

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<DatabaseOwner>>(hint: H): this is Loaded<DatabaseOwner, H> {
    return isLoaded(this as any as DatabaseOwner, hint);
  }

  /**
   * Build a type-safe, loadable and relation aware POJO from this entity, given a hint.
   *
   * Note: As the hint might load, this returns a Promise
   *
   * @example
   * ```
   * const payload = await a.toJSON({
   *   id: true,
   *   books: { id: true, reviews: { rating: true } }
   * });
   * ```
   * @see {@link https://joist-orm.io/advanced/json-payloads | Json Payloads} on the Joist docs
   */
  toJSON(): object;
  toJSON<const H extends ToJsonHint<DatabaseOwner>>(hint: H): Promise<JsonPayload<DatabaseOwner, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }
}
