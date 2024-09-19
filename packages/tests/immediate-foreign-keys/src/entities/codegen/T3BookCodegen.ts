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
  type GetLens,
  getLens,
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
  newT3Book,
  T3Author,
  type T3AuthorId,
  t3AuthorMeta,
  type T3AuthorOrder,
  T3Book,
  t3BookMeta,
} from "../entities";

export type T3BookId = Flavor<number, T3Book>;

export interface T3BookFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  title: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  author: { kind: "m2o"; type: T3Author; nullable: never; derived: false };
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

export const t3BookConfig = new ConfigApi<T3Book, Context>();

t3BookConfig.addRule(newRequiredRule("title"));
t3BookConfig.addRule(newRequiredRule("author"));

export abstract class T3BookCodegen extends BaseEntity<EntityManager, number> implements Entity {
  static readonly tagName = "t3Book";
  static readonly metadata: EntityMetadata<T3Book>;

  declare readonly __orm: {
    entityType: T3Book;
    filterType: T3BookFilter;
    gqlFilterType: T3BookGraphQLFilter;
    orderType: T3BookOrder;
    optsType: T3BookOpts;
    fieldsType: T3BookFields;
    optIdsType: T3BookIdsOpts;
    factoryOptsType: Parameters<typeof newT3Book>[1];
  };

  constructor(em: EntityManager, opts: T3BookOpts) {
    super(em, opts);
    setOpts(this as any as T3Book, opts, { calledFromConstructor: true });
  }

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

  set(opts: Partial<T3BookOpts>): void {
    setOpts(this as any as T3Book, opts);
  }

  setPartial(opts: PartialOrNull<T3BookOpts>): void {
    setOpts(this as any as T3Book, opts as OptsOf<T3Book>, { partial: true });
  }

  get changes(): Changes<T3Book> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<T3Book>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as T3Book, fn, opts);
  }

  get<U, V>(fn: (lens: GetLens<Omit<this, "fullNonReactiveAccess">>) => GetLens<U, V>): V {
    return getLens(t3BookMeta, this, fn as never);
  }

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

  isLoaded<const H extends LoadHint<T3Book>>(hint: H): this is Loaded<T3Book, H> {
    return isLoaded(this as any as T3Book, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<T3Book>>(hint: H): Promise<JsonPayload<T3Book, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get t3Authors(): Collection<T3Book, T3Author> {
    return this.__data.relations.t3Authors ??= hasMany(
      this as any as T3Book,
      t3AuthorMeta,
      "t3Authors",
      "favoriteBook",
      "favorite_book_id",
      undefined,
    );
  }

  get author(): ManyToOneReference<T3Book, T3Author, never> {
    return this.__data.relations.author ??= hasOne(this as any as T3Book, t3AuthorMeta, "author", "t3Books");
  }
}
