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
  Critic,
  CriticColumn,
  criticColumnMeta,
  type CriticId,
  criticMeta,
  type CriticOrder,
  type Entity,
  EntityManager,
  newCriticColumn,
} from "../entities";

export type CriticColumnId = Flavor<string, CriticColumn>;

export interface CriticColumnFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  critic: { kind: "m2o"; type: Critic; nullable: never; derived: false };
}

export interface CriticColumnOpts {
  name: string;
  critic: Critic | CriticId;
}

export interface CriticColumnIdsOpts {
  criticId?: CriticId | null;
}

export interface CriticColumnFilter {
  id?: ValueFilter<CriticColumnId, never> | null;
  name?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  critic?: EntityFilter<Critic, CriticId, FilterOf<Critic>, never>;
}

export interface CriticColumnGraphQLFilter {
  id?: ValueGraphQLFilter<CriticColumnId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  critic?: EntityGraphQLFilter<Critic, CriticId, GraphQLFilterOf<Critic>, never>;
}

export interface CriticColumnOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  critic?: CriticOrder;
}

export const criticColumnConfig = new ConfigApi<CriticColumn, Context>();

criticColumnConfig.addRule(newRequiredRule("name"));
criticColumnConfig.addRule(newRequiredRule("createdAt"));
criticColumnConfig.addRule(newRequiredRule("updatedAt"));
criticColumnConfig.addRule(newRequiredRule("critic"));

export abstract class CriticColumnCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "cc";
  static readonly metadata: EntityMetadata<CriticColumn>;

  declare readonly __orm: {
    entityType: CriticColumn;
    filterType: CriticColumnFilter;
    gqlFilterType: CriticColumnGraphQLFilter;
    orderType: CriticColumnOrder;
    optsType: CriticColumnOpts;
    fieldsType: CriticColumnFields;
    optIdsType: CriticColumnIdsOpts;
    factoryOptsType: Parameters<typeof newCriticColumn>[1];
  };

  constructor(em: EntityManager, opts: CriticColumnOpts) {
    super(em, opts);
    setOpts(this as any as CriticColumn, opts, { calledFromConstructor: true });
  }

  get id(): CriticColumnId {
    return this.idMaybe || failNoIdYet("CriticColumn");
  }

  get idMaybe(): CriticColumnId | undefined {
    return toIdOf(criticColumnMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("CriticColumn");
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
  set(opts: Partial<CriticColumnOpts>): void {
    setOpts(this as any as CriticColumn, opts);
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
  setPartial(opts: PartialOrNull<CriticColumnOpts>): void {
    setOpts(this as any as CriticColumn, opts as OptsOf<CriticColumn>, { partial: true });
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   * @see @{link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<CriticColumn> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens
   */
  load<U, V>(fn: (lens: Lens<CriticColumn>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as CriticColumn, fn, opts);
  }

  /**
   * Traverse from this entity using a lens, and load the result
   * @see @{link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  populate<const H extends LoadHint<CriticColumn>>(hint: H): Promise<Loaded<CriticColumn, H>>;
  populate<const H extends LoadHint<CriticColumn>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<CriticColumn, H>>;
  populate<const H extends LoadHint<CriticColumn>, V>(hint: H, fn: (cc: Loaded<CriticColumn, H>) => V): Promise<V>;
  populate<const H extends LoadHint<CriticColumn>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (cc: Loaded<CriticColumn, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<CriticColumn>, V>(
    hintOrOpts: any,
    fn?: (cc: Loaded<CriticColumn, H>) => V,
  ): Promise<Loaded<CriticColumn, H> | V> {
    return this.em.populate(this as any as CriticColumn, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work. Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<CriticColumn>>(hint: H): this is Loaded<CriticColumn, H> {
    return isLoaded(this as any as CriticColumn, hint);
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
  toJSON<const H extends ToJsonHint<CriticColumn>>(hint: H): Promise<JsonPayload<CriticColumn, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get critic(): ManyToOneReference<CriticColumn, Critic, never> {
    return this.__data.relations.critic ??= hasOne(this as any as CriticColumn, criticMeta, "critic", "criticColumn");
  }
}
