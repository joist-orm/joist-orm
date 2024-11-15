import {
  BaseEntity,
  type Changes,
  cleanStringValue,
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
  updatePartial,
  type ValueFilter,
  type ValueGraphQLFilter,
} from "joist-orm";
import { type Context } from "src/context";
import {
  Author,
  type AuthorId,
  authorMeta,
  type AuthorOrder,
  AuthorSchedule,
  authorScheduleMeta,
  type Entity,
  EntityManager,
  newAuthorSchedule,
} from "../entities";

export type AuthorScheduleId = Flavor<string, "AuthorSchedule">;

export interface AuthorScheduleFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  overview: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  author: { kind: "m2o"; type: Author; nullable: never; derived: false };
}

export interface AuthorScheduleOpts {
  overview?: string | null;
  author: Author | AuthorId;
}

export interface AuthorScheduleIdsOpts {
  authorId?: AuthorId | null;
}

export interface AuthorScheduleFilter {
  id?: ValueFilter<AuthorScheduleId, never> | null;
  overview?: ValueFilter<string, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  author?: EntityFilter<Author, AuthorId, FilterOf<Author>, never>;
}

export interface AuthorScheduleGraphQLFilter {
  id?: ValueGraphQLFilter<AuthorScheduleId>;
  overview?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  author?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, never>;
}

export interface AuthorScheduleOrder {
  id?: OrderBy;
  overview?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  author?: AuthorOrder;
}

export const authorScheduleConfig = new ConfigApi<AuthorSchedule, Context>();

authorScheduleConfig.addRule(newRequiredRule("createdAt"));
authorScheduleConfig.addRule(newRequiredRule("updatedAt"));
authorScheduleConfig.addRule(newRequiredRule("author"));

declare module "joist-orm" {
  interface TypeMap {
    AuthorSchedule: {
      entityType: AuthorSchedule;
      filterType: AuthorScheduleFilter;
      gqlFilterType: AuthorScheduleGraphQLFilter;
      orderType: AuthorScheduleOrder;
      optsType: AuthorScheduleOpts;
      fieldsType: AuthorScheduleFields;
      optIdsType: AuthorScheduleIdsOpts;
      factoryOptsType: Parameters<typeof newAuthorSchedule>[1];
    };
  }
}

export abstract class AuthorScheduleCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "authorSchedule";
  static readonly metadata: EntityMetadata<AuthorSchedule>;

  declare readonly __type: { 0: "AuthorSchedule" };

  constructor(em: EntityManager, opts: AuthorScheduleOpts) {
    super(em, opts);
    setOpts(this as any as AuthorSchedule, opts, { calledFromConstructor: true });
  }

  get id(): AuthorScheduleId {
    return this.idMaybe || failNoIdYet("AuthorSchedule");
  }

  get idMaybe(): AuthorScheduleId | undefined {
    return toIdOf(authorScheduleMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("AuthorSchedule");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get overview(): string | undefined {
    return getField(this, "overview");
  }

  set overview(overview: string | undefined) {
    setField(this, "overview", cleanStringValue(overview));
  }

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
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
  set(opts: Partial<AuthorScheduleOpts>): void {
    setOpts(this as any as AuthorSchedule, opts);
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
  setPartial(opts: PartialOrNull<AuthorScheduleOpts>): void {
    setOpts(this as any as AuthorSchedule, opts as OptsOf<AuthorSchedule>, { partial: true });
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
  setDeepPartial(opts: DeepPartialOrNull<AuthorSchedule>): Promise<void> {
    return updatePartial(this as any as AuthorSchedule, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<AuthorSchedule> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<AuthorSchedule>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as AuthorSchedule, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/docs/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<AuthorSchedule>>(hint: H): Promise<Loaded<AuthorSchedule, H>>;
  populate<const H extends LoadHint<AuthorSchedule>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<AuthorSchedule, H>>;
  populate<const H extends LoadHint<AuthorSchedule>, V>(
    hint: H,
    fn: (authorSchedule: Loaded<AuthorSchedule, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<AuthorSchedule>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (authorSchedule: Loaded<AuthorSchedule, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<AuthorSchedule>, V>(
    hintOrOpts: any,
    fn?: (authorSchedule: Loaded<AuthorSchedule, H>) => V,
  ): Promise<Loaded<AuthorSchedule, H> | V> {
    return this.em.populate(this as any as AuthorSchedule, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<AuthorSchedule>>(hint: H): this is Loaded<AuthorSchedule, H> {
    return isLoaded(this as any as AuthorSchedule, hint);
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
  toJSON<const H extends ToJsonHint<AuthorSchedule>>(hint: H): Promise<JsonPayload<AuthorSchedule, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get author(): ManyToOneReference<AuthorSchedule, Author, never> {
    return this.__data.relations.author ??= hasOne(this, authorMeta, "author", "schedules");
  }
}
