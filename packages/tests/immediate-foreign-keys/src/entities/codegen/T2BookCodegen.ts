import {
  BaseEntity,
  cleanStringValue,
  ConfigApi,
  failNoIdYet,
  getField,
  hasMany,
  hasOne,
  isLoaded,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  setField,
  setOpts,
  toIdOf,
  toJSON,
} from "joist-orm";
import type {
  Changes,
  Collection,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  JsonPayload,
  Lens,
  Loaded,
  LoadHint,
  ManyToOneReference,
  OptsOf,
  OrderBy,
  PartialOrNull,
  TaggedId,
  ToJsonHint,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import { EntityManager, newT2Book, T2Author, t2AuthorMeta, T2Book, t2BookMeta } from "../entities";
import type { Entity, T2AuthorId, T2AuthorOrder } from "../entities";

export type T2BookId = Flavor<number, T2Book>;

export interface T2BookFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  title: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  author: { kind: "m2o"; type: T2Author; nullable: never; derived: false };
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

export const t2BookConfig = new ConfigApi<T2Book, Context>();

t2BookConfig.addRule(newRequiredRule("title"));
t2BookConfig.addRule(newRequiredRule("author"));

export abstract class T2BookCodegen extends BaseEntity<EntityManager, number> implements Entity {
  static readonly tagName = "t2Book";
  static readonly metadata: EntityMetadata<T2Book>;

  declare readonly __orm: {
    filterType: T2BookFilter;
    gqlFilterType: T2BookGraphQLFilter;
    orderType: T2BookOrder;
    optsType: T2BookOpts;
    fieldsType: T2BookFields;
    optIdsType: T2BookIdsOpts;
    factoryOptsType: Parameters<typeof newT2Book>[1];
  };

  constructor(em: EntityManager, opts: T2BookOpts) {
    super(em, opts);
    setOpts(this as any as T2Book, opts, { calledFromConstructor: true });
  }

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
    setField(this, "title", cleanStringValue(title));
  }

  set(opts: Partial<T2BookOpts>): void {
    setOpts(this as any as T2Book, opts);
  }

  setPartial(opts: PartialOrNull<T2BookOpts>): void {
    setOpts(this as any as T2Book, opts as OptsOf<T2Book>, { partial: true });
  }

  get changes(): Changes<T2Book> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<T2Book>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as T2Book, fn, opts);
  }

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

  isLoaded<const H extends LoadHint<T2Book>>(hint: H): this is Loaded<T2Book, H> {
    return isLoaded(this as any as T2Book, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<T2Book>>(hint: H): Promise<JsonPayload<T2Book, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get t2Authors(): Collection<T2Book, T2Author> {
    return this.__data.relations.t2Authors ??= hasMany(
      this as any as T2Book,
      t2AuthorMeta,
      "t2Authors",
      "favoriteBook",
      "favorite_book_id",
      undefined,
    );
  }

  get author(): ManyToOneReference<T2Book, T2Author, never> {
    return this.__data.relations.author ??= hasOne(this as any as T2Book, t2AuthorMeta, "author", "t2Books");
  }
}
