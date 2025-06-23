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
  type PartialOrNull,
  setOpts,
  type TaggedId,
  toIdOf,
  toJSON,
  type ToJsonHint,
  updatePartial,
} from "joist-orm";
import { type Context } from "src/context";
import {
  type Entity,
  EntityManager,
  newTinyPublisherGroup,
  Publisher,
  PublisherGroup,
  type PublisherGroupFields,
  type PublisherGroupFilter,
  type PublisherGroupGraphQLFilter,
  type PublisherGroupIdsOpts,
  type PublisherGroupOpts,
  type PublisherGroupOrder,
  TinyPublisherGroup,
  tinyPublisherGroupMeta,
  UserPublisherGroup,
  type UserPublisherGroupId,
  userPublisherGroupMeta,
} from "../entities";

export type TinyPublisherGroupId = Flavor<string, "PublisherGroup">;

export interface TinyPublisherGroupFields extends PublisherGroupFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  userPublisherGroups: { kind: "o2m"; type: UserPublisherGroup };
}

export interface TinyPublisherGroupOpts extends PublisherGroupOpts {
  userPublisherGroups?: UserPublisherGroup[];
}

export interface TinyPublisherGroupIdsOpts extends PublisherGroupIdsOpts {
  userPublisherGroupIds?: UserPublisherGroupId[] | null;
}

export interface TinyPublisherGroupFilter extends PublisherGroupFilter {
  userPublisherGroups?: EntityFilter<
    UserPublisherGroup,
    UserPublisherGroupId,
    FilterOf<UserPublisherGroup>,
    null | undefined
  >;
}

export interface TinyPublisherGroupGraphQLFilter extends PublisherGroupGraphQLFilter {
  userPublisherGroups?: EntityGraphQLFilter<
    UserPublisherGroup,
    UserPublisherGroupId,
    GraphQLFilterOf<UserPublisherGroup>,
    null | undefined
  >;
}

export interface TinyPublisherGroupOrder extends PublisherGroupOrder {
}

export interface TinyPublisherGroupFactoryExtras {
}

export const tinyPublisherGroupConfig = new ConfigApi<TinyPublisherGroup, Context>();

declare module "joist-orm" {
  interface TypeMap {
    TinyPublisherGroup: {
      entityType: TinyPublisherGroup;
      filterType: TinyPublisherGroupFilter;
      gqlFilterType: TinyPublisherGroupGraphQLFilter;
      orderType: TinyPublisherGroupOrder;
      optsType: TinyPublisherGroupOpts;
      fieldsType: TinyPublisherGroupFields;
      optIdsType: TinyPublisherGroupIdsOpts;
      factoryExtrasType: TinyPublisherGroupFactoryExtras;
      factoryOptsType: Parameters<typeof newTinyPublisherGroup>[1];
    };
  }
}

export abstract class TinyPublisherGroupCodegen extends PublisherGroup implements Entity {
  static readonly tagName = "pg";
  static readonly metadata: EntityMetadata<TinyPublisherGroup>;

  declare readonly __type: { 0: "PublisherGroup"; 1: "TinyPublisherGroup" };

  constructor(em: EntityManager, opts: TinyPublisherGroupOpts) {
    super(em, opts);
    setOpts(this as any as TinyPublisherGroup, opts, { calledFromConstructor: true });
  }

  get id(): TinyPublisherGroupId {
    return this.idMaybe || failNoIdYet("TinyPublisherGroup");
  }

  get idMaybe(): TinyPublisherGroupId | undefined {
    return toIdOf(tinyPublisherGroupMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("TinyPublisherGroup");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
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
  set(opts: Partial<TinyPublisherGroupOpts>): void {
    setOpts(this as any as TinyPublisherGroup, opts);
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
  setPartial(opts: PartialOrNull<TinyPublisherGroupOpts>): void {
    setOpts(this as any as TinyPublisherGroup, opts as OptsOf<TinyPublisherGroup>, { partial: true });
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
  setDeepPartial(opts: DeepPartialOrNull<TinyPublisherGroup>): Promise<void> {
    return updatePartial(this as any as TinyPublisherGroup, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<TinyPublisherGroup> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<TinyPublisherGroup>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as TinyPublisherGroup, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<TinyPublisherGroup>>(hint: H): Promise<Loaded<TinyPublisherGroup, H>>;
  populate<const H extends LoadHint<TinyPublisherGroup>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<TinyPublisherGroup, H>>;
  populate<const H extends LoadHint<TinyPublisherGroup>, V>(
    hint: H,
    fn: (pg: Loaded<TinyPublisherGroup, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<TinyPublisherGroup>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (pg: Loaded<TinyPublisherGroup, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<TinyPublisherGroup>, V>(
    hintOrOpts: any,
    fn?: (pg: Loaded<TinyPublisherGroup, H>) => V,
  ): Promise<Loaded<TinyPublisherGroup, H> | V> {
    return this.em.populate(this as any as TinyPublisherGroup, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<TinyPublisherGroup>>(
    hint: H,
  ): this is Loaded<TinyPublisherGroup | PublisherGroup, H> {
    return isLoaded(this as any as TinyPublisherGroup, hint);
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
  toJSON<const H extends ToJsonHint<TinyPublisherGroup>>(hint: H): Promise<JsonPayload<TinyPublisherGroup, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get userPublisherGroups(): Collection<TinyPublisherGroup, UserPublisherGroup> {
    return this.__data.relations.userPublisherGroups ??= hasMany(
      this,
      userPublisherGroupMeta,
      "userPublisherGroups",
      "publisher",
      "publisher_tiny_group_id",
      undefined,
    );
  }

  get publishers(): Collection<TinyPublisherGroup, Publisher> {
    return super.publishers as Collection<TinyPublisherGroup, Publisher>;
  }
}
