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
  newT5Author,
  T5Author,
  t5AuthorMeta,
  T5Book,
  type T5BookId,
  t5BookMeta,
} from "../entities";

export type T5AuthorId = Flavor<number, T5Author>;

export interface T5AuthorFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  firstName: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
}

export interface T5AuthorOpts {
  firstName: string;
  t5Books?: T5Book[];
}

export interface T5AuthorIdsOpts {
  t5BookIds?: T5BookId[] | null;
}

export interface T5AuthorFilter {
  id?: ValueFilter<T5AuthorId, never> | null;
  firstName?: ValueFilter<string, never>;
  t5Books?: EntityFilter<T5Book, T5BookId, FilterOf<T5Book>, null | undefined>;
}

export interface T5AuthorGraphQLFilter {
  id?: ValueGraphQLFilter<T5AuthorId>;
  firstName?: ValueGraphQLFilter<string>;
  t5Books?: EntityGraphQLFilter<T5Book, T5BookId, GraphQLFilterOf<T5Book>, null | undefined>;
}

export interface T5AuthorOrder {
  id?: OrderBy;
  firstName?: OrderBy;
}

export const t5AuthorConfig = new ConfigApi<T5Author, Context>();

t5AuthorConfig.addRule(newRequiredRule("firstName"));

export abstract class T5AuthorCodegen extends BaseEntity<EntityManager, number> implements Entity {
  static readonly tagName = "t5Author";
  static readonly metadata: EntityMetadata<T5Author>;

  declare readonly __orm: {
    filterType: T5AuthorFilter;
    gqlFilterType: T5AuthorGraphQLFilter;
    orderType: T5AuthorOrder;
    optsType: T5AuthorOpts;
    fieldsType: T5AuthorFields;
    optIdsType: T5AuthorIdsOpts;
    factoryOptsType: Parameters<typeof newT5Author>[1];
  };

  constructor(em: EntityManager, opts: T5AuthorOpts) {
    super(em, opts);
    setOpts(this as any as T5Author, opts, { calledFromConstructor: true });
  }

  get id(): T5AuthorId {
    return this.idMaybe || failNoIdYet("T5Author");
  }

  get idMaybe(): T5AuthorId | undefined {
    return toIdOf(t5AuthorMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("T5Author");
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

  set(opts: Partial<T5AuthorOpts>): void {
    setOpts(this as any as T5Author, opts);
  }

  setPartial(opts: PartialOrNull<T5AuthorOpts>): void {
    setOpts(this as any as T5Author, opts as OptsOf<T5Author>, { partial: true });
  }

  get changes(): Changes<T5Author> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<T5Author>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as T5Author, fn, opts);
  }

  populate<const H extends LoadHint<T5Author>>(hint: H): Promise<Loaded<T5Author, H>>;
  populate<const H extends LoadHint<T5Author>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<T5Author, H>>;
  populate<const H extends LoadHint<T5Author>, V>(hint: H, fn: (t5Author: Loaded<T5Author, H>) => V): Promise<V>;
  populate<const H extends LoadHint<T5Author>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (t5Author: Loaded<T5Author, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<T5Author>, V>(
    hintOrOpts: any,
    fn?: (t5Author: Loaded<T5Author, H>) => V,
  ): Promise<Loaded<T5Author, H> | V> {
    return this.em.populate(this as any as T5Author, hintOrOpts, fn);
  }

  isLoaded<const H extends LoadHint<T5Author>>(hint: H): this is Loaded<T5Author, H> {
    return isLoaded(this as any as T5Author, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<T5Author>>(hint: H): Promise<JsonPayload<T5Author, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get t5Books(): Collection<T5Author, T5Book> {
    return this.__data.relations.t5Books ??= hasMany(
      this as any as T5Author,
      t5BookMeta,
      "t5Books",
      "author",
      "author_id",
      undefined,
    );
  }
}
