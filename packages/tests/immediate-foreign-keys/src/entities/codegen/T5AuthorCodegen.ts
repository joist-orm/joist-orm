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
import { type Context } from "src/context";
import {
  type Entity,
  EntityManager,
  newT5Author,
  T5Author,
  t5AuthorMeta,
  T5Book,
  type T5BookId,
  t5BookMeta,
} from "../entities";

export type T5AuthorId = Flavor<number, T5Author>;

export interface T5AuthorFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: false; derived: true };
  firstName: { kind: "primitive"; type: string; unique: false; nullable: false; derived: false };
}

export interface T5AuthorOpts {
  firstName: string;
  t5Books?: T5Book[];
}

export interface T5AuthorIdsOpts {
  t5BookIds?: T5BookId[] | null;
}

export interface T5AuthorFilter {
  id?: ValueFilter<T5AuthorId, never> | null;
  firstName?: ValueFilter<string, never>;
  t5Books?: EntityFilter<T5Book, T5BookId, FilterOf<T5Book>, null | undefined>;
}

export interface T5AuthorGraphQLFilter {
  id?: ValueGraphQLFilter<T5AuthorId>;
  firstName?: ValueGraphQLFilter<string>;
  t5Books?: EntityGraphQLFilter<T5Book, T5BookId, GraphQLFilterOf<T5Book>, null | undefined>;
}

export interface T5AuthorOrder {
  id?: OrderBy;
  firstName?: OrderBy;
}

export const t5AuthorConfig = new ConfigApi<T5Author, Context>();

t5AuthorConfig.addRule(newRequiredRule("firstName"));

export abstract class T5AuthorCodegen extends BaseEntity<EntityManager, number> implements Entity {
  static readonly tagName = "t5Author";
  static readonly metadata: EntityMetadata<T5Author>;

  declare readonly __orm: {
    entityType: T5Author;
    filterType: T5AuthorFilter;
    gqlFilterType: T5AuthorGraphQLFilter;
    orderType: T5AuthorOrder;
    optsType: T5AuthorOpts;
    fieldsType: T5AuthorFields;
    optIdsType: T5AuthorIdsOpts;
    factoryOptsType: Parameters<typeof newT5Author>[1];
  };

  constructor(em: EntityManager, opts: T5AuthorOpts) {
    super(em, opts);
    setOpts(this as any as T5Author, opts, { calledFromConstructor: true });
  }

  get id(): T5AuthorId {
    return this.idMaybe || failNoIdYet("T5Author");
  }

  get idMaybe(): T5AuthorId | undefined {
    return toIdOf(t5AuthorMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("T5Author");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get firstName(): string {
    return getField(this, "firstName");
  }

  set firstName(firstName: string) {
    setField(this, "firstName", cleanStringValue(firstName));
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
  set(opts: Partial<T5AuthorOpts>): void {
    setOpts(this as any as T5Author, opts);
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
  setPartial(opts: PartialOrNull<T5AuthorOpts>): void {
    setOpts(this as any as T5Author, opts as OptsOf<T5Author>, { partial: true });
  }

  /**
   * Partial update taking any nested subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
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
   * @see {@link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setDeepPartial(opts: DeepPartialOrNull<T5Author>): Promise<void> {
    return updatePartial(this as any as T5Author, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<T5Author> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<T5Author>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as T5Author, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/docs/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<T5Author>>(hint: H): Promise<Loaded<T5Author, H>>;
  populate<const H extends LoadHint<T5Author>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<T5Author, H>>;
  populate<const H extends LoadHint<T5Author>, V>(hint: H, fn: (t5Author: Loaded<T5Author, H>) => V): Promise<V>;
  populate<const H extends LoadHint<T5Author>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (t5Author: Loaded<T5Author, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<T5Author>, V>(
    hintOrOpts: any,
    fn?: (t5Author: Loaded<T5Author, H>) => V,
  ): Promise<Loaded<T5Author, H> | V> {
    return this.em.populate(this as any as T5Author, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<T5Author>>(hint: H): this is Loaded<T5Author, H> {
    return isLoaded(this as any as T5Author, hint);
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
  toJSON<const H extends ToJsonHint<T5Author>>(hint: H): Promise<JsonPayload<T5Author, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get t5Books(): Collection<T5Author, T5Book> {
    return this.__data.relations.t5Books ??= hasMany(this, t5BookMeta, "t5Books", "author", "author_id", undefined);
  }
}
