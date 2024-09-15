import {
  BaseEntity,
  type Changes,
  cleanStringValue,
  type Collection,
  ConfigApi,
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
  type ValueFilter,
  type ValueGraphQLFilter,
} from "joist-orm";
import { type Context } from "src/context";
import {
  ChildItem,
  type ChildItemId,
  childItemMeta,
  type Entity,
  EntityManager,
  newParentItem,
  ParentGroup,
  type ParentGroupId,
  parentGroupMeta,
  type ParentGroupOrder,
  ParentItem,
  parentItemMeta,
} from "../entities";

export type ParentItemId = Flavor<string, ParentItem>;

export interface ParentItemFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  parentGroup: { kind: "m2o"; type: ParentGroup; nullable: never; derived: false };
}

export interface ParentItemOpts {
  name?: string | null;
  parentGroup: ParentGroup | ParentGroupId;
  childItems?: ChildItem[];
}

export interface ParentItemIdsOpts {
  parentGroupId?: ParentGroupId | null;
  childItemIds?: ChildItemId[] | null;
}

export interface ParentItemFilter {
  id?: ValueFilter<ParentItemId, never> | null;
  name?: ValueFilter<string, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  parentGroup?: EntityFilter<ParentGroup, ParentGroupId, FilterOf<ParentGroup>, never>;
  childItems?: EntityFilter<ChildItem, ChildItemId, FilterOf<ChildItem>, null | undefined>;
}

export interface ParentItemGraphQLFilter {
  id?: ValueGraphQLFilter<ParentItemId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  parentGroup?: EntityGraphQLFilter<ParentGroup, ParentGroupId, GraphQLFilterOf<ParentGroup>, never>;
  childItems?: EntityGraphQLFilter<ChildItem, ChildItemId, GraphQLFilterOf<ChildItem>, null | undefined>;
}

export interface ParentItemOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  parentGroup?: ParentGroupOrder;
}

export const parentItemConfig = new ConfigApi<ParentItem, Context>();

parentItemConfig.addRule(newRequiredRule("createdAt"));
parentItemConfig.addRule(newRequiredRule("updatedAt"));
parentItemConfig.addRule(newRequiredRule("parentGroup"));

export abstract class ParentItemCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "pi";
  static readonly metadata: EntityMetadata<ParentItem>;

  declare readonly __orm: {
    entityType: ParentItem;
    filterType: ParentItemFilter;
    gqlFilterType: ParentItemGraphQLFilter;
    orderType: ParentItemOrder;
    optsType: ParentItemOpts;
    fieldsType: ParentItemFields;
    optIdsType: ParentItemIdsOpts;
    factoryOptsType: Parameters<typeof newParentItem>[1];
  };

  constructor(em: EntityManager, opts: ParentItemOpts) {
    super(em, opts);
    setOpts(this as any as ParentItem, opts, { calledFromConstructor: true });
  }

  get id(): ParentItemId {
    return this.idMaybe || failNoIdYet("ParentItem");
  }

  get idMaybe(): ParentItemId | undefined {
    return toIdOf(parentItemMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("ParentItem");
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
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   * @example
   * ```
   * entity.setPartial({
   *  firstName: 'foo' // updated
   *  lastName: undefined // do nothing
   *  age: null // unset, (i.e. set it as undefined)
   * })
   * ```
   * @see @{link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  set(opts: Partial<ParentItemOpts>): void {
    setOpts(this as any as ParentItem, opts);
  }

  /**
   * Partial update taking any subset of the entities fields.
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   * @example
   * ```
   * entity.setPartial({
   *  firstName: 'foo' // updated
   *  lastName: undefined // do nothing
   *  age: null // unset, (i.e. set it as undefined)
   * })
   * ```
   * @see @{link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setPartial(opts: PartialOrNull<ParentItemOpts>): void {
    setOpts(this as any as ParentItem, opts as OptsOf<ParentItem>, { partial: true });
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   * @see @{link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<ParentItem> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens
   */
  load<U, V>(fn: (lens: Lens<ParentItem>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as ParentItem, fn, opts);
  }

  /**
   * Traverse from this entity using a lens, and load the result
   * @see @{link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  populate<const H extends LoadHint<ParentItem>>(hint: H): Promise<Loaded<ParentItem, H>>;
  populate<const H extends LoadHint<ParentItem>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<ParentItem, H>>;
  populate<const H extends LoadHint<ParentItem>, V>(hint: H, fn: (pi: Loaded<ParentItem, H>) => V): Promise<V>;
  populate<const H extends LoadHint<ParentItem>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (pi: Loaded<ParentItem, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<ParentItem>, V>(
    hintOrOpts: any,
    fn?: (pi: Loaded<ParentItem, H>) => V,
  ): Promise<Loaded<ParentItem, H> | V> {
    return this.em.populate(this as any as ParentItem, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work. Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<ParentItem>>(hint: H): this is Loaded<ParentItem, H> {
    return isLoaded(this as any as ParentItem, hint);
  }

  /**
   * Build a type-safe, loadable and relation aware POJO from this entity, given a hint
   * Note: As the hint might load, this returns a Promise
   * @example
   * ```
   * const payload = await a.toJSON({
   *   id: true,
   *   books: { id: true, reviews: { rating: true } }
   * });
   * ```
   * @see @{link https://joist-orm.io/docs/advanced/json-payloads | Json Payloads} on the Joist docs
   */
  toJSON(): object;
  toJSON<const H extends ToJsonHint<ParentItem>>(hint: H): Promise<JsonPayload<ParentItem, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get childItems(): Collection<ParentItem, ChildItem> {
    return this.__data.relations.childItems ??= hasMany(
      this as any as ParentItem,
      childItemMeta,
      "childItems",
      "parentItem",
      "parent_item_id",
      undefined,
    );
  }

  get parentGroup(): ManyToOneReference<ParentItem, ParentGroup, never> {
    return this.__data.relations.parentGroup ??= hasOne(
      this as any as ParentItem,
      parentGroupMeta,
      "parentGroup",
      "parentItems",
    );
  }
}
