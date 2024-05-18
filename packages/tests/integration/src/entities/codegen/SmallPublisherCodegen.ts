import {
  cleanStringValue,
  ConfigApi,
  failNoIdYet,
  getField,
  hasMany,
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
  OptsOf,
  OrderBy,
  PartialOrNull,
  ReactiveField,
  TaggedId,
  ToJsonHint,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import {
  AdminUser,
  EntityManager,
  newSmallPublisher,
  Publisher,
  SmallPublisher,
  smallPublisherMeta,
  User,
  userMeta,
} from "../entities";
import type {
  AdminUserId,
  Entity,
  PublisherFields,
  PublisherFilter,
  PublisherGraphQLFilter,
  PublisherIdsOpts,
  PublisherOpts,
  PublisherOrder,
  UserId,
} from "../entities";

export type SmallPublisherId = Flavor<string, SmallPublisher> & Flavor<string, "Publisher">;

export interface SmallPublisherFields extends PublisherFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  city: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  sharedColumn: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  allAuthorNames: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: true };
}

export interface SmallPublisherOpts extends PublisherOpts {
  city: string;
  sharedColumn?: string | null;
  users?: User[];
}

export interface SmallPublisherIdsOpts extends PublisherIdsOpts {
  userIds?: UserId[] | null;
}

export interface SmallPublisherFilter extends PublisherFilter {
  city?: ValueFilter<string, never>;
  sharedColumn?: ValueFilter<string, null>;
  allAuthorNames?: ValueFilter<string, null>;
  users?: EntityFilter<User, UserId, FilterOf<User>, null | undefined>;
  usersAdminUser?: EntityFilter<AdminUser, AdminUserId, FilterOf<AdminUser>, null | undefined>;
}

export interface SmallPublisherGraphQLFilter extends PublisherGraphQLFilter {
  city?: ValueGraphQLFilter<string>;
  sharedColumn?: ValueGraphQLFilter<string>;
  allAuthorNames?: ValueGraphQLFilter<string>;
  users?: EntityGraphQLFilter<User, UserId, GraphQLFilterOf<User>, null | undefined>;
}

export interface SmallPublisherOrder extends PublisherOrder {
  city?: OrderBy;
  sharedColumn?: OrderBy;
  allAuthorNames?: OrderBy;
}

export const smallPublisherConfig = new ConfigApi<SmallPublisher, Context>();

smallPublisherConfig.addRule(newRequiredRule("city"));

export abstract class SmallPublisherCodegen extends Publisher implements Entity {
  static readonly tagName = "p";
  static readonly metadata: EntityMetadata<SmallPublisher>;

  declare readonly __orm: {
    filterType: SmallPublisherFilter;
    gqlFilterType: SmallPublisherGraphQLFilter;
    orderType: SmallPublisherOrder;
    optsType: SmallPublisherOpts;
    fieldsType: SmallPublisherFields;
    optIdsType: SmallPublisherIdsOpts;
    factoryOptsType: Parameters<typeof newSmallPublisher>[1];
  };

  constructor(em: EntityManager, opts: SmallPublisherOpts) {
    super(em, opts);
    setOpts(this as any as SmallPublisher, opts, { calledFromConstructor: true });
  }

  get id(): SmallPublisherId {
    return this.idMaybe || failNoIdYet("SmallPublisher");
  }

  get idMaybe(): SmallPublisherId | undefined {
    return toIdOf(smallPublisherMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("SmallPublisher");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get city(): string {
    return getField(this, "city");
  }

  set city(city: string) {
    setField(this, "city", cleanStringValue(city));
  }

  get sharedColumn(): string | undefined {
    return getField(this, "sharedColumn");
  }

  set sharedColumn(sharedColumn: string | undefined) {
    setField(this, "sharedColumn", cleanStringValue(sharedColumn));
  }

  abstract readonly allAuthorNames: ReactiveField<SmallPublisher, string | undefined>;

  set(opts: Partial<SmallPublisherOpts>): void {
    setOpts(this as any as SmallPublisher, opts);
  }

  setPartial(opts: PartialOrNull<SmallPublisherOpts>): void {
    setOpts(this as any as SmallPublisher, opts as OptsOf<SmallPublisher>, { partial: true });
  }

  get changes(): Changes<SmallPublisher> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<SmallPublisher>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as SmallPublisher, fn, opts);
  }

  populate<const H extends LoadHint<SmallPublisher>>(hint: H): Promise<Loaded<SmallPublisher, H>>;
  populate<const H extends LoadHint<SmallPublisher>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<SmallPublisher, H>>;
  populate<const H extends LoadHint<SmallPublisher>, V>(hint: H, fn: (p: Loaded<SmallPublisher, H>) => V): Promise<V>;
  populate<const H extends LoadHint<SmallPublisher>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (p: Loaded<SmallPublisher, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<SmallPublisher>, V>(
    hintOrOpts: any,
    fn?: (p: Loaded<SmallPublisher, H>) => V,
  ): Promise<Loaded<SmallPublisher, H> | V> {
    return this.em.populate(this as any as SmallPublisher, hintOrOpts, fn);
  }

  isLoaded<const H extends LoadHint<SmallPublisher>>(hint: H): this is Loaded<SmallPublisher | Publisher, H> {
    return isLoaded(this as any as SmallPublisher, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<SmallPublisher>>(hint: H): Promise<JsonPayload<SmallPublisher, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get users(): Collection<SmallPublisher, User> {
    return this.__data.relations.users ??= hasMany(
      this as any as SmallPublisher,
      userMeta,
      "users",
      "favoritePublisher",
      "favorite_publisher_small_id",
      undefined,
    );
  }
}
