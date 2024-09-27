import {
  BaseEntity,
  type Changes,
  cleanStringValue,
  ConfigApi,
  type EntityFilter,
  type EntityGraphQLFilter,
  type EntityMetadata,
  failNoIdYet,
  type FilterOf,
  type Flavor,
  getField,
  type GraphQLFilterOf,
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
  newT1Book,
  T1Author,
  type T1AuthorId,
  t1AuthorMeta,
  type T1AuthorOrder,
  T1Book,
  t1BookMeta,
} from "../entities";

export type T1BookId = Flavor<number, T1Book>;

export interface T1BookFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  title: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  author: { kind: "m2o"; type: T1Author; nullable: never; derived: false };
}

export interface T1BookOpts {
  title: string;
  author: T1Author | T1AuthorId;
}

export interface T1BookIdsOpts {
  authorId?: T1AuthorId | null;
}

export interface T1BookFilter {
  id?: ValueFilter<T1BookId, never> | null;
  title?: ValueFilter<string, never>;
  author?: EntityFilter<T1Author, T1AuthorId, FilterOf<T1Author>, never>;
}

export interface T1BookGraphQLFilter {
  id?: ValueGraphQLFilter<T1BookId>;
  title?: ValueGraphQLFilter<string>;
  author?: EntityGraphQLFilter<T1Author, T1AuthorId, GraphQLFilterOf<T1Author>, never>;
}

export interface T1BookOrder {
  id?: OrderBy;
  title?: OrderBy;
  author?: T1AuthorOrder;
}

export const t1BookConfig = new ConfigApi<T1Book, Context>();

t1BookConfig.addRule(newRequiredRule("title"));
t1BookConfig.addRule(newRequiredRule("author"));

export abstract class T1BookCodegen extends BaseEntity<EntityManager, number> implements Entity {
  static readonly tagName = "tb";
  static readonly metadata: EntityMetadata<T1Book>;

  declare readonly __orm: {
    entityType: T1Book;
    filterType: T1BookFilter;
    gqlFilterType: T1BookGraphQLFilter;
    orderType: T1BookOrder;
    optsType: T1BookOpts;
    fieldsType: T1BookFields;
    optIdsType: T1BookIdsOpts;
    factoryOptsType: Parameters<typeof newT1Book>[1];
  };

  constructor(em: EntityManager, opts: T1BookOpts) {
    super(em, opts);
    setOpts(this as any as T1Book, opts, { calledFromConstructor: true });
  }

  get id(): T1BookId {
    return this.idMaybe || failNoIdYet("T1Book");
  }

  get idMaybe(): T1BookId | undefined {
    return toIdOf(t1BookMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("T1Book");
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

  set(opts: Partial<T1BookOpts>): void {
    setOpts(this as any as T1Book, opts);
  }

  setPartial(opts: PartialOrNull<T1BookOpts>): void {
    setOpts(this as any as T1Book, opts as OptsOf<T1Book>, { partial: true });
  }

  get changes(): Changes<T1Book> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<T1Book>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as T1Book, fn, opts);
  }

  populate<const H extends LoadHint<T1Book>>(hint: H): Promise<Loaded<T1Book, H>>;
  populate<const H extends LoadHint<T1Book>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<T1Book, H>>;
  populate<const H extends LoadHint<T1Book>, V>(hint: H, fn: (tb: Loaded<T1Book, H>) => V): Promise<V>;
  populate<const H extends LoadHint<T1Book>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (tb: Loaded<T1Book, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<T1Book>, V>(
    hintOrOpts: any,
    fn?: (tb: Loaded<T1Book, H>) => V,
  ): Promise<Loaded<T1Book, H> | V> {
    return this.em.populate(this as any as T1Book, hintOrOpts, fn);
  }

  isLoaded<const H extends LoadHint<T1Book>>(hint: H): this is Loaded<T1Book, H> {
    return isLoaded(this as any as T1Book, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<T1Book>>(hint: H): Promise<JsonPayload<T1Book, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get author(): ManyToOneReference<T1Book, T1Author, never> {
    return this.__data.relations.author ??= hasOne(this, t1AuthorMeta, "author", "t1Books");
  }
}
