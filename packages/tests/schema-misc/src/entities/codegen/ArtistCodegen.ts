import {
  BaseEntity,
  type Changes,
  cleanStringValue,
  type Collection,
  ConfigApi,
  type DeepPartialOrNull,
  type EntityFilter,
  type EntityGraphQLFilter,
  type EntityMetadata,
  failNoIdYet,
  type FilterOf,
  type Flavor,
  getField,
  type GetLens,
  getLens,
  type GraphQLFilterOf,
  hasMany,
  isLoaded,
  type JsonPayload,
  type Lens,
  type Loaded,
  type LoadHint,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  type OptsOf,
  type OrderBy,
  type PartialOrNull,
  setField,
  setOpts,
  type TaggedId,
  toIdOf,
  toJSON,
  type ToJsonHint,
  updatePartial,
  type ValueFilter,
  type ValueGraphQLFilter,
} from "joist-orm";
import { type Context } from "src/context";
import {
  Artist,
  artistMeta,
  type Entity,
  EntityManager,
  newArtist,
  Painting,
  type PaintingId,
  paintingMeta,
} from "../entities";

export type ArtistId = Flavor<string, "Artist">;

export interface ArtistFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  firstName: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  lastName: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  paintings: { kind: "o2m"; type: Painting };
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
  id?: ValueFilter<ArtistId, never> | null;
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

export interface ArtistFactoryExtras {
}

export const artistConfig = new ConfigApi<Artist, Context>();

artistConfig.addRule(newRequiredRule("firstName"));
artistConfig.addRule(newRequiredRule("lastName"));
artistConfig.addRule(newRequiredRule("createdAt"));
artistConfig.addRule(newRequiredRule("updatedAt"));

declare module "joist-orm" {
  interface TypeMap {
    Artist: {
      entityType: Artist;
      filterType: ArtistFilter;
      gqlFilterType: ArtistGraphQLFilter;
      orderType: ArtistOrder;
      optsType: ArtistOpts;
      fieldsType: ArtistFields;
      optIdsType: ArtistIdsOpts;
      factoryExtrasType: ArtistFactoryExtras;
      factoryOptsType: Parameters<typeof newArtist>[1];
    };
  }
}

export abstract class ArtistCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "artist";
  static readonly metadata: EntityMetadata<Artist>;

  declare readonly __type: { 0: "Artist" };

  constructor(em: EntityManager, opts: ArtistOpts) {
    super(em, opts);
    setOpts(this as any as Artist, opts, { calledFromConstructor: true });
  }

  get id(): ArtistId {
    return this.idMaybe || failNoIdYet("Artist");
  }

  get idMaybe(): ArtistId | undefined {
    return toIdOf(artistMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("Artist");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get firstName(): string {
    return getField(this, "firstName");
  }

  set firstName(firstName: string) {
    setField(this, "firstName", cleanStringValue(firstName));
  }

  get lastName(): string {
    return getField(this, "lastName");
  }

  set lastName(lastName: string) {
    setField(this, "lastName", cleanStringValue(lastName));
  }

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  /**
   * Partial update taking any subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  set(opts: Partial<ArtistOpts>): void {
    setOpts(this as any as Artist, opts);
  }

  /**
   * Partial update taking any subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setPartial(opts: PartialOrNull<ArtistOpts>): void {
    setOpts(this as any as Artist, opts as OptsOf<Artist>, { partial: true });
  }

  /**
   * Partial update taking any nested subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setDeepPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   *   books: [{ title: "b1" }], // create a child book
   * });
   * ```
   * @see {@link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setDeepPartial(opts: DeepPartialOrNull<Artist>): Promise<void> {
    return updatePartial(this as any as Artist, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<Artist> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<Artist>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Artist, fn, opts);
  }

  get<U, V>(fn: (lens: GetLens<Omit<this, "fullNonReactiveAccess">>) => GetLens<U, V>): V {
    return getLens(artistMeta, this, fn as never);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/docs/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<Artist>>(hint: H): Promise<Loaded<Artist, H>>;
  populate<const H extends LoadHint<Artist>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Artist, H>>;
  populate<const H extends LoadHint<Artist>, V>(hint: H, fn: (artist: Loaded<Artist, H>) => V): Promise<V>;
  populate<const H extends LoadHint<Artist>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (artist: Loaded<Artist, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<Artist>, V>(
    hintOrOpts: any,
    fn?: (artist: Loaded<Artist, H>) => V,
  ): Promise<Loaded<Artist, H> | V> {
    return this.em.populate(this as any as Artist, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<Artist>>(hint: H): this is Loaded<Artist, H> {
    return isLoaded(this as any as Artist, hint);
  }

  /**
   * Build a type-safe, loadable and relation aware POJO from this entity, given a hint.
   *
   * Note: As the hint might load, this returns a Promise
   *
   * @example
   * ```
   * const payload = await a.toJSON({
   *   id: true,
   *   books: { id: true, reviews: { rating: true } }
   * });
   * ```
   * @see {@link https://joist-orm.io/docs/advanced/json-payloads | Json Payloads} on the Joist docs
   */
  toJSON(): object;
  toJSON<const H extends ToJsonHint<Artist>>(hint: H): Promise<JsonPayload<Artist, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get paintings(): Collection<Artist, Painting> {
    return this.__data.relations.paintings ??= hasMany(
      this,
      paintingMeta,
      "paintings",
      "artist",
      "artistId",
      undefined,
    );
  }
}
