import {
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
  isLoaded,
  type JsonPayload,
  type Lens,
  type Loaded,
  type LoadHint,
  loadLens,
  newChangesProxy,
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
  type Entity,
  newSmallPublisherGroup,
  PublisherGroup,
  type PublisherGroupFields,
  type PublisherGroupFilter,
  type PublisherGroupGraphQLFilter,
  type PublisherGroupIdsOpts,
  type PublisherGroupOpts,
  type PublisherGroupOrder,
  type SmallPublisher,
  type SmallPublisherGroup,
  smallPublisherGroupMeta,
  type SmallPublisherId,
} from "../entities";

export type SmallPublisherGroupId = Flavor<string, "PublisherGroup">;

export interface SmallPublisherGroupFields extends PublisherGroupFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  smallName: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  publishers: { kind: "o2m"; type: SmallPublisher };
}

export interface SmallPublisherGroupOpts extends PublisherGroupOpts {
  smallName?: string | null;
  publishers?: SmallPublisher[];
}

export interface SmallPublisherGroupIdsOpts extends PublisherGroupIdsOpts {
  publisherIds?: SmallPublisherId[] | null;
}

export interface SmallPublisherGroupFilter extends PublisherGroupFilter {
  smallName?: ValueFilter<string, null>;
  publishers?: EntityFilter<SmallPublisher, SmallPublisherId, FilterOf<SmallPublisher>, null | undefined>;
}

export interface SmallPublisherGroupGraphQLFilter extends PublisherGroupGraphQLFilter {
  smallName?: ValueGraphQLFilter<string>;
  publishers?: EntityGraphQLFilter<SmallPublisher, SmallPublisherId, GraphQLFilterOf<SmallPublisher>, null | undefined>;
}

export interface SmallPublisherGroupOrder extends PublisherGroupOrder {
  smallName?: OrderBy;
}

export interface SmallPublisherGroupFactoryExtras {
}

export const smallPublisherGroupConfig = new ConfigApi<SmallPublisherGroup, Context>();

declare module "joist-orm" {
  interface TypeMap {
    SmallPublisherGroup: {
      entityType: SmallPublisherGroup;
      filterType: SmallPublisherGroupFilter;
      gqlFilterType: SmallPublisherGroupGraphQLFilter;
      orderType: SmallPublisherGroupOrder;
      optsType: SmallPublisherGroupOpts;
      fieldsType: SmallPublisherGroupFields;
      optIdsType: SmallPublisherGroupIdsOpts;
      factoryExtrasType: SmallPublisherGroupFactoryExtras;
      factoryOptsType: Parameters<typeof newSmallPublisherGroup>[1];
    };
  }
}

export abstract class SmallPublisherGroupCodegen extends PublisherGroup implements Entity {
  static readonly tagName = "pg";
  static readonly metadata: EntityMetadata<SmallPublisherGroup>;

  declare readonly __type: { 0: "PublisherGroup"; 1: "SmallPublisherGroup" };

  readonly publishers: Collection<SmallPublisherGroup, SmallPublisher> = hasMany();

  get id(): SmallPublisherGroupId {
    return this.idMaybe || failNoIdYet("SmallPublisherGroup");
  }

  get idMaybe(): SmallPublisherGroupId | undefined {
    return toIdOf(smallPublisherGroupMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("SmallPublisherGroup");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get smallName(): string | undefined {
    return getField(this, "smallName");
  }

  set smallName(smallName: string | undefined) {
    setField(this, "smallName", smallName);
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
  set(opts: Partial<SmallPublisherGroupOpts>): void {
    setOpts(this as any as SmallPublisherGroup, opts);
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
  setPartial(opts: PartialOrNull<SmallPublisherGroupOpts>): void {
    setOpts(this as any as SmallPublisherGroup, opts as OptsOf<SmallPublisherGroup>, { partial: true });
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
  setDeepPartial(opts: DeepPartialOrNull<SmallPublisherGroup>): Promise<void> {
    return updatePartial(this as any as SmallPublisherGroup, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<SmallPublisherGroup> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<SmallPublisherGroup>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as SmallPublisherGroup, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<SmallPublisherGroup>>(hint: H): Promise<Loaded<SmallPublisherGroup, H>>;
  populate<const H extends LoadHint<SmallPublisherGroup>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<SmallPublisherGroup, H>>;
  populate<const H extends LoadHint<SmallPublisherGroup>, V>(
    hint: H,
    fn: (pg: Loaded<SmallPublisherGroup, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<SmallPublisherGroup>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (pg: Loaded<SmallPublisherGroup, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<SmallPublisherGroup>, V>(
    hintOrOpts: any,
    fn?: (pg: Loaded<SmallPublisherGroup, H>) => V,
  ): Promise<Loaded<SmallPublisherGroup, H> | V> {
    return this.em.populate(this as any as SmallPublisherGroup, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<SmallPublisherGroup>>(
    hint: H,
  ): this is Loaded<SmallPublisherGroup | PublisherGroup, H> {
    return isLoaded(this as any as SmallPublisherGroup, hint);
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
  toJSON<const H extends ToJsonHint<SmallPublisherGroup>>(hint: H): Promise<JsonPayload<SmallPublisherGroup, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }
}
