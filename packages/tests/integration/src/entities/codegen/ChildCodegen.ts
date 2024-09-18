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
import {
  Child,
  ChildGroup,
  type ChildGroupId,
  childGroupMeta,
  childMeta,
  type Entity,
  EntityManager,
  newChild,
} from "../entities";

export type ChildId = Flavor<string, Child>;

export interface ChildFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
}

export interface ChildOpts {
  name?: string | null;
  groups?: ChildGroup[];
}

export interface ChildIdsOpts {
  groupIds?: ChildGroupId[] | null;
}

export interface ChildFilter {
  id?: ValueFilter<ChildId, never> | null;
  name?: ValueFilter<string, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  groups?: EntityFilter<ChildGroup, ChildGroupId, FilterOf<ChildGroup>, null | undefined>;
}

export interface ChildGraphQLFilter {
  id?: ValueGraphQLFilter<ChildId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  groups?: EntityGraphQLFilter<ChildGroup, ChildGroupId, GraphQLFilterOf<ChildGroup>, null | undefined>;
}

export interface ChildOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
}

export const childConfig = new ConfigApi<Child, Context>();

childConfig.addRule(newRequiredRule("createdAt"));
childConfig.addRule(newRequiredRule("updatedAt"));

export abstract class ChildCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "child";
  static readonly metadata: EntityMetadata<Child>;

  declare readonly __orm: {
    entityType: Child;
    filterType: ChildFilter;
    gqlFilterType: ChildGraphQLFilter;
    orderType: ChildOrder;
    optsType: ChildOpts;
    fieldsType: ChildFields;
    optIdsType: ChildIdsOpts;
    factoryOptsType: Parameters<typeof newChild>[1];
  };

  constructor(em: EntityManager, opts: ChildOpts) {
    super(em, opts);
    setOpts(this as any as Child, opts, { calledFromConstructor: true });
  }

  get id(): ChildId {
    return this.idMaybe || failNoIdYet("Child");
  }

  get idMaybe(): ChildId | undefined {
    return toIdOf(childMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("Child");
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
  set(opts: Partial<ChildOpts>): void {
    setOpts(this as any as Child, opts);
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
  setPartial(opts: PartialOrNull<ChildOpts>): void {
    setOpts(this as any as Child, opts as OptsOf<Child>, { partial: true });
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<Child> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<Child>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Child, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/docs/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<Child>>(hint: H): Promise<Loaded<Child, H>>;
  populate<const H extends LoadHint<Child>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Child, H>>;
  populate<const H extends LoadHint<Child>, V>(hint: H, fn: (child: Loaded<Child, H>) => V): Promise<V>;
  populate<const H extends LoadHint<Child>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (child: Loaded<Child, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<Child>, V>(
    hintOrOpts: any,
    fn?: (child: Loaded<Child, H>) => V,
  ): Promise<Loaded<Child, H> | V> {
    return this.em.populate(this as any as Child, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<Child>>(hint: H): this is Loaded<Child, H> {
    return isLoaded(this as any as Child, hint);
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
  toJSON<const H extends ToJsonHint<Child>>(hint: H): Promise<JsonPayload<Child, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get groups(): Collection<Child, ChildGroup> {
    return this.__data.relations.groups ??= hasMany(
      this as any as Child,
      childGroupMeta,
      "groups",
      "childGroupId",
      "child_id_group_id",
      undefined,
    );
  }
}
