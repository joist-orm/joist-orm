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
  type ReactiveField,
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
  Author,
  BookAdvance,
  Comment,
  type Entity,
  EntityManager,
  Image,
  newSmallPublisher,
  Publisher,
  type PublisherFields,
  type PublisherFilter,
  type PublisherGraphQLFilter,
  PublisherGroup,
  type PublisherIdsOpts,
  type PublisherOpts,
  type PublisherOrder,
  SmallPublisher,
  smallPublisherMeta,
  Tag,
  TaskOld,
  User,
  type UserId,
  userMeta,
} from "../entities";

export type SmallPublisherId = Flavor<string, SmallPublisher> & Flavor<string, "Publisher">;

export interface SmallPublisherFields extends PublisherFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  city: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  sharedColumn: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  allAuthorNames: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: true };
  selfReferential: { kind: "m2o"; type: SmallPublisher; nullable: undefined; derived: false };
}

export interface SmallPublisherOpts extends PublisherOpts {
  city: string;
  sharedColumn?: string | null;
  selfReferential?: SmallPublisher | SmallPublisherId | null;
  smallPublishers?: SmallPublisher[];
  users?: User[];
}

export interface SmallPublisherIdsOpts extends PublisherIdsOpts {
  selfReferentialId?: SmallPublisherId | null;
  smallPublisherIds?: SmallPublisherId[] | null;
  userIds?: UserId[] | null;
}

export interface SmallPublisherFilter extends PublisherFilter {
  city?: ValueFilter<string, never>;
  sharedColumn?: ValueFilter<string, null>;
  allAuthorNames?: ValueFilter<string, null>;
  selfReferential?: EntityFilter<SmallPublisher, SmallPublisherId, FilterOf<SmallPublisher>, null>;
  smallPublishers?: EntityFilter<SmallPublisher, SmallPublisherId, FilterOf<SmallPublisher>, null | undefined>;
  users?: EntityFilter<User, UserId, FilterOf<User>, null | undefined>;
  usersAdminUser?: EntityFilter<AdminUser, AdminUserId, FilterOf<AdminUser>, null>;
}

export interface SmallPublisherGraphQLFilter extends PublisherGraphQLFilter {
  city?: ValueGraphQLFilter<string>;
  sharedColumn?: ValueGraphQLFilter<string>;
  allAuthorNames?: ValueGraphQLFilter<string>;
  selfReferential?: EntityGraphQLFilter<SmallPublisher, SmallPublisherId, GraphQLFilterOf<SmallPublisher>, null>;
  smallPublishers?: EntityGraphQLFilter<
    SmallPublisher,
    SmallPublisherId,
    GraphQLFilterOf<SmallPublisher>,
    null | undefined
  >;
  users?: EntityGraphQLFilter<User, UserId, GraphQLFilterOf<User>, null | undefined>;
  usersAdminUser?: EntityGraphQLFilter<AdminUser, AdminUserId, GraphQLFilterOf<AdminUser>, null>;
}

export interface SmallPublisherOrder extends PublisherOrder {
  city?: OrderBy;
  sharedColumn?: OrderBy;
  allAuthorNames?: OrderBy;
  selfReferential?: SmallPublisherOrder;
}

export const smallPublisherConfig = new ConfigApi<SmallPublisher, Context>();

smallPublisherConfig.addRule(newRequiredRule("city"));

export abstract class SmallPublisherCodegen extends Publisher implements Entity {
  static readonly tagName = "p";
  static readonly metadata: EntityMetadata<SmallPublisher>;

  declare readonly __orm: {
    entityType: SmallPublisher;
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

  get smallPublishers(): Collection<SmallPublisher, SmallPublisher> {
    return this.__data.relations.smallPublishers ??= hasMany(
      this,
      smallPublisherMeta,
      "smallPublishers",
      "selfReferential",
      "self_referential_id",
      undefined,
    );
  }

  get users(): Collection<SmallPublisher, User> {
    return this.__data.relations.users ??= hasMany(
      this,
      userMeta,
      "users",
      "favoritePublisher",
      "favorite_publisher_small_id",
      undefined,
    );
  }

  get selfReferential(): ManyToOneReference<SmallPublisher, SmallPublisher, undefined> {
    return this.__data.relations.selfReferential ??= hasOne(
      this,
      smallPublisherMeta,
      "selfReferential",
      "smallPublishers",
    );
  }

  get authors(): Collection<SmallPublisher, Author> {
    return super.authors as Collection<SmallPublisher, Author>;
  }

  get bookAdvances(): Collection<SmallPublisher, BookAdvance> {
    return super.bookAdvances as Collection<SmallPublisher, BookAdvance>;
  }

  get comments(): Collection<SmallPublisher, Comment> {
    return super.comments as Collection<SmallPublisher, Comment>;
  }

  get images(): Collection<SmallPublisher, Image> {
    return super.images as Collection<SmallPublisher, Image>;
  }

  get group(): ManyToOneReference<SmallPublisher, PublisherGroup, undefined> {
    return super.group as ManyToOneReference<SmallPublisher, PublisherGroup, undefined>;
  }

  get tags(): Collection<SmallPublisher, Tag> {
    return super.tags as Collection<SmallPublisher, Tag>;
  }

  get tasks(): Collection<SmallPublisher, TaskOld> {
    return super.tasks as Collection<SmallPublisher, TaskOld>;
  }
}
