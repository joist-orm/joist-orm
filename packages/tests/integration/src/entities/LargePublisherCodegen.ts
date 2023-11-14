import {
  Changes,
  cleanStringValue,
  Collection,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  EntityOrmField,
  failNoIdYet,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  hasMany,
  isLoaded,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  newChangesProxy,
  OptsOf,
  OrderBy,
  PartialOrNull,
  setField,
  setOpts,
  TaggedId,
  toIdOf,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import { Entity } from "src/entities";
import {
  Critic,
  CriticId,
  criticMeta,
  LargePublisher,
  largePublisherMeta,
  newLargePublisher,
  Publisher,
  PublisherFields,
  PublisherFilter,
  PublisherGraphQLFilter,
  PublisherIdsOpts,
  PublisherOpts,
  PublisherOrder,
} from "./entities";
import type { EntityManager } from "./entities";

export type LargePublisherId = Flavor<string, LargePublisher> & Flavor<string, "Publisher">;

export interface LargePublisherFields extends PublisherFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: false };
  country: { kind: "primitive"; type: string; unique: false; nullable: undefined };
}

export interface LargePublisherOpts extends PublisherOpts {
  country?: string | null;
  critics?: Critic[];
}

export interface LargePublisherIdsOpts extends PublisherIdsOpts {
  criticIds?: CriticId[] | null;
}

export interface LargePublisherFilter extends PublisherFilter {
  country?: ValueFilter<string, null>;
  critics?: EntityFilter<Critic, CriticId, FilterOf<Critic>, null | undefined>;
}

export interface LargePublisherGraphQLFilter extends PublisherGraphQLFilter {
  country?: ValueGraphQLFilter<string>;
  critics?: EntityGraphQLFilter<Critic, CriticId, GraphQLFilterOf<Critic>, null | undefined>;
}

export interface LargePublisherOrder extends PublisherOrder {
  country?: OrderBy;
}

export const largePublisherConfig = new ConfigApi<LargePublisher, Context>();

export abstract class LargePublisherCodegen extends Publisher implements Entity {
  static defaultValues: object = {};
  static readonly tagName = "p";
  static readonly metadata: EntityMetadata<LargePublisher>;

  declare readonly __orm: EntityOrmField & {
    filterType: LargePublisherFilter;
    gqlFilterType: LargePublisherGraphQLFilter;
    orderType: LargePublisherOrder;
    optsType: LargePublisherOpts;
    fieldsType: LargePublisherFields;
    optIdsType: LargePublisherIdsOpts;
    factoryOptsType: Parameters<typeof newLargePublisher>[1];
  };

  constructor(em: EntityManager, opts: LargePublisherOpts) {
    // @ts-ignore
    super(em, largePublisherMeta, LargePublisherCodegen.defaultValues, opts);
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
    return this.__orm.data["id"];
  }

  get country(): string | undefined {
    return this.__orm.data["country"];
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

  populate<H extends LoadHint<LargePublisher>>(hint: H): Promise<Loaded<LargePublisher, H>>;
  populate<H extends LoadHint<LargePublisher>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<LargePublisher, H>>;
  populate<H extends LoadHint<LargePublisher>, V>(hint: H, fn: (p: Loaded<LargePublisher, H>) => V): Promise<V>;
  populate<H extends LoadHint<LargePublisher>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (p: Loaded<LargePublisher, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<LargePublisher>, V>(
    hintOrOpts: any,
    fn?: (p: Loaded<LargePublisher, H>) => V,
  ): Promise<Loaded<LargePublisher, H> | V> {
    return this.em.populate(this as any as LargePublisher, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<LargePublisher>>(hint: H): this is Loaded<LargePublisher | Publisher, H> {
    return isLoaded(this as any as LargePublisher, hint);
  }

  get critics(): Collection<LargePublisher, Critic> {
    const { relations } = this.__orm;
    return relations.critics ??= hasMany(
      this as any as LargePublisher,
      criticMeta,
      "critics",
      "favoriteLargePublisher",
      "favorite_large_publisher_id",
      undefined,
    );
  }
}
