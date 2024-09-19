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

  set(opts: Partial<T4AuthorOpts>): void {
    setOpts(this as any as T4Author, opts);
  }

  setPartial(opts: PartialOrNull<T4AuthorOpts>): void {
    setOpts(this as any as T4Author, opts as OptsOf<T4Author>, { partial: true });
  }

  get changes(): Changes<T4Author> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<T4Author>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as T4Author, fn, opts);
  }

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

  isLoaded<const H extends LoadHint<T4Author>>(hint: H): this is Loaded<T4Author, H> {
    return isLoaded(this as any as T4Author, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<T4Author>>(hint: H): Promise<JsonPayload<T4Author, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get t4Books(): Collection<T4Author, T4Book> {
    return this.__data.relations.t4Books ??= hasMany(
      this as any as T4Author,
      t4BookMeta,
      "t4Books",
      "author",
      "author_id",
      undefined,
    );
  }

  get favoriteBook(): ManyToOneReference<T4Author, T4Book, never> {
    return this.__data.relations.favoriteBook ??= hasOne(
      this as any as T4Author,
      t4BookMeta,
      "favoriteBook",
      "t4Authors",
    );
  }
}
