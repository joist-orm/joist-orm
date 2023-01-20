import {
  Changes,
  ConfigApi,
  EntityOrmField,
  fail,
  Flavor,
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
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import {
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

export type LargePublisherId = Flavor<string, "LargePublisher"> & Flavor<string, "Publisher">;

export interface LargePublisherFields extends PublisherFields {
  country: string | undefined;
}

export interface LargePublisherOpts extends PublisherOpts {
  country?: string | null;
}

export interface LargePublisherIdsOpts extends PublisherIdsOpts {
}

export interface LargePublisherFilter extends PublisherFilter {
  country?: ValueFilter<string, null | undefined>;
}

export interface LargePublisherGraphQLFilter extends PublisherGraphQLFilter {
  country?: ValueGraphQLFilter<string>;
}

export interface LargePublisherOrder extends PublisherOrder {
  country?: OrderBy;
}

export const largePublisherConfig = new ConfigApi<LargePublisher, Context>();

export abstract class LargePublisherCodegen extends Publisher {
  static defaultValues: object = {};

  readonly __orm!: EntityOrmField & {
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

  get id(): LargePublisherId | undefined {
    return this.idTagged;
  }

  get idOrFail(): LargePublisherId {
    return this.id || fail("LargePublisher has no id yet");
  }

  get idTagged(): LargePublisherId | undefined {
    return this.__orm.data["id"];
  }

  get idTaggedOrFail(): LargePublisherId {
    return this.idTagged || fail("LargePublisher has no id tagged yet");
  }

  get country(): string | undefined {
    return this.__orm.data["country"];
  }

  set country(country: string | undefined) {
    setField(this, "country", country);
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

  load<U, V>(fn: (lens: Lens<LargePublisher>) => Lens<U, V>): Promise<V> {
    return loadLens(this as any as LargePublisher, fn);
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
}
