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
  TaggedId,
  toIdOf,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import { Artist, ArtistId, artistMeta, ArtistOrder, newPainting, Painting, paintingMeta } from "./entities";
import type { EntityManager } from "./entities";

export type PaintingId = Flavor<string, Painting>;

export interface PaintingFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: false };
  title: { kind: "primitive"; type: string; unique: false; nullable: never };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  artist: { kind: "m2o"; type: Artist; nullable: never };
}

export interface PaintingOpts {
  title: string;
  artist: Artist | ArtistId;
}

export interface PaintingIdsOpts {
  artistId?: ArtistId | null;
}

export interface PaintingFilter {
  id?: ValueFilter<PaintingId, never>;
  title?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  artist?: EntityFilter<Artist, ArtistId, FilterOf<Artist>, never>;
}

export interface PaintingGraphQLFilter {
  id?: ValueGraphQLFilter<PaintingId>;
  title?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  artist?: EntityGraphQLFilter<Artist, ArtistId, GraphQLFilterOf<Artist>, never>;
}

export interface PaintingOrder {
  id?: OrderBy;
  title?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  artist?: ArtistOrder;
}

export const paintingConfig = new ConfigApi<Painting, Context>();

paintingConfig.addRule(newRequiredRule("title"));
paintingConfig.addRule(newRequiredRule("createdAt"));
paintingConfig.addRule(newRequiredRule("updatedAt"));
paintingConfig.addRule(newRequiredRule("artist"));

export abstract class PaintingCodegen extends BaseEntity<EntityManager, string> {
  static defaultValues: object = {};
  static readonly tagName = "p";
  static readonly metadata: EntityMetadata<Painting>;

  declare readonly __orm: EntityOrmField & {
    filterType: PaintingFilter;
    gqlFilterType: PaintingGraphQLFilter;
    orderType: PaintingOrder;
    optsType: PaintingOpts;
    fieldsType: PaintingFields;
    optIdsType: PaintingIdsOpts;
    factoryOptsType: Parameters<typeof newPainting>[1];
  };

  readonly artist: ManyToOneReference<Painting, Artist, never> = hasOne(artistMeta, "artist", "paintings");

  constructor(em: EntityManager, opts: PaintingOpts) {
    super(em, paintingMeta, PaintingCodegen.defaultValues, opts);
    setOpts(this as any as Painting, opts, { calledFromConstructor: true });
  }

  get id(): PaintingId {
    return this.idMaybe || fail("Painting has no id yet");
  }

  get idMaybe(): PaintingId | undefined {
    return toIdOf(paintingMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || fail("Painting has no id yet");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return this.__orm.data["id"];
  }

  get title(): string {
    return this.__orm.data["title"];
  }

  set title(title: string) {
    setField(this, "title", cleanStringValue(title));
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  set(opts: Partial<PaintingOpts>): void {
    setOpts(this as any as Painting, opts);
  }

  setPartial(opts: PartialOrNull<PaintingOpts>): void {
    setOpts(this as any as Painting, opts as OptsOf<Painting>, { partial: true });
  }

  get changes(): Changes<Painting> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<Painting>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Painting, fn, opts);
  }

  populate<H extends LoadHint<Painting>>(hint: H): Promise<Loaded<Painting, H>>;
  populate<H extends LoadHint<Painting>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Painting, H>>;
  populate<H extends LoadHint<Painting>, V>(hint: H, fn: (p: Loaded<Painting, H>) => V): Promise<V>;
  populate<H extends LoadHint<Painting>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (p: Loaded<Painting, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<Painting>, V>(
    hintOrOpts: any,
    fn?: (p: Loaded<Painting, H>) => V,
  ): Promise<Loaded<Painting, H> | V> {
    return this.em.populate(this as any as Painting, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<Painting>>(hint: H): this is Loaded<Painting, H> {
    return isLoaded(this as any as Painting, hint);
  }
}
