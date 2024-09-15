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
  type Entity,
  EntityManager,
  newT3Author,
  T3Author,
  t3AuthorMeta,
  T3Book,
  type T3BookId,
  t3BookMeta,
  type T3BookOrder,
} from "../entities";

export type T3AuthorId = Flavor<number, T3Author>;

export interface T3AuthorFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  firstName: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  favoriteBook: { kind: "m2o"; type: T3Book; nullable: never; derived: false };
}

export interface T3AuthorOpts {
  firstName: string;
  favoriteBook: T3Book | T3BookId;
  t3Books?: T3Book[];
}

export interface T3AuthorIdsOpts {
  favoriteBookId?: T3BookId | null;
  t3BookIds?: T3BookId[] | null;
}

export interface T3AuthorFilter {
  id?: ValueFilter<T3AuthorId, never> | null;
  firstName?: ValueFilter<string, never>;
  favoriteBook?: EntityFilter<T3Book, T3BookId, FilterOf<T3Book>, never>;
  t3Books?: EntityFilter<T3Book, T3BookId, FilterOf<T3Book>, null | undefined>;
}

export interface T3AuthorGraphQLFilter {
  id?: ValueGraphQLFilter<T3AuthorId>;
  firstName?: ValueGraphQLFilter<string>;
  favoriteBook?: EntityGraphQLFilter<T3Book, T3BookId, GraphQLFilterOf<T3Book>, never>;
  t3Books?: EntityGraphQLFilter<T3Book, T3BookId, GraphQLFilterOf<T3Book>, null | undefined>;
}

export interface T3AuthorOrder {
  id?: OrderBy;
  firstName?: OrderBy;
  favoriteBook?: T3BookOrder;
}

export const t3AuthorConfig = new ConfigApi<T3Author, Context>();

t3AuthorConfig.addRule(newRequiredRule("firstName"));
t3AuthorConfig.addRule(newRequiredRule("favoriteBook"));

export abstract class T3AuthorCodegen extends BaseEntity<EntityManager, number> implements Entity {
  static readonly tagName = "t3Author";
  static readonly metadata: EntityMetadata<T3Author>;

  declare readonly __orm: {
    entityType: T3Author;
    filterType: T3AuthorFilter;
    gqlFilterType: T3AuthorGraphQLFilter;
    orderType: T3AuthorOrder;
    optsType: T3AuthorOpts;
    fieldsType: T3AuthorFields;
    optIdsType: T3AuthorIdsOpts;
    factoryOptsType: Parameters<typeof newT3Author>[1];
  };

  constructor(em: EntityManager, opts: T3AuthorOpts) {
    super(em, opts);
    setOpts(this as any as T3Author, opts, { calledFromConstructor: true });
  }

  get id(): T3AuthorId {
    return this.idMaybe || failNoIdYet("T3Author");
  }

  get idMaybe(): T3AuthorId | undefined {
    return toIdOf(t3AuthorMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("T3Author");
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
  set(opts: Partial<T3AuthorOpts>): void {
    setOpts(this as any as T3Author, opts);
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
  setPartial(opts: PartialOrNull<T3AuthorOpts>): void {
    setOpts(this as any as T3Author, opts as OptsOf<T3Author>, { partial: true });
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   * @see @{link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<T3Author> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens
   */
  load<U, V>(fn: (lens: Lens<T3Author>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as T3Author, fn, opts);
  }

  /**
   * Traverse from this entity using a lens, and load the result
   * @see @{link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  populate<const H extends LoadHint<T3Author>>(hint: H): Promise<Loaded<T3Author, H>>;
  populate<const H extends LoadHint<T3Author>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<T3Author, H>>;
  populate<const H extends LoadHint<T3Author>, V>(hint: H, fn: (t3Author: Loaded<T3Author, H>) => V): Promise<V>;
  populate<const H extends LoadHint<T3Author>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (t3Author: Loaded<T3Author, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<T3Author>, V>(
    hintOrOpts: any,
    fn?: (t3Author: Loaded<T3Author, H>) => V,
  ): Promise<Loaded<T3Author, H> | V> {
    return this.em.populate(this as any as T3Author, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work. Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<T3Author>>(hint: H): this is Loaded<T3Author, H> {
    return isLoaded(this as any as T3Author, hint);
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
  toJSON<const H extends ToJsonHint<T3Author>>(hint: H): Promise<JsonPayload<T3Author, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get t3Books(): Collection<T3Author, T3Book> {
    return this.__data.relations.t3Books ??= hasMany(
      this as any as T3Author,
      t3BookMeta,
      "t3Books",
      "author",
      "author_id",
      undefined,
    );
  }

  get favoriteBook(): ManyToOneReference<T3Author, T3Book, never> {
    return this.__data.relations.favoriteBook ??= hasOne(
      this as any as T3Author,
      t3BookMeta,
      "favoriteBook",
      "t3Authors",
    );
  }
}
