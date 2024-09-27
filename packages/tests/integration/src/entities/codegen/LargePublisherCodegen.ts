import {
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
  AdminUser,
  type AdminUserId,
  Critic,
  type CriticId,
  criticMeta,
  type Entity,
  EntityManager,
  LargePublisher,
  largePublisherMeta,
  newLargePublisher,
  Publisher,
  type PublisherFields,
  type PublisherFilter,
  type PublisherGraphQLFilter,
  type PublisherIdsOpts,
  type PublisherOpts,
  type PublisherOrder,
  User,
  type UserId,
  userMeta,
} from "../entities";

export type LargePublisherId = Flavor<string, LargePublisher> & Flavor<string, "Publisher">;

export interface LargePublisherFields extends PublisherFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  sharedColumn: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  country: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
}

export interface LargePublisherOpts extends PublisherOpts {
  sharedColumn?: string | null;
  country?: string | null;
  critics?: Critic[];
  users?: User[];
}

export interface LargePublisherIdsOpts extends PublisherIdsOpts {
  criticIds?: CriticId[] | null;
  userIds?: UserId[] | null;
}

export interface LargePublisherFilter extends PublisherFilter {
  sharedColumn?: ValueFilter<string, null>;
  country?: ValueFilter<string, null>;
  critics?: EntityFilter<Critic, CriticId, FilterOf<Critic>, null | undefined>;
  users?: EntityFilter<User, UserId, FilterOf<User>, null | undefined>;
  usersAdminUser?: EntityFilter<AdminUser, AdminUserId, FilterOf<AdminUser>, null>;
}

export interface LargePublisherGraphQLFilter extends PublisherGraphQLFilter {
  sharedColumn?: ValueGraphQLFilter<string>;
  country?: ValueGraphQLFilter<string>;
  critics?: EntityGraphQLFilter<Critic, CriticId, GraphQLFilterOf<Critic>, null | undefined>;
  users?: EntityGraphQLFilter<User, UserId, GraphQLFilterOf<User>, null | undefined>;
  usersAdminUser?: EntityGraphQLFilter<AdminUser, AdminUserId, GraphQLFilterOf<AdminUser>, null>;
}

export interface LargePublisherOrder extends PublisherOrder {
  sharedColumn?: OrderBy;
  country?: OrderBy;
}

export const largePublisherConfig = new ConfigApi<LargePublisher, Context>();

export abstract class LargePublisherCodegen extends Publisher implements Entity {
  static readonly tagName = "p";
  static readonly metadata: EntityMetadata<LargePublisher>;

  declare readonly __orm: {
    entityType: LargePublisher;
    filterType: LargePublisherFilter;
    gqlFilterType: LargePublisherGraphQLFilter;
    orderType: LargePublisherOrder;
    optsType: LargePublisherOpts;
    fieldsType: LargePublisherFields;
    optIdsType: LargePublisherIdsOpts;
    factoryOptsType: Parameters<typeof newLargePublisher>[1];
  };

  constructor(em: EntityManager, opts: LargePublisherOpts) {
    super(em, opts);
    setOpts(this as any as LargePublisher, opts, { calledFromConstructor: true });
  }

  get id(): LargePublisherId {
    return this.idMaybe || failNoIdYet("LargePublisher");
  }

  get idMaybe(): LargePublisherId | undefined {
    return toIdOf(largePublisherMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("LargePublisher");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get sharedColumn(): string | undefined {
    return getField(this, "sharedColumn");
  }

  set sharedColumn(sharedColumn: string | undefined) {
    setField(this, "sharedColumn", cleanStringValue(sharedColumn));
  }

  get country(): string | undefined {
    return getField(this, "country");
  }

  set country(country: string | undefined) {
    setField(this, "country", cleanStringValue(country));
  }

  set(opts: Partial<LargePublisherOpts>): void {
    setOpts(this as any as LargePublisher, opts);
  }

  setPartial(opts: PartialOrNull<LargePublisherOpts>): void {
    setOpts(this as any as LargePublisher, opts as OptsOf<LargePublisher>, { partial: true });
  }

  get changes(): Changes<LargePublisher> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<LargePublisher>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as LargePublisher, fn, opts);
  }

  populate<const H extends LoadHint<LargePublisher>>(hint: H): Promise<Loaded<LargePublisher, H>>;
  populate<const H extends LoadHint<LargePublisher>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<LargePublisher, H>>;
  populate<const H extends LoadHint<LargePublisher>, V>(hint: H, fn: (p: Loaded<LargePublisher, H>) => V): Promise<V>;
  populate<const H extends LoadHint<LargePublisher>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (p: Loaded<LargePublisher, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<LargePublisher>, V>(
    hintOrOpts: any,
    fn?: (p: Loaded<LargePublisher, H>) => V,
  ): Promise<Loaded<LargePublisher, H> | V> {
    return this.em.populate(this as any as LargePublisher, hintOrOpts, fn);
  }

  isLoaded<const H extends LoadHint<LargePublisher>>(hint: H): this is Loaded<LargePublisher | Publisher, H> {
    return isLoaded(this as any as LargePublisher, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<LargePublisher>>(hint: H): Promise<JsonPayload<LargePublisher, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get critics(): Collection<LargePublisher, Critic> {
    return this.__data.relations.critics ??= hasMany(
      this,
      criticMeta,
      "critics",
      "favoriteLargePublisher",
      "favorite_large_publisher_id",
      undefined,
    );
  }

  get users(): Collection<LargePublisher, User> {
    return this.__data.relations.users ??= hasMany(
      this,
      userMeta,
      "users",
      "favoritePublisher",
      "favorite_publisher_large_id",
      undefined,
    );
  }
}
