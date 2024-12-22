import {
  BaseEntity,
  type Changes,
  cleanStringValue,
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
  updatePartial,
  type ValueFilter,
  type ValueGraphQLFilter,
} from "joist-orm";
import { type Context } from "src/context";
import { Temporal } from "temporal-polyfill";
import { Author, authorMeta, Book, type BookId, bookMeta, type Entity, EntityManager, newAuthor } from "../entities";

export type AuthorId = Flavor<string, "Author">;

export interface AuthorFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  firstName: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  lastName: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  birthday: { kind: "primitive"; type: Temporal.PlainDate; unique: false; nullable: never; derived: false };
  childrenBirthdays: { kind: "primitive"; type: Temporal.PlainDate[]; unique: false; nullable: never; derived: false };
  timestamp: { kind: "primitive"; type: Temporal.PlainDateTime; unique: false; nullable: never; derived: false };
  timestamps: { kind: "primitive"; type: Temporal.PlainDateTime[]; unique: false; nullable: never; derived: false };
  time: { kind: "primitive"; type: Temporal.PlainTime; unique: false; nullable: undefined; derived: false };
  times: { kind: "primitive"; type: Temporal.PlainTime[]; unique: false; nullable: never; derived: false };
  createdAt: { kind: "primitive"; type: Temporal.ZonedDateTime; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Temporal.ZonedDateTime; unique: false; nullable: never; derived: true };
}

export interface AuthorOpts {
  firstName: string;
  lastName?: string | null;
  birthday: Temporal.PlainDate;
  childrenBirthdays: Temporal.PlainDate[];
  timestamp: Temporal.PlainDateTime;
  timestamps: Temporal.PlainDateTime[];
  time?: Temporal.PlainTime | null;
  times: Temporal.PlainTime[];
  books?: Book[];
}

export interface AuthorIdsOpts {
  bookIds?: BookId[] | null;
}

export interface AuthorFilter {
  id?: ValueFilter<AuthorId, never> | null;
  firstName?: ValueFilter<string, never>;
  lastName?: ValueFilter<string, null>;
  birthday?: ValueFilter<Temporal.PlainDate, never>;
  childrenBirthdays?: ValueFilter<Temporal.PlainDate[], never>;
  timestamp?: ValueFilter<Temporal.PlainDateTime, never>;
  timestamps?: ValueFilter<Temporal.PlainDateTime[], never>;
  time?: ValueFilter<Temporal.PlainTime, null>;
  times?: ValueFilter<Temporal.PlainTime[], never>;
  createdAt?: ValueFilter<Temporal.ZonedDateTime, never>;
  updatedAt?: ValueFilter<Temporal.ZonedDateTime, never>;
  books?: EntityFilter<Book, BookId, FilterOf<Book>, null | undefined>;
}

export interface AuthorGraphQLFilter {
  id?: ValueGraphQLFilter<AuthorId>;
  firstName?: ValueGraphQLFilter<string>;
  lastName?: ValueGraphQLFilter<string>;
  birthday?: ValueGraphQLFilter<Temporal.PlainDate>;
  childrenBirthdays?: ValueGraphQLFilter<Temporal.PlainDate[]>;
  timestamp?: ValueGraphQLFilter<Temporal.PlainDateTime>;
  timestamps?: ValueGraphQLFilter<Temporal.PlainDateTime[]>;
  time?: ValueGraphQLFilter<Temporal.PlainTime>;
  times?: ValueGraphQLFilter<Temporal.PlainTime[]>;
  createdAt?: ValueGraphQLFilter<Temporal.ZonedDateTime>;
  updatedAt?: ValueGraphQLFilter<Temporal.ZonedDateTime>;
  books?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>, null | undefined>;
}

export interface AuthorOrder {
  id?: OrderBy;
  firstName?: OrderBy;
  lastName?: OrderBy;
  birthday?: OrderBy;
  childrenBirthdays?: OrderBy;
  timestamp?: OrderBy;
  timestamps?: OrderBy;
  time?: OrderBy;
  times?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
}

export const authorConfig = new ConfigApi<Author, Context>();

authorConfig.addRule(newRequiredRule("firstName"));
authorConfig.addRule(newRequiredRule("birthday"));
authorConfig.addRule(newRequiredRule("childrenBirthdays"));
authorConfig.addRule(newRequiredRule("timestamp"));
authorConfig.addRule(newRequiredRule("timestamps"));
authorConfig.addRule(newRequiredRule("times"));
authorConfig.addRule(newRequiredRule("createdAt"));
authorConfig.addRule(newRequiredRule("updatedAt"));

declare module "joist-orm" {
  interface TypeMap {
    Author: {
      entityType: Author;
      filterType: AuthorFilter;
      gqlFilterType: AuthorGraphQLFilter;
      orderType: AuthorOrder;
      optsType: AuthorOpts;
      fieldsType: AuthorFields;
      optIdsType: AuthorIdsOpts;
      factoryOptsType: Parameters<typeof newAuthor>[1];
    };
  }
}

export abstract class AuthorCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "a";
  static readonly metadata: EntityMetadata<Author>;

  declare readonly __type: { 0: "Author" };

  constructor(em: EntityManager, opts: AuthorOpts) {
    super(em, opts);
    setOpts(this as any as Author, opts, { calledFromConstructor: true });
  }

  get id(): AuthorId {
    return this.idMaybe || failNoIdYet("Author");
  }

  get idMaybe(): AuthorId | undefined {
    return toIdOf(authorMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("Author");
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

  get lastName(): string | undefined {
    return getField(this, "lastName");
  }

  set lastName(lastName: string | undefined) {
    setField(this, "lastName", cleanStringValue(lastName));
  }

  get birthday(): Temporal.PlainDate {
    return getField(this, "birthday");
  }

  set birthday(birthday: Temporal.PlainDate) {
    setField(this, "birthday", birthday);
  }

  get childrenBirthdays(): Temporal.PlainDate[] {
    return getField(this, "childrenBirthdays");
  }

  set childrenBirthdays(childrenBirthdays: Temporal.PlainDate[]) {
    setField(this, "childrenBirthdays", childrenBirthdays);
  }

  get timestamp(): Temporal.PlainDateTime {
    return getField(this, "timestamp");
  }

  set timestamp(timestamp: Temporal.PlainDateTime) {
    setField(this, "timestamp", timestamp);
  }

  get timestamps(): Temporal.PlainDateTime[] {
    return getField(this, "timestamps");
  }

  set timestamps(timestamps: Temporal.PlainDateTime[]) {
    setField(this, "timestamps", timestamps);
  }

  get time(): Temporal.PlainTime | undefined {
    return getField(this, "time");
  }

  set time(time: Temporal.PlainTime | undefined) {
    setField(this, "time", time);
  }

  get times(): Temporal.PlainTime[] {
    return getField(this, "times");
  }

  set times(times: Temporal.PlainTime[]) {
    setField(this, "times", times);
  }

  get createdAt(): Temporal.ZonedDateTime {
    return getField(this, "createdAt");
  }

  get updatedAt(): Temporal.ZonedDateTime {
    return getField(this, "updatedAt");
  }

  /**
   * Partial update taking any subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  set(opts: Partial<AuthorOpts>): void {
    setOpts(this as any as Author, opts);
  }

  /**
   * Partial update taking any subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setPartial(opts: PartialOrNull<AuthorOpts>): void {
    setOpts(this as any as Author, opts as OptsOf<Author>, { partial: true });
  }

  /**
   * Partial update taking any nested subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
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
   * @see {@link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setDeepPartial(opts: DeepPartialOrNull<Author>): Promise<void> {
    return updatePartial(this as any as Author, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<Author> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<Author>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Author, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/docs/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<Author>>(hint: H): Promise<Loaded<Author, H>>;
  populate<const H extends LoadHint<Author>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Author, H>>;
  populate<const H extends LoadHint<Author>, V>(hint: H, fn: (a: Loaded<Author, H>) => V): Promise<V>;
  populate<const H extends LoadHint<Author>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (a: Loaded<Author, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<Author>, V>(
    hintOrOpts: any,
    fn?: (a: Loaded<Author, H>) => V,
  ): Promise<Loaded<Author, H> | V> {
    return this.em.populate(this as any as Author, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<Author>>(hint: H): this is Loaded<Author, H> {
    return isLoaded(this as any as Author, hint);
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
   * @see {@link https://joist-orm.io/docs/advanced/json-payloads | Json Payloads} on the Joist docs
   */
  toJSON(): object;
  toJSON<const H extends ToJsonHint<Author>>(hint: H): Promise<JsonPayload<Author, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get books(): Collection<Author, Book> {
    return this.__data.relations.books ??= hasMany(this, bookMeta, "books", "author", "author_id", undefined);
  }
}
