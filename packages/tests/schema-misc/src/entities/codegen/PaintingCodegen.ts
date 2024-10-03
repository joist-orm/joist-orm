import {
  BaseEntity,
  type Changes,
  cleanStringValue,
  ConfigApi,
  type DeepPartialOrNull,
  type EntityFilter,
  type EntityGraphQLFilter,
  type EntityMetadata,
  failNoIdYet,
  type FilterOf,
  type Flavor,
  getField,
  type GraphQLFilterOf,
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
  type ArtistId,
  artistMeta,
  type ArtistOrder,
  type Entity,
  EntityManager,
  newPainting,
  Painting,
  paintingMeta,
} from "../entities";

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
    entityType: Painting;
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
  set(opts: Partial<PaintingOpts>): void {
    setOpts(this as any as Painting, opts);
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
  setPartial(opts: PartialOrNull<PaintingOpts>): void {
    setOpts(this as any as Painting, opts as OptsOf<Painting>, { partial: true });
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
  setDeepPartial(opts: DeepPartialOrNull<Painting>): Promise<void> {
    return updatePartial(this as any as Painting, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<Painting> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<Painting>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Painting, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/docs/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<Painting>>(hint: H): Promise<Loaded<Painting, H>>;
  populate<const H extends LoadHint<Painting>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Painting, H>>;
  populate<const H extends LoadHint<Painting>, V>(hint: H, fn: (p: Loaded<Painting, H>) => V): Promise<V>;
  populate<const H extends LoadHint<Painting>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (p: Loaded<Painting, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<Painting>, V>(
    hintOrOpts: any,
    fn?: (p: Loaded<Painting, H>) => V,
  ): Promise<Loaded<Painting, H> | V> {
    return this.em.populate(this as any as Painting, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<Painting>>(hint: H): this is Loaded<Painting, H> {
    return isLoaded(this as any as Painting, hint);
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
  toJSON<const H extends ToJsonHint<Painting>>(hint: H): Promise<JsonPayload<Painting, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get artist(): ManyToOneReference<Painting, Artist, never> {
    return this.__data.relations.artist ??= hasOne(this, artistMeta, "artist", "paintings");
  }
}
