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
  isLoaded,
  type JsonPayload,
  type Lens,
  type Loaded,
  type LoadHint,
  loadLens,
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
  newT1Author,
  T1Author,
  t1AuthorMeta,
  T1Book,
  type T1BookId,
  t1BookMeta,
} from "../entities";

export type T1AuthorId = Flavor<number, T1Author>;

export interface T1AuthorFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  firstName: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
}

export interface T1AuthorOpts {
  firstName: string;
  t1Books?: T1Book[];
}

export interface T1AuthorIdsOpts {
  t1BookIds?: T1BookId[] | null;
}

export interface T1AuthorFilter {
  id?: ValueFilter<T1AuthorId, never> | null;
  firstName?: ValueFilter<string, never>;
  t1Books?: EntityFilter<T1Book, T1BookId, FilterOf<T1Book>, null | undefined>;
}

export interface T1AuthorGraphQLFilter {
  id?: ValueGraphQLFilter<T1AuthorId>;
  firstName?: ValueGraphQLFilter<string>;
  t1Books?: EntityGraphQLFilter<T1Book, T1BookId, GraphQLFilterOf<T1Book>, null | undefined>;
}

export interface T1AuthorOrder {
  id?: OrderBy;
  firstName?: OrderBy;
}

export const t1AuthorConfig = new ConfigApi<T1Author, Context>();

t1AuthorConfig.addRule(newRequiredRule("firstName"));

export abstract class T1AuthorCodegen extends BaseEntity<EntityManager, number> implements Entity {
  static readonly tagName = "ta";
  static readonly metadata: EntityMetadata<T1Author>;

  declare readonly __orm: {
    entityType: T1Author;
    filterType: T1AuthorFilter;
    gqlFilterType: T1AuthorGraphQLFilter;
    orderType: T1AuthorOrder;
    optsType: T1AuthorOpts;
    fieldsType: T1AuthorFields;
    optIdsType: T1AuthorIdsOpts;
    factoryOptsType: Parameters<typeof newT1Author>[1];
  };

  constructor(em: EntityManager, opts: T1AuthorOpts) {
    super(em, opts);
    setOpts(this as any as T1Author, opts, { calledFromConstructor: true });
  }

  get id(): T1AuthorId {
    return this.idMaybe || failNoIdYet("T1Author");
  }

  get idMaybe(): T1AuthorId | undefined {
    return toIdOf(t1AuthorMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("T1Author");
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

  set(opts: Partial<T1AuthorOpts>): void {
    setOpts(this as any as T1Author, opts);
  }

  setPartial(opts: PartialOrNull<T1AuthorOpts>): void {
    setOpts(this as any as T1Author, opts as OptsOf<T1Author>, { partial: true });
  }

  get changes(): Changes<T1Author> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<T1Author>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as T1Author, fn, opts);
  }

  populate<const H extends LoadHint<T1Author>>(hint: H): Promise<Loaded<T1Author, H>>;
  populate<const H extends LoadHint<T1Author>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<T1Author, H>>;
  populate<const H extends LoadHint<T1Author>, V>(hint: H, fn: (ta: Loaded<T1Author, H>) => V): Promise<V>;
  populate<const H extends LoadHint<T1Author>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (ta: Loaded<T1Author, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<T1Author>, V>(
    hintOrOpts: any,
    fn?: (ta: Loaded<T1Author, H>) => V,
  ): Promise<Loaded<T1Author, H> | V> {
    return this.em.populate(this as any as T1Author, hintOrOpts, fn);
  }

  isLoaded<const H extends LoadHint<T1Author>>(hint: H): this is Loaded<T1Author, H> {
    return isLoaded(this as any as T1Author, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<T1Author>>(hint: H): Promise<JsonPayload<T1Author, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get t1Books(): Collection<T1Author, T1Book> {
    return this.__data.relations.t1Books ??= hasMany(
      this as any as T1Author,
      t1BookMeta,
      "t1Books",
      "author",
      "author_id",
      undefined,
    );
  }
}
