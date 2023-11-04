import {
  BaseEntity,
  Changes,
  cleanStringValue,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  EntityOrmField,
  fail,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  hasOne,
  isLoaded,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  ManyToOneReference,
  newChangesProxy,
  newRequiredRule,
  OptsOf,
  OrderBy,
  PartialOrNull,
  setField,
  setOpts,
  toIdOf,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import {
  Author,
  AuthorId,
  authorMeta,
  AuthorOrder,
  AuthorSchedule,
  authorScheduleMeta,
  newAuthorSchedule,
} from "./entities";
import type { EntityManager } from "./entities";

export type AuthorScheduleId = Flavor<string, AuthorSchedule>;

export interface AuthorScheduleFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: false };
  overview: { kind: "primitive"; type: string; unique: false; nullable: undefined };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  author: { kind: "m2o"; type: Author; nullable: never };
}

export interface AuthorScheduleOpts {
  overview?: string | null;
  author: Author | AuthorId;
}

export interface AuthorScheduleIdsOpts {
  authorId?: AuthorId | null;
}

export interface AuthorScheduleFilter {
  id?: ValueFilter<AuthorScheduleId, never>;
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

export abstract class AuthorScheduleCodegen extends BaseEntity<EntityManager, string> {
  static defaultValues: object = {};
  static readonly tagName = "authorSchedule";
  static readonly metadata: EntityMetadata;

  declare readonly __orm: EntityOrmField & {
    filterType: AuthorScheduleFilter;
    gqlFilterType: AuthorScheduleGraphQLFilter;
    orderType: AuthorScheduleOrder;
    optsType: AuthorScheduleOpts;
    fieldsType: AuthorScheduleFields;
    optIdsType: AuthorScheduleIdsOpts;
    factoryOptsType: Parameters<typeof newAuthorSchedule>[1];
  };

  readonly author: ManyToOneReference<AuthorSchedule, Author, never> = hasOne(authorMeta, "author", "schedules");

  constructor(em: EntityManager, opts: AuthorScheduleOpts) {
    super(em, authorScheduleMeta, AuthorScheduleCodegen.defaultValues, opts);
    setOpts(this as any as AuthorSchedule, opts, { calledFromConstructor: true });
  }

  get id(): AuthorScheduleId {
    return this.idMaybe || fail("AuthorSchedule has no id yet");
  }

  get idMaybe(): AuthorScheduleId | undefined {
    return toIdOf(authorScheduleMeta, this.idTaggedMaybe);
  }

  get idTagged(): string {
    return this.idTaggedMaybe || fail("AuthorSchedule has no id tagged yet");
  }

  get idTaggedMaybe(): string | undefined {
    return this.__orm.data["id"];
  }

  get overview(): string | undefined {
    return this.__orm.data["overview"];
  }

  set overview(overview: string | undefined) {
    setField(this, "overview", cleanStringValue(overview));
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
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

  populate<H extends LoadHint<AuthorSchedule>>(hint: H): Promise<Loaded<AuthorSchedule, H>>;
  populate<H extends LoadHint<AuthorSchedule>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<AuthorSchedule, H>>;
  populate<H extends LoadHint<AuthorSchedule>, V>(
    hint: H,
    fn: (authorSchedule: Loaded<AuthorSchedule, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<AuthorSchedule>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (authorSchedule: Loaded<AuthorSchedule, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<AuthorSchedule>, V>(
    hintOrOpts: any,
    fn?: (authorSchedule: Loaded<AuthorSchedule, H>) => V,
  ): Promise<Loaded<AuthorSchedule, H> | V> {
    return this.em.populate(this as any as AuthorSchedule, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<AuthorSchedule>>(hint: H): this is Loaded<AuthorSchedule, H> {
    return isLoaded(this as any as AuthorSchedule, hint);
  }
}
