import {
  BaseEntity,
  type Changes,
  cleanStringValue,
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
  updatePartial,
  type ValueFilter,
  type ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import {
  ChildGroup,
  type ChildGroupId,
  childGroupMeta,
  type Entity,
  EntityManager,
  newParentGroup,
  ParentGroup,
  parentGroupMeta,
  ParentItem,
  type ParentItemId,
  parentItemMeta,
} from "../entities";

export type ParentGroupId = Flavor<string, "ParentGroup">;

export interface ParentGroupFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  childGroups: { kind: "o2m"; type: ChildGroup };
  parentItems: { kind: "o2m"; type: ParentItem };
}

export interface ParentGroupOpts {
  name?: string | null;
  childGroups?: ChildGroup[];
  parentItems?: ParentItem[];
}

export interface ParentGroupIdsOpts {
  childGroupIds?: ChildGroupId[] | null;
  parentItemIds?: ParentItemId[] | null;
}

export interface ParentGroupFilter {
  id?: ValueFilter<ParentGroupId, never> | null;
  name?: ValueFilter<string, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  childGroups?: EntityFilter<ChildGroup, ChildGroupId, FilterOf<ChildGroup>, null | undefined>;
  parentItems?: EntityFilter<ParentItem, ParentItemId, FilterOf<ParentItem>, null | undefined>;
}

export interface ParentGroupGraphQLFilter {
  id?: ValueGraphQLFilter<ParentGroupId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  childGroups?: EntityGraphQLFilter<ChildGroup, ChildGroupId, GraphQLFilterOf<ChildGroup>, null | undefined>;
  parentItems?: EntityGraphQLFilter<ParentItem, ParentItemId, GraphQLFilterOf<ParentItem>, null | undefined>;
}

export interface ParentGroupOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
}

export interface ParentGroupFactoryExtras {
}

export const parentGroupConfig = new ConfigApi<ParentGroup, Context>();

parentGroupConfig.addRule(newRequiredRule("createdAt"));
parentGroupConfig.addRule(newRequiredRule("updatedAt"));

declare module "joist-orm" {
  interface TypeMap {
    ParentGroup: {
      entityType: ParentGroup;
      filterType: ParentGroupFilter;
      gqlFilterType: ParentGroupGraphQLFilter;
      orderType: ParentGroupOrder;
      optsType: ParentGroupOpts;
      fieldsType: ParentGroupFields;
      optIdsType: ParentGroupIdsOpts;
      factoryExtrasType: ParentGroupFactoryExtras;
      factoryOptsType: Parameters<typeof newParentGroup>[1];
    };
  }
}

export abstract class ParentGroupCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "parentGroup";
  static readonly metadata: EntityMetadata<ParentGroup>;

  declare readonly __type: { 0: "ParentGroup" };

  constructor(em: EntityManager, opts: ParentGroupOpts) {
    super(em, opts);
    setOpts(this as any as ParentGroup, opts, { calledFromConstructor: true });
  }

  get id(): ParentGroupId {
    return this.idMaybe || failNoIdYet("ParentGroup");
  }

  get idMaybe(): ParentGroupId | undefined {
    return toIdOf(parentGroupMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("ParentGroup");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get name(): string | undefined {
    return getField(this, "name");
  }

  set name(name: string | undefined) {
    setField(this, "name", cleanStringValue(name));
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
  set(opts: Partial<ParentGroupOpts>): void {
    setOpts(this as any as ParentGroup, opts);
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
  setPartial(opts: PartialOrNull<ParentGroupOpts>): void {
    setOpts(this as any as ParentGroup, opts as OptsOf<ParentGroup>, { partial: true });
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
  setDeepPartial(opts: DeepPartialOrNull<ParentGroup>): Promise<void> {
    return updatePartial(this as any as ParentGroup, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<ParentGroup> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<ParentGroup>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as ParentGroup, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<ParentGroup>>(hint: H): Promise<Loaded<ParentGroup, H>>;
  populate<const H extends LoadHint<ParentGroup>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<ParentGroup, H>>;
  populate<const H extends LoadHint<ParentGroup>, V>(
    hint: H,
    fn: (parentGroup: Loaded<ParentGroup, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<ParentGroup>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (parentGroup: Loaded<ParentGroup, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<ParentGroup>, V>(
    hintOrOpts: any,
    fn?: (parentGroup: Loaded<ParentGroup, H>) => V,
  ): Promise<Loaded<ParentGroup, H> | V> {
    return this.em.populate(this as any as ParentGroup, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<ParentGroup>>(hint: H): this is Loaded<ParentGroup, H> {
    return isLoaded(this as any as ParentGroup, hint);
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
  toJSON<const H extends ToJsonHint<ParentGroup>>(hint: H): Promise<JsonPayload<ParentGroup, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get childGroups(): Collection<ParentGroup, ChildGroup> {
    return this.__data.relations.childGroups ??= hasMany(
      this,
      childGroupMeta,
      "childGroups",
      "parentGroup",
      "parent_group_id",
      undefined,
    );
  }

  get parentItems(): Collection<ParentGroup, ParentItem> {
    return this.__data.relations.parentItems ??= hasMany(
      this,
      parentItemMeta,
      "parentItems",
      "parentGroup",
      "parent_group_id",
      undefined,
    );
  }
}
