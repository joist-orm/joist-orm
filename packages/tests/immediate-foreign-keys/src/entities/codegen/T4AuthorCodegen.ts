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
import { type Context } from "src/context";
import {
  type Entity,
  EntityManager,
  newT4Author,
  T4Author,
  t4AuthorMeta,
  T4Book,
  type T4BookId,
  t4BookMeta,
  type T4BookOrder,
} from "../entities";

export type T4AuthorId = Flavor<number, T4Author>;

export interface T4AuthorFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  firstName: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  favoriteBook: { kind: "m2o"; type: T4Book; nullable: never; derived: false };
}

export interface T4AuthorOpts {
  firstName: string;
  favoriteBook: T4Book | T4BookId;
  t4Books?: T4Book[];
}

export interface T4AuthorIdsOpts {
  favoriteBookId?: T4BookId | null;
  t4BookIds?: T4BookId[] | null;
}

export interface T4AuthorFilter {
  id?: ValueFilter<T4AuthorId, never> | null;
  firstName?: ValueFilter<string, never>;
  favoriteBook?: EntityFilter<T4Book, T4BookId, FilterOf<T4Book>, never>;
  t4Books?: EntityFilter<T4Book, T4BookId, FilterOf<T4Book>, null | undefined>;
}

export interface T4AuthorGraphQLFilter {
  id?: ValueGraphQLFilter<T4AuthorId>;
  firstName?: ValueGraphQLFilter<string>;
  favoriteBook?: EntityGraphQLFilter<T4Book, T4BookId, GraphQLFilterOf<T4Book>, never>;
  t4Books?: EntityGraphQLFilter<T4Book, T4BookId, GraphQLFilterOf<T4Book>, null | undefined>;
}

export interface T4AuthorOrder {
  id?: OrderBy;
  firstName?: OrderBy;
  favoriteBook?: T4BookOrder;
}

export const t4AuthorConfig = new ConfigApi<T4Author, Context>();

t4AuthorConfig.addRule(newRequiredRule("firstName"));
t4AuthorConfig.addRule(newRequiredRule("favoriteBook"));

export abstract class T4AuthorCodegen extends BaseEntity<EntityManager, number> implements Entity {
  static readonly tagName = "t4Author";
  static readonly metadata: EntityMetadata<T4Author>;

  declare readonly __orm: {
    entityType: T4Author;
    filterType: T4AuthorFilter;
    gqlFilterType: T4AuthorGraphQLFilter;
    orderType: T4AuthorOrder;
    optsType: T4AuthorOpts;
    fieldsType: T4AuthorFields;
    optIdsType: T4AuthorIdsOpts;
    factoryOptsType: Parameters<typeof newT4Author>[1];
  };

  constructor(em: EntityManager, opts: T4AuthorOpts) {
    super(em, opts);
    setOpts(this as any as T4Author, opts, { calledFromConstructor: true });
  }

  get id(): T4AuthorId {
    return this.idMaybe || failNoIdYet("T4Author");
  }

  get idMaybe(): T4AuthorId | undefined {
    return toIdOf(t4AuthorMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("T4Author");
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
  set(opts: Partial<T4AuthorOpts>): void {
    setOpts(this as any as T4Author, opts);
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
  setPartial(opts: PartialOrNull<T4AuthorOpts>): void {
    setOpts(this as any as T4Author, opts as OptsOf<T4Author>, { partial: true });
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
  setDeepPartial(opts: DeepPartialOrNull<T4Author>): Promise<void> {
    return updatePartial(this as any as T4Author, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<T4Author> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<T4Author>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as T4Author, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/docs/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<T4Author>>(hint: H): Promise<Loaded<T4Author, H>>;
  populate<const H extends LoadHint<T4Author>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<T4Author, H>>;
  populate<const H extends LoadHint<T4Author>, V>(hint: H, fn: (t4Author: Loaded<T4Author, H>) => V): Promise<V>;
  populate<const H extends LoadHint<T4Author>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (t4Author: Loaded<T4Author, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<T4Author>, V>(
    hintOrOpts: any,
    fn?: (t4Author: Loaded<T4Author, H>) => V,
  ): Promise<Loaded<T4Author, H> | V> {
    return this.em.populate(this as any as T4Author, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<T4Author>>(hint: H): this is Loaded<T4Author, H> {
    return isLoaded(this as any as T4Author, hint);
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
  toJSON<const H extends ToJsonHint<T4Author>>(hint: H): Promise<JsonPayload<T4Author, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get t4Books(): Collection<T4Author, T4Book> {
    return this.__data.relations.t4Books ??= hasMany(this, t4BookMeta, "t4Books", "author", "author_id", undefined);
  }

  get favoriteBook(): ManyToOneReference<T4Author, T4Book, never> {
    return this.__data.relations.favoriteBook ??= hasOne(this, t4BookMeta, "favoriteBook", "t4Authors");
  }
}
