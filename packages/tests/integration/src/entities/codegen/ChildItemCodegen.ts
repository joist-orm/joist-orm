import {
  BaseEntity,
  type Changes,
  cleanStringValue,
  ConfigApi,
  type EntityFilter,
  type EntityGraphQLFilter,
  type EntityMetadata,
  failNoIdYet,
  type FilterOf,
  type Flavor,
  getField,
  type GraphQLFilterOf,
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
  ChildGroup,
  type ChildGroupId,
  childGroupMeta,
  type ChildGroupOrder,
  ChildItem,
  childItemMeta,
  type Entity,
  EntityManager,
  newChildItem,
  ParentItem,
  type ParentItemId,
  parentItemMeta,
  type ParentItemOrder,
} from "../entities";

export type ChildItemId = Flavor<string, ChildItem>;

export interface ChildItemFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  childGroup: { kind: "m2o"; type: ChildGroup; nullable: never; derived: false };
  parentItem: { kind: "m2o"; type: ParentItem; nullable: never; derived: false };
}

export interface ChildItemOpts {
  name?: string | null;
  childGroup: ChildGroup | ChildGroupId;
  parentItem: ParentItem | ParentItemId;
}

export interface ChildItemIdsOpts {
  childGroupId?: ChildGroupId | null;
  parentItemId?: ParentItemId | null;
}

export interface ChildItemFilter {
  id?: ValueFilter<ChildItemId, never> | null;
  name?: ValueFilter<string, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  childGroup?: EntityFilter<ChildGroup, ChildGroupId, FilterOf<ChildGroup>, never>;
  parentItem?: EntityFilter<ParentItem, ParentItemId, FilterOf<ParentItem>, never>;
}

export interface ChildItemGraphQLFilter {
  id?: ValueGraphQLFilter<ChildItemId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  childGroup?: EntityGraphQLFilter<ChildGroup, ChildGroupId, GraphQLFilterOf<ChildGroup>, never>;
  parentItem?: EntityGraphQLFilter<ParentItem, ParentItemId, GraphQLFilterOf<ParentItem>, never>;
}

export interface ChildItemOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  childGroup?: ChildGroupOrder;
  parentItem?: ParentItemOrder;
}

export const childItemConfig = new ConfigApi<ChildItem, Context>();

childItemConfig.addRule(newRequiredRule("createdAt"));
childItemConfig.addRule(newRequiredRule("updatedAt"));
childItemConfig.addRule(newRequiredRule("childGroup"));
childItemConfig.addRule(newRequiredRule("parentItem"));

export abstract class ChildItemCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "ci";
  static readonly metadata: EntityMetadata<ChildItem>;

  declare readonly __orm: {
    entityType: ChildItem;
    filterType: ChildItemFilter;
    gqlFilterType: ChildItemGraphQLFilter;
    orderType: ChildItemOrder;
    optsType: ChildItemOpts;
    fieldsType: ChildItemFields;
    optIdsType: ChildItemIdsOpts;
    factoryOptsType: Parameters<typeof newChildItem>[1];
  };

  constructor(em: EntityManager, opts: ChildItemOpts) {
    super(em, opts);
    setOpts(this as any as ChildItem, opts, { calledFromConstructor: true });
  }

  get id(): ChildItemId {
    return this.idMaybe || failNoIdYet("ChildItem");
  }

  get idMaybe(): ChildItemId | undefined {
    return toIdOf(childItemMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("ChildItem");
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
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  set(opts: Partial<ChildItemOpts>): void {
    setOpts(this as any as ChildItem, opts);
  }

  /**
   * Partial update taking any subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setPartial(opts: PartialOrNull<ChildItemOpts>): void {
    setOpts(this as any as ChildItem, opts as OptsOf<ChildItem>, { partial: true });
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<ChildItem> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<ChildItem>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as ChildItem, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/docs/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<ChildItem>>(hint: H): Promise<Loaded<ChildItem, H>>;
  populate<const H extends LoadHint<ChildItem>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<ChildItem, H>>;
  populate<const H extends LoadHint<ChildItem>, V>(hint: H, fn: (ci: Loaded<ChildItem, H>) => V): Promise<V>;
  populate<const H extends LoadHint<ChildItem>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (ci: Loaded<ChildItem, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<ChildItem>, V>(
    hintOrOpts: any,
    fn?: (ci: Loaded<ChildItem, H>) => V,
  ): Promise<Loaded<ChildItem, H> | V> {
    return this.em.populate(this as any as ChildItem, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<ChildItem>>(hint: H): this is Loaded<ChildItem, H> {
    return isLoaded(this as any as ChildItem, hint);
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
   * @see {@link https://joist-orm.io/docs/advanced/json-payloads | Json Payloads} on the Joist docs
   */
  toJSON(): object;
  toJSON<const H extends ToJsonHint<ChildItem>>(hint: H): Promise<JsonPayload<ChildItem, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get childGroup(): ManyToOneReference<ChildItem, ChildGroup, never> {
    return this.__data.relations.childGroup ??= hasOne(this, childGroupMeta, "childGroup", "childItems");
  }

  get parentItem(): ManyToOneReference<ChildItem, ParentItem, never> {
    return this.__data.relations.parentItem ??= hasOne(this, parentItemMeta, "parentItem", "childItems");
  }
}
