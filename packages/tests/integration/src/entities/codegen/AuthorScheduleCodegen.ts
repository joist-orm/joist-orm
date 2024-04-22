import {
  BaseEntity,
  cleanStringValue,
  ConfigApi,
  failNoIdYet,
  getField,
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
import { Temporal } from "temporal-polyfill";
import { Author, authorMeta, AuthorSchedule, authorScheduleMeta, EntityManager, newAuthorSchedule } from "../entities";
import type { AuthorId, AuthorOrder, Entity } from "../entities";

export type AuthorScheduleId = Flavor<string, AuthorSchedule>;

export interface AuthorScheduleFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  overview: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  createdAt: { kind: "primitive"; type: Temporal.ZonedDateTime; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Temporal.ZonedDateTime; unique: false; nullable: never; derived: true };
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
  createdAt?: ValueFilter<Temporal.ZonedDateTime, never>;
  updatedAt?: ValueFilter<Temporal.ZonedDateTime, never>;
  author?: EntityFilter<Author, AuthorId, FilterOf<Author>, never>;
}

export interface AuthorScheduleGraphQLFilter {
  id?: ValueGraphQLFilter<AuthorScheduleId>;
  overview?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Temporal.ZonedDateTime>;
  updatedAt?: ValueGraphQLFilter<Temporal.ZonedDateTime>;
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

export abstract class AuthorScheduleCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "authorSchedule";
  static readonly metadata: EntityMetadata<AuthorSchedule>;

  declare readonly __orm: {
    filterType: AuthorScheduleFilter;
    gqlFilterType: AuthorScheduleGraphQLFilter;
    orderType: AuthorScheduleOrder;
    optsType: AuthorScheduleOpts;
    fieldsType: AuthorScheduleFields;
    optIdsType: AuthorScheduleIdsOpts;
    factoryOptsType: Parameters<typeof newAuthorSchedule>[1];
  };

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

  get createdAt(): Temporal.ZonedDateTime {
    return getField(this, "createdAt");
  }

  get updatedAt(): Temporal.ZonedDateTime {
    return getField(this, "updatedAt");
  }

  set(opts: Partial<AuthorScheduleOpts>): void {
    setOpts(this as any as AuthorSchedule, opts);
  }

  setPartial(opts: PartialOrNull<AuthorScheduleOpts>): void {
    setOpts(this as any as AuthorSchedule, opts as OptsOf<AuthorSchedule>, { partial: true });
  }

  get changes(): Changes<AuthorSchedule> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<AuthorSchedule>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as AuthorSchedule, fn, opts);
  }

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

  isLoaded<const H extends LoadHint<AuthorSchedule>>(hint: H): this is Loaded<AuthorSchedule, H> {
    return isLoaded(this as any as AuthorSchedule, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<AuthorSchedule>>(hint: H): Promise<JsonPayload<AuthorSchedule, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get author(): ManyToOneReference<AuthorSchedule, Author, never> {
    return this.__data.relations.author ??= hasOne(this as any as AuthorSchedule, authorMeta, "author", "schedules");
  }
}
