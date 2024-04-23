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
  newT4Book,
  T4Author,
  type T4AuthorId,
  t4AuthorMeta,
  type T4AuthorOrder,
  T4Book,
  t4BookMeta,
} from "../entities";

export type T4BookId = Flavor<number, T4Book>;

export interface T4BookFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  title: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  author: { kind: "m2o"; type: T4Author; nullable: never; derived: false };
}

export interface T4BookOpts {
  title: string;
  author: T4Author | T4AuthorId;
  t4Authors?: T4Author[];
}

export interface T4BookIdsOpts {
  authorId?: T4AuthorId | null;
  t4AuthorIds?: T4AuthorId[] | null;
}

export interface T4BookFilter {
  id?: ValueFilter<T4BookId, never> | null;
  title?: ValueFilter<string, never>;
  author?: EntityFilter<T4Author, T4AuthorId, FilterOf<T4Author>, never>;
  t4Authors?: EntityFilter<T4Author, T4AuthorId, FilterOf<T4Author>, null | undefined>;
}

export interface T4BookGraphQLFilter {
  id?: ValueGraphQLFilter<T4BookId>;
  title?: ValueGraphQLFilter<string>;
  author?: EntityGraphQLFilter<T4Author, T4AuthorId, GraphQLFilterOf<T4Author>, never>;
  t4Authors?: EntityGraphQLFilter<T4Author, T4AuthorId, GraphQLFilterOf<T4Author>, null | undefined>;
}

export interface T4BookOrder {
  id?: OrderBy;
  title?: OrderBy;
  author?: T4AuthorOrder;
}

export const t4BookConfig = new ConfigApi<T4Book, Context>();

t4BookConfig.addRule(newRequiredRule("title"));
t4BookConfig.addRule(newRequiredRule("author"));

export abstract class T4BookCodegen extends BaseEntity<EntityManager, number> implements Entity {
  static readonly tagName = "t4Book";
  static readonly metadata: EntityMetadata<T4Book>;

  declare readonly __orm: {
    filterType: T4BookFilter;
    gqlFilterType: T4BookGraphQLFilter;
    orderType: T4BookOrder;
    optsType: T4BookOpts;
    fieldsType: T4BookFields;
    optIdsType: T4BookIdsOpts;
    factoryOptsType: Parameters<typeof newT4Book>[1];
  };

  constructor(em: EntityManager, opts: T4BookOpts) {
    super(em, opts);
    setOpts(this as any as T4Book, opts, { calledFromConstructor: true });
  }

  get id(): T4BookId {
    return this.idMaybe || failNoIdYet("T4Book");
  }

  get idMaybe(): T4BookId | undefined {
    return toIdOf(t4BookMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("T4Book");
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

  set(opts: Partial<T4BookOpts>): void {
    setOpts(this as any as T4Book, opts);
  }

  setPartial(opts: PartialOrNull<T4BookOpts>): void {
    setOpts(this as any as T4Book, opts as OptsOf<T4Book>, { partial: true });
  }

  get changes(): Changes<T4Book> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<T4Book>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as T4Book, fn, opts);
  }

  populate<const H extends LoadHint<T4Book>>(hint: H): Promise<Loaded<T4Book, H>>;
  populate<const H extends LoadHint<T4Book>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<T4Book, H>>;
  populate<const H extends LoadHint<T4Book>, V>(hint: H, fn: (t4Book: Loaded<T4Book, H>) => V): Promise<V>;
  populate<const H extends LoadHint<T4Book>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (t4Book: Loaded<T4Book, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<T4Book>, V>(
    hintOrOpts: any,
    fn?: (t4Book: Loaded<T4Book, H>) => V,
  ): Promise<Loaded<T4Book, H> | V> {
    return this.em.populate(this as any as T4Book, hintOrOpts, fn);
  }

  isLoaded<const H extends LoadHint<T4Book>>(hint: H): this is Loaded<T4Book, H> {
    return isLoaded(this as any as T4Book, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<T4Book>>(hint: H): Promise<JsonPayload<T4Book, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get t4Authors(): Collection<T4Book, T4Author> {
    return this.__data.relations.t4Authors ??= hasMany(
      this as any as T4Book,
      t4AuthorMeta,
      "t4Authors",
      "favoriteBook",
      "favorite_book_id",
      undefined,
    );
  }

  get author(): ManyToOneReference<T4Book, T4Author, never> {
    return this.__data.relations.author ??= hasOne(this as any as T4Book, t4AuthorMeta, "author", "t4Books");
  }
}
