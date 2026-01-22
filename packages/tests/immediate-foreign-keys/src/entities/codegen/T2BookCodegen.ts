import {
  BaseEntity,
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
  newT2Book,
  type T2Author,
  type T2AuthorId,
  type T2AuthorOrder,
  type T2Book,
  t2BookMeta,
} from "../entities";

export type T2BookId = Flavor<number, "T2Book">;

export interface T2BookFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  title: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  author: { kind: "m2o"; type: T2Author; nullable: never; derived: false };
  t2Authors: { kind: "o2m"; type: T2Author };
}

export interface T2BookOpts {
  title: string;
  author: T2Author | T2AuthorId;
  t2Authors?: T2Author[];
}

export interface T2BookIdsOpts {
  authorId?: T2AuthorId | null;
  t2AuthorIds?: T2AuthorId[] | null;
}

export interface T2BookFilter {
  id?: ValueFilter<T2BookId, never> | null;
  title?: ValueFilter<string, never>;
  author?: EntityFilter<T2Author, T2AuthorId, FilterOf<T2Author>, never>;
  t2Authors?: EntityFilter<T2Author, T2AuthorId, FilterOf<T2Author>, null | undefined>;
}

export interface T2BookGraphQLFilter {
  id?: ValueGraphQLFilter<T2BookId>;
  title?: ValueGraphQLFilter<string>;
  author?: EntityGraphQLFilter<T2Author, T2AuthorId, GraphQLFilterOf<T2Author>, never>;
  t2Authors?: EntityGraphQLFilter<T2Author, T2AuthorId, GraphQLFilterOf<T2Author>, null | undefined>;
}

export interface T2BookOrder {
  id?: OrderBy;
  title?: OrderBy;
  author?: T2AuthorOrder;
}

export interface T2BookFactoryExtras {
}

export const t2BookConfig = new ConfigApi<T2Book, Context>();

t2BookConfig.addRule(newRequiredRule("title"));
t2BookConfig.addRule(newRequiredRule("author"));

declare module "joist-core" {
  interface TypeMap {
    T2Book: {
      entityType: T2Book;
      filterType: T2BookFilter;
      gqlFilterType: T2BookGraphQLFilter;
      orderType: T2BookOrder;
      optsType: T2BookOpts;
      fieldsType: T2BookFields;
      optIdsType: T2BookIdsOpts;
      factoryExtrasType: T2BookFactoryExtras;
      factoryOptsType: Parameters<typeof newT2Book>[1];
    };
  }
}

export abstract class T2BookCodegen extends BaseEntity<EntityManager, number> implements Entity {
  static readonly tagName = "t2Book";
  static readonly metadata: EntityMetadata<T2Book>;

  declare readonly __type: { 0: "T2Book" };

  readonly t2Authors: Collection<T2Book, T2Author> = hasMany();
  readonly author: ManyToOneReference<T2Book, T2Author, never> = hasOne();

  get id(): T2BookId {
    return this.idMaybe || failNoIdYet("T2Book");
  }

  get idMaybe(): T2BookId | undefined {
    return toIdOf(t2BookMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("T2Book");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get title(): string {
    return getField(this, "title");
  }

  set title(title: string) {
    setField(this, "title", title);
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
  set(opts: Partial<T2BookOpts>): void {
    setOpts(this as any as T2Book, opts);
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
  setPartial(opts: PartialOrNull<T2BookOpts>): void {
    setOpts(this as any as T2Book, opts as OptsOf<T2Book>, { partial: true });
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
  setDeepPartial(opts: DeepPartialOrNull<T2Book>): Promise<void> {
    return updatePartial(this as any as T2Book, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<T2Book> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<T2Book>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as T2Book, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<T2Book>>(hint: H): Promise<Loaded<T2Book, H>>;
  populate<const H extends LoadHint<T2Book>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<T2Book, H>>;
  populate<const H extends LoadHint<T2Book>, V>(hint: H, fn: (t2Book: Loaded<T2Book, H>) => V): Promise<V>;
  populate<const H extends LoadHint<T2Book>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (t2Book: Loaded<T2Book, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<T2Book>, V>(
    hintOrOpts: any,
    fn?: (t2Book: Loaded<T2Book, H>) => V,
  ): Promise<Loaded<T2Book, H> | V> {
    return this.em.populate(this as any as T2Book, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<T2Book>>(hint: H): this is Loaded<T2Book, H> {
    return isLoaded(this as any as T2Book, hint);
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
  toJSON<const H extends ToJsonHint<T2Book>>(hint: H): Promise<JsonPayload<T2Book, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }
}
