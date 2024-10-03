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
  newT2Author,
  T2Author,
  t2AuthorMeta,
  T2Book,
  type T2BookId,
  t2BookMeta,
  type T2BookOrder,
} from "../entities";

export type T2AuthorId = Flavor<number, T2Author>;

export interface T2AuthorFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  firstName: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  favoriteBook: { kind: "m2o"; type: T2Book; nullable: undefined; derived: false };
}

export interface T2AuthorOpts {
  firstName: string;
  favoriteBook?: T2Book | T2BookId | null;
  t2Books?: T2Book[];
}

export interface T2AuthorIdsOpts {
  favoriteBookId?: T2BookId | null;
  t2BookIds?: T2BookId[] | null;
}

export interface T2AuthorFilter {
  id?: ValueFilter<T2AuthorId, never> | null;
  firstName?: ValueFilter<string, never>;
  favoriteBook?: EntityFilter<T2Book, T2BookId, FilterOf<T2Book>, null>;
  t2Books?: EntityFilter<T2Book, T2BookId, FilterOf<T2Book>, null | undefined>;
}

export interface T2AuthorGraphQLFilter {
  id?: ValueGraphQLFilter<T2AuthorId>;
  firstName?: ValueGraphQLFilter<string>;
  favoriteBook?: EntityGraphQLFilter<T2Book, T2BookId, GraphQLFilterOf<T2Book>, null>;
  t2Books?: EntityGraphQLFilter<T2Book, T2BookId, GraphQLFilterOf<T2Book>, null | undefined>;
}

export interface T2AuthorOrder {
  id?: OrderBy;
  firstName?: OrderBy;
  favoriteBook?: T2BookOrder;
}

export const t2AuthorConfig = new ConfigApi<T2Author, Context>();

t2AuthorConfig.addRule(newRequiredRule("firstName"));

export abstract class T2AuthorCodegen extends BaseEntity<EntityManager, number> implements Entity {
  static readonly tagName = "t2Author";
  static readonly metadata: EntityMetadata<T2Author>;

  declare readonly __orm: {
    entityType: T2Author;
    filterType: T2AuthorFilter;
    gqlFilterType: T2AuthorGraphQLFilter;
    orderType: T2AuthorOrder;
    optsType: T2AuthorOpts;
    fieldsType: T2AuthorFields;
    optIdsType: T2AuthorIdsOpts;
    factoryOptsType: Parameters<typeof newT2Author>[1];
  };

  constructor(em: EntityManager, opts: T2AuthorOpts) {
    super(em, opts);
    setOpts(this as any as T2Author, opts, { calledFromConstructor: true });
  }

  get id(): T2AuthorId {
    return this.idMaybe || failNoIdYet("T2Author");
  }

  get idMaybe(): T2AuthorId | undefined {
    return toIdOf(t2AuthorMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("T2Author");
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
  set(opts: Partial<T2AuthorOpts>): void {
    setOpts(this as any as T2Author, opts);
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
  setPartial(opts: PartialOrNull<T2AuthorOpts>): void {
    setOpts(this as any as T2Author, opts as OptsOf<T2Author>, { partial: true });
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
  setDeepPartial(opts: DeepPartialOrNull<T2Author>): Promise<void> {
    return updatePartial(this as any as T2Author, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<T2Author> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<T2Author>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as T2Author, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/docs/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<T2Author>>(hint: H): Promise<Loaded<T2Author, H>>;
  populate<const H extends LoadHint<T2Author>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<T2Author, H>>;
  populate<const H extends LoadHint<T2Author>, V>(hint: H, fn: (t2Author: Loaded<T2Author, H>) => V): Promise<V>;
  populate<const H extends LoadHint<T2Author>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (t2Author: Loaded<T2Author, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<T2Author>, V>(
    hintOrOpts: any,
    fn?: (t2Author: Loaded<T2Author, H>) => V,
  ): Promise<Loaded<T2Author, H> | V> {
    return this.em.populate(this as any as T2Author, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<T2Author>>(hint: H): this is Loaded<T2Author, H> {
    return isLoaded(this as any as T2Author, hint);
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
  toJSON<const H extends ToJsonHint<T2Author>>(hint: H): Promise<JsonPayload<T2Author, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get t2Books(): Collection<T2Author, T2Book> {
    return this.__data.relations.t2Books ??= hasMany(this, t2BookMeta, "t2Books", "author", "author_id", undefined);
  }

  get favoriteBook(): ManyToOneReference<T2Author, T2Book, undefined> {
    return this.__data.relations.favoriteBook ??= hasOne(this, t2BookMeta, "favoriteBook", "t2Authors");
  }
}
