import {
  Changes,
  cleanStringValue,
  ConfigApi,
  EntityMetadata,
  EntityOrmField,
  fail,
  Flavor,
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
  PersistedAsyncProperty,
  setField,
  setOpts,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import {
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
} from "./entities";
import type { EntityManager } from "./entities";
export type SmallPublisherId = Flavor<string, "SmallPublisher"> & Flavor<string, "Publisher">;
export interface SmallPublisherFields extends PublisherFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: false };
  city: { kind: "primitive"; type: string; unique: false; nullable: never };
  allAuthorNames: { kind: "primitive"; type: string; unique: false; nullable: undefined };
}
export interface SmallPublisherOpts extends PublisherOpts {
  city: string;
}
export interface SmallPublisherIdsOpts extends PublisherIdsOpts {}
export interface SmallPublisherFilter extends PublisherFilter {
  city?: ValueFilter<string, never>;
  allAuthorNames?: ValueFilter<string, null>;
}
export interface SmallPublisherGraphQLFilter extends PublisherGraphQLFilter {
  city?: ValueGraphQLFilter<string>;
  allAuthorNames?: ValueGraphQLFilter<string>;
}
export interface SmallPublisherOrder extends PublisherOrder {
  city?: OrderBy;
  allAuthorNames?: OrderBy;
}
export const smallPublisherConfig = new ConfigApi<SmallPublisher, Context>();
smallPublisherConfig.addRule(newRequiredRule("city"));
export abstract class SmallPublisherCodegen extends Publisher {
  static defaultValues: object = {};
  static readonly tagName = "p";
  static readonly metadata: EntityMetadata<SmallPublisher>;
  declare readonly __orm: EntityOrmField & {
    filterType: SmallPublisherFilter;
    gqlFilterType: SmallPublisherGraphQLFilter;
    orderType: SmallPublisherOrder;
    optsType: SmallPublisherOpts;
    fieldsType: SmallPublisherFields;
    optIdsType: SmallPublisherIdsOpts;
    factoryOptsType: Parameters<typeof newSmallPublisher>[1];
  };
  constructor(em: EntityManager, opts: SmallPublisherOpts) {
    // @ts-ignore
    super(em, smallPublisherMeta, SmallPublisherCodegen.defaultValues, opts);
    setOpts((this as any) as SmallPublisher, opts, { calledFromConstructor: true });
  }
  get id(): SmallPublisherId | undefined {
    return this.idTagged;
  }
  get idOrFail(): SmallPublisherId {
    return this.id || fail("SmallPublisher has no id yet");
  }
  get idTagged(): SmallPublisherId | undefined {
    return this.__orm.data["id"];
  }
  get idTaggedOrFail(): SmallPublisherId {
    return this.idTagged || fail("SmallPublisher has no id tagged yet");
  }
  get city(): string {
    return this.__orm.data["city"];
  }
  set city(city: string) {
    setField(this, "city", cleanStringValue(city));
  }
  abstract readonly allAuthorNames: PersistedAsyncProperty<SmallPublisher, string | undefined>;
  set(opts: Partial<SmallPublisherOpts>): void {
    setOpts((this as any) as SmallPublisher, opts);
  }
  setPartial(opts: PartialOrNull<SmallPublisherOpts>): void {
    setOpts((this as any) as SmallPublisher, opts as OptsOf<SmallPublisher>, { partial: true });
  }
  get changes(): Changes<SmallPublisher> {
    return (newChangesProxy(this) as any);
  }
  load<U, V>(fn: (lens: Lens<SmallPublisher>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens((this as any) as SmallPublisher, fn, opts);
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
    return this.em.populate((this as any) as SmallPublisher, hintOrOpts, fn);
  }
  isLoaded<H extends LoadHint<SmallPublisher>>(hint: H): this is Loaded<SmallPublisher | Publisher, H> {
    return isLoaded((this as any) as SmallPublisher, hint);
  }
}
