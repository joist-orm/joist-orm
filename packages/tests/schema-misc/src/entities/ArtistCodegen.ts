import {
  BaseEntity,
  Changes,
  Collection,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  EntityOrmField,
  fail,
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
  newRequiredRule,
  OptsOf,
  OrderBy,
  PartialOrNull,
  setField,
  setOpts,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import { Artist, artistMeta, newArtist, Painting, PaintingId, paintingMeta } from "./entities";
import type { EntityManager } from "./entities";

export type ArtistId = Flavor<string, "Artist">;

export interface ArtistFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: false };
  firstName: { kind: "primitive"; type: string; unique: false; nullable: never };
  lastName: { kind: "primitive"; type: string; unique: false; nullable: never };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
}

export interface ArtistOpts {
  firstName: string;
  lastName: string;
  paintings?: Painting[];
}

export interface ArtistIdsOpts {
  paintingIds?: PaintingId[] | null;
}

export interface ArtistFilter {
  id?: ValueFilter<ArtistId, never>;
  firstName?: ValueFilter<string, never>;
  lastName?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  paintings?: EntityFilter<Painting, PaintingId, FilterOf<Painting>, null | undefined>;
}

export interface ArtistGraphQLFilter {
  id?: ValueGraphQLFilter<ArtistId>;
  firstName?: ValueGraphQLFilter<string>;
  lastName?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  paintings?: EntityGraphQLFilter<Painting, PaintingId, GraphQLFilterOf<Painting>, null | undefined>;
}

export interface ArtistOrder {
  id?: OrderBy;
  firstName?: OrderBy;
  lastName?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
}

export const artistConfig = new ConfigApi<Artist, Context>();

artistConfig.addRule(newRequiredRule("firstName"));
artistConfig.addRule(newRequiredRule("lastName"));
artistConfig.addRule(newRequiredRule("createdAt"));
artistConfig.addRule(newRequiredRule("updatedAt"));

export abstract class ArtistCodegen extends BaseEntity<EntityManager> {
  static defaultValues: object = {};
  static readonly tagName = "artist";
  static readonly metadata: EntityMetadata<any>;

  declare readonly __orm: EntityOrmField & {
    filterType: ArtistFilter;
    gqlFilterType: ArtistGraphQLFilter;
    orderType: ArtistOrder;
    optsType: ArtistOpts;
    fieldsType: ArtistFields;
    optIdsType: ArtistIdsOpts;
    factoryOptsType: Parameters<typeof newArtist>[1];
  };

  readonly paintings: Collection<Artist, Painting> = hasMany(
    paintingMeta,
    "paintings",
    "artist",
    "artistId",
    undefined,
  );

  constructor(em: EntityManager, opts: ArtistOpts) {
    super(em, artistMeta, ArtistCodegen.defaultValues, opts);
    setOpts(this as any as Artist, opts, { calledFromConstructor: true });
  }

  get id(): ArtistId | undefined {
    return this.idTagged;
  }

  get idOrFail(): ArtistId {
    return this.id || fail("Artist has no id yet");
  }

  get idTagged(): ArtistId | undefined {
    return this.__orm.data["id"];
  }

  get idTaggedOrFail(): ArtistId {
    return this.idTagged || fail("Artist has no id tagged yet");
  }

  get firstName(): string {
    return this.__orm.data["firstName"];
  }

  set firstName(firstName: string) {
    setField(this, "firstName", firstName);
  }

  get lastName(): string {
    return this.__orm.data["lastName"];
  }

  set lastName(lastName: string) {
    setField(this, "lastName", lastName);
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  set(opts: Partial<ArtistOpts>): void {
    setOpts(this as any as Artist, opts);
  }

  setPartial(opts: PartialOrNull<ArtistOpts>): void {
    setOpts(this as any as Artist, opts as OptsOf<Artist>, { partial: true });
  }

  get changes(): Changes<Artist> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<Artist>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Artist, fn, opts);
  }

  populate<H extends LoadHint<Artist>>(hint: H): Promise<Loaded<Artist, H>>;
  populate<H extends LoadHint<Artist>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Artist, H>>;
  populate<H extends LoadHint<Artist>, V>(hint: H, fn: (artist: Loaded<Artist, H>) => V): Promise<V>;
  populate<H extends LoadHint<Artist>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (artist: Loaded<Artist, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<Artist>, V>(
    hintOrOpts: any,
    fn?: (artist: Loaded<Artist, H>) => V,
  ): Promise<Loaded<Artist, H> | V> {
    return this.em.populate(this as any as Artist, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<Artist>>(hint: H): this is Loaded<Artist, H> {
    return isLoaded(this as any as Artist, hint);
  }
}
