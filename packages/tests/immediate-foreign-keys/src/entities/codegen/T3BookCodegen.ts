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
import type { Context } from "src/context";
import {
  type Entity,
  EntityManager,
  newT3Book,
  T3Author,
  type T3AuthorId,
  type T3AuthorOrder,
  T3Book,
  t3BookMeta,
} from "../entities";

export type T3BookId = Flavor<number, "T3Book">;

export interface T3BookFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  title: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  author: { kind: "m2o"; type: T3Author; nullable: never; derived: false };
  t3Authors: { kind: "o2m"; type: T3Author };
}

export interface T3BookOpts {
  title: string;
  author: T3Author | T3AuthorId;
  t3Authors?: T3Author[];
}

export interface T3BookIdsOpts {
  authorId?: T3AuthorId | null;
  t3AuthorIds?: T3AuthorId[] | null;
}

export interface T3BookFilter {
  id?: ValueFilter<T3BookId, never> | null;
  title?: ValueFilter<string, never>;
  author?: EntityFilter<T3Author, T3AuthorId, FilterOf<T3Author>, never>;
  t3Authors?: EntityFilter<T3Author, T3AuthorId, FilterOf<T3Author>, null | undefined>;
}

export interface T3BookGraphQLFilter {
  id?: ValueGraphQLFilter<T3BookId>;
  title?: ValueGraphQLFilter<string>;
  author?: EntityGraphQLFilter<T3Author, T3AuthorId, GraphQLFilterOf<T3Author>, never>;
  t3Authors?: EntityGraphQLFilter<T3Author, T3AuthorId, GraphQLFilterOf<T3Author>, null | undefined>;
}

export interface T3BookOrder {
  id?: OrderBy;
  title?: OrderBy;
  author?: T3AuthorOrder;
}

export interface T3BookFactoryExtras {
}

export const t3BookConfig = new ConfigApi<T3Book, Context>();

t3BookConfig.addRule(newRequiredRule("title"));
t3BookConfig.addRule(newRequiredRule("author"));

declare module "joist-orm" {
  interface TypeMap {
    T3Book: {
      entityType: T3Book;
      filterType: T3BookFilter;
      gqlFilterType: T3BookGraphQLFilter;
      orderType: T3BookOrder;
      optsType: T3BookOpts;
      fieldsType: T3BookFields;
      optIdsType: T3BookIdsOpts;
      factoryExtrasType: T3BookFactoryExtras;
      factoryOptsType: Parameters<typeof newT3Book>[1];
    };
  }
}

export abstract class T3BookCodegen extends BaseEntity<EntityManager, number> implements Entity {
  static readonly tagName = "t3Book";
  static readonly metadata: EntityMetadata<T3Book>;

  declare readonly __type: { 0: "T3Book" };

  readonly t3Authors: Collection<T3Book, T3Author> = hasMany("favoriteBook", "favorite_book_id", undefined);
  readonly author: ManyToOneReference<T3Book, T3Author, never> = hasOne("t3Books");

  get id(): T3BookId {
    return this.idMaybe || failNoIdYet("T3Book");
  }

  get idMaybe(): T3BookId | undefined {
    return toIdOf(t3BookMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("T3Book");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get title(): string {
    return getField(this, "title");
  }

  set title(title: string) {
    setField(this, "title", cleanStringValue(title));
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
  set(opts: Partial<T3BookOpts>): void {
    setOpts(this as any as T3Book, opts);
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
  setPartial(opts: PartialOrNull<T3BookOpts>): void {
    setOpts(this as any as T3Book, opts as OptsOf<T3Book>, { partial: true });
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
  setDeepPartial(opts: DeepPartialOrNull<T3Book>): Promise<void> {
    return updatePartial(this as any as T3Book, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<T3Book> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<T3Book>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as T3Book, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<T3Book>>(hint: H): Promise<Loaded<T3Book, H>>;
  populate<const H extends LoadHint<T3Book>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<T3Book, H>>;
  populate<const H extends LoadHint<T3Book>, V>(hint: H, fn: (t3Book: Loaded<T3Book, H>) => V): Promise<V>;
  populate<const H extends LoadHint<T3Book>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (t3Book: Loaded<T3Book, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<T3Book>, V>(
    hintOrOpts: any,
    fn?: (t3Book: Loaded<T3Book, H>) => V,
  ): Promise<Loaded<T3Book, H> | V> {
    return this.em.populate(this as any as T3Book, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<T3Book>>(hint: H): this is Loaded<T3Book, H> {
    return isLoaded(this as any as T3Book, hint);
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
  toJSON<const H extends ToJsonHint<T3Book>>(hint: H): Promise<JsonPayload<T3Book, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }
}
