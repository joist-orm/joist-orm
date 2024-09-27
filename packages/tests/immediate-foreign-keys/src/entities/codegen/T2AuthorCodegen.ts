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

  set(opts: Partial<T2AuthorOpts>): void {
    setOpts(this as any as T2Author, opts);
  }

  setPartial(opts: PartialOrNull<T2AuthorOpts>): void {
    setOpts(this as any as T2Author, opts as OptsOf<T2Author>, { partial: true });
  }

  get changes(): Changes<T2Author> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<T2Author>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as T2Author, fn, opts);
  }

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

  isLoaded<const H extends LoadHint<T2Author>>(hint: H): this is Loaded<T2Author, H> {
    return isLoaded(this as any as T2Author, hint);
  }

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
