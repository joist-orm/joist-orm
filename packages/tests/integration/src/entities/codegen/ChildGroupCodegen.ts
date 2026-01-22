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
  hasMany,
  hasOne,
  isLoaded,
  type JsonPayload,
  type Lens,
  type Loaded,
  type LoadHint,
  loadLens,
  type ManyToOneReference,
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
  updatePartial,
  type ValueFilter,
  type ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import {
  type Child,
  type ChildGroup,
  childGroupMeta,
  type ChildId,
  type ChildItem,
  type ChildItemId,
  type ChildOrder,
  type Entity,
  EntityManager,
  newChildGroup,
  type ParentGroup,
  type ParentGroupId,
  type ParentGroupOrder,
} from "../entities";

export type ChildGroupId = Flavor<string, "ChildGroup">;

export interface ChildGroupFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  childGroup: { kind: "m2o"; type: Child; nullable: never; derived: false };
  parentGroup: { kind: "m2o"; type: ParentGroup; nullable: never; derived: false };
  childItems: { kind: "o2m"; type: ChildItem };
}

export interface ChildGroupOpts {
  name?: string | null;
  childGroup: Child | ChildId;
  parentGroup: ParentGroup | ParentGroupId;
  childItems?: ChildItem[];
}

export interface ChildGroupIdsOpts {
  childGroupId?: ChildId | null;
  parentGroupId?: ParentGroupId | null;
  childItemIds?: ChildItemId[] | null;
}

export interface ChildGroupFilter {
  id?: ValueFilter<ChildGroupId, never> | null;
  name?: ValueFilter<string, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  childGroup?: EntityFilter<Child, ChildId, FilterOf<Child>, never>;
  parentGroup?: EntityFilter<ParentGroup, ParentGroupId, FilterOf<ParentGroup>, never>;
  childItems?: EntityFilter<ChildItem, ChildItemId, FilterOf<ChildItem>, null | undefined>;
}

export interface ChildGroupGraphQLFilter {
  id?: ValueGraphQLFilter<ChildGroupId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  childGroup?: EntityGraphQLFilter<Child, ChildId, GraphQLFilterOf<Child>, never>;
  parentGroup?: EntityGraphQLFilter<ParentGroup, ParentGroupId, GraphQLFilterOf<ParentGroup>, never>;
  childItems?: EntityGraphQLFilter<ChildItem, ChildItemId, GraphQLFilterOf<ChildItem>, null | undefined>;
}

export interface ChildGroupOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  childGroup?: ChildOrder;
  parentGroup?: ParentGroupOrder;
}

export interface ChildGroupFactoryExtras {
}

export const childGroupConfig = new ConfigApi<ChildGroup, Context>();

childGroupConfig.addRule(newRequiredRule("createdAt"));
childGroupConfig.addRule(newRequiredRule("updatedAt"));
childGroupConfig.addRule(newRequiredRule("childGroup"));
childGroupConfig.addRule(newRequiredRule("parentGroup"));

declare module "joist-orm" {
  interface TypeMap {
    ChildGroup: {
      entityType: ChildGroup;
      filterType: ChildGroupFilter;
      gqlFilterType: ChildGroupGraphQLFilter;
      orderType: ChildGroupOrder;
      optsType: ChildGroupOpts;
      fieldsType: ChildGroupFields;
      optIdsType: ChildGroupIdsOpts;
      factoryExtrasType: ChildGroupFactoryExtras;
      factoryOptsType: Parameters<typeof newChildGroup>[1];
    };
  }
}

export abstract class ChildGroupCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "cg";
  static readonly metadata: EntityMetadata<ChildGroup>;

  declare readonly __type: { 0: "ChildGroup" };

  readonly childItems: Collection<ChildGroup, ChildItem> = hasMany();
  readonly childGroup: ManyToOneReference<ChildGroup, Child, never> = hasOne();
  readonly parentGroup: ManyToOneReference<ChildGroup, ParentGroup, never> = hasOne();

  get id(): ChildGroupId {
    return this.idMaybe || failNoIdYet("ChildGroup");
  }

  get idMaybe(): ChildGroupId | undefined {
    return toIdOf(childGroupMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("ChildGroup");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get name(): string | undefined {
    return getField(this, "name");
  }

  set name(name: string | undefined) {
    setField(this, "name", name);
  }

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
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
  set(opts: Partial<ChildGroupOpts>): void {
    setOpts(this as any as ChildGroup, opts);
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
  setPartial(opts: PartialOrNull<ChildGroupOpts>): void {
    setOpts(this as any as ChildGroup, opts as OptsOf<ChildGroup>, { partial: true });
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
  setDeepPartial(opts: DeepPartialOrNull<ChildGroup>): Promise<void> {
    return updatePartial(this as any as ChildGroup, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<ChildGroup> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<ChildGroup>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as ChildGroup, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<ChildGroup>>(hint: H): Promise<Loaded<ChildGroup, H>>;
  populate<const H extends LoadHint<ChildGroup>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<ChildGroup, H>>;
  populate<const H extends LoadHint<ChildGroup>, V>(hint: H, fn: (cg: Loaded<ChildGroup, H>) => V): Promise<V>;
  populate<const H extends LoadHint<ChildGroup>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (cg: Loaded<ChildGroup, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<ChildGroup>, V>(
    hintOrOpts: any,
    fn?: (cg: Loaded<ChildGroup, H>) => V,
  ): Promise<Loaded<ChildGroup, H> | V> {
    return this.em.populate(this as any as ChildGroup, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<ChildGroup>>(hint: H): this is Loaded<ChildGroup, H> {
    return isLoaded(this as any as ChildGroup, hint);
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
  toJSON<const H extends ToJsonHint<ChildGroup>>(hint: H): Promise<JsonPayload<ChildGroup, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }
}
