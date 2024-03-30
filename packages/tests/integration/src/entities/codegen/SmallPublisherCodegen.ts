import {
  Changes,
  cleanStringValue,
  Collection,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  failNoIdYet,
  FilterOf,
  Flavor,
  getField,
  getOrmField,
  GraphQLFilterOf,
  hasMany,
  isLoaded,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  OptsOf,
  OrderBy,
  PartialOrNull,
  ReactiveField,
  setField,
  setOpts,
  TaggedId,
  toIdOf,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import {
  Entity,
  EntityManager,
  newSmallPublisher,
  Publisher,
  PublisherFields,
  PublisherFilter,
  PublisherGraphQLFilter,
  PublisherIdsOpts,
  PublisherOpts,
  PublisherOrder,
  SmallPublisher,
  smallPublisherMeta,
  User,
  UserId,
  userMeta,
} from "../entities";

export type SmallPublisherId = Flavor<string, SmallPublisher> & Flavor<string, "Publisher">;

export interface SmallPublisherFields extends PublisherFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  city: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  allAuthorNames: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: true };
}

export interface SmallPublisherOpts extends PublisherOpts {
  city: string;
  users?: User[];
}

export interface SmallPublisherIdsOpts extends PublisherIdsOpts {
  userIds?: UserId[] | null;
}

export interface SmallPublisherFilter extends PublisherFilter {
  city?: ValueFilter<string, never>;
  allAuthorNames?: ValueFilter<string, null>;
  users?: EntityFilter<User, UserId, FilterOf<User>, null | undefined>;
}

export interface SmallPublisherGraphQLFilter extends PublisherGraphQLFilter {
  city?: ValueGraphQLFilter<string>;
  allAuthorNames?: ValueGraphQLFilter<string>;
  users?: EntityGraphQLFilter<User, UserId, GraphQLFilterOf<User>, null | undefined>;
}

export interface SmallPublisherOrder extends PublisherOrder {
  city?: OrderBy;
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

  populate<H extends LoadHint<SmallPublisher>>(hint: H): Promise<Loaded<SmallPublisher, H>>;
  populate<H extends LoadHint<SmallPublisher>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<SmallPublisher, H>>;
  populate<H extends LoadHint<SmallPublisher>, V>(hint: H, fn: (p: Loaded<SmallPublisher, H>) => V): Promise<V>;
  populate<H extends LoadHint<SmallPublisher>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (p: Loaded<SmallPublisher, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<SmallPublisher>, V>(
    hintOrOpts: any,
    fn?: (p: Loaded<SmallPublisher, H>) => V,
  ): Promise<Loaded<SmallPublisher, H> | V> {
    return this.em.populate(this as any as SmallPublisher, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<SmallPublisher>>(hint: H): this is Loaded<SmallPublisher | Publisher, H> {
    return isLoaded(this as any as SmallPublisher, hint);
  }

  get users(): Collection<SmallPublisher, User> {
    const { relations } = getOrmField(this);
    return relations.users ??= hasMany(
      this as any as SmallPublisher,
      userMeta,
      "users",
      "favoritePublisher",
      "favorite_publisher_small_id",
      undefined,
    );
  }
}
