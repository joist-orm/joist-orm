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
import { EntityManager, newT3Author, T3Author, t3AuthorMeta, T3Book, t3BookMeta } from "../entities";
import type { Entity, T3BookId, T3BookOrder } from "../entities";

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

  set(opts: Partial<T3AuthorOpts>): void {
    setOpts(this as any as T3Author, opts);
  }

  setPartial(opts: PartialOrNull<T3AuthorOpts>): void {
    setOpts(this as any as T3Author, opts as OptsOf<T3Author>, { partial: true });
  }

  get changes(): Changes<T3Author> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<T3Author>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as T3Author, fn, opts);
  }

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

  isLoaded<const H extends LoadHint<T3Author>>(hint: H): this is Loaded<T3Author, H> {
    return isLoaded(this as any as T3Author, hint);
  }

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
