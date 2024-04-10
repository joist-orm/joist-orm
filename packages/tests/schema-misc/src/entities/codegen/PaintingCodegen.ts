import {
  BaseEntity,
  cleanStringValue,
  ConfigApi,
  failNoIdYet,
  getField,
  getInstanceData,
  hasOne,
  isLoaded,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  setField,
  setOpts,
  toIdOf,
} from "joist-orm";
import type {
  Changes,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  Lens,
  Loaded,
  LoadHint,
  ManyToOneReference,
  OptsOf,
  OrderBy,
  PartialOrNull,
  TaggedId,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import { Artist, artistMeta, EntityManager, newPainting, Painting, paintingMeta } from "../entities";
import type { ArtistId, ArtistOrder, Entity } from "../entities";

export type PaintingId = Flavor<string, Painting>;

export interface PaintingFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  title: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  artist: { kind: "m2o"; type: Artist; nullable: never; derived: false };
}

export interface PaintingOpts {
  title: string;
  artist: Artist | ArtistId;
}

export interface PaintingIdsOpts {
  artistId?: ArtistId | null;
}

export interface PaintingFilter {
  id?: ValueFilter<PaintingId, never> | null;
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

export abstract class PaintingCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "p";
  static readonly metadata: EntityMetadata<Painting>;

  declare readonly __orm: {
    filterType: PaintingFilter;
    gqlFilterType: PaintingGraphQLFilter;
    orderType: PaintingOrder;
    optsType: PaintingOpts;
    fieldsType: PaintingFields;
    optIdsType: PaintingIdsOpts;
    factoryOptsType: Parameters<typeof newPainting>[1];
  };

  constructor(em: EntityManager, opts: PaintingOpts) {
    super(em, opts);
    setOpts(this as any as Painting, opts, { calledFromConstructor: true });
  }

  get id(): PaintingId {
    return this.idMaybe || failNoIdYet("Painting");
  }

  get idMaybe(): PaintingId | undefined {
    return toIdOf(paintingMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("Painting");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get title(): string {
    return getField(this, "title");
  }

  set title(title: string) {
    setField(this, "title", cleanStringValue(title));
  }

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
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

  get artist(): ManyToOneReference<Painting, Artist, never> {
    const { relations } = getInstanceData(this);
    return relations.artist ??= hasOne(this as any as Painting, artistMeta, "artist", "paintings");
  }
}
