import {
  EntityMetadata,
  ManyToOneField,
  TaggedId,
  deTagId,
  ensureNotDeleted,
  ensureTagged,
  fail,
  getEmInternalApi,
  getMetadata,
  isEntity,
  isLoaded,
  maybeResolveReferenceToId,
  sameEntity,
  toIdOf,
} from "..";
import { currentlyInstantiatingEntity } from "../BaseEntity";
import { Entity } from "../Entity";
import { IdOf } from "../EntityManager";
import { getField, setField } from "../fields";
import { Reacted, ReactiveHint } from "../reactiveHints";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { failIfNewEntity, failNoId } from "./ManyToOneReference";
import { Reference, ReferenceN } from "./Reference";
import { RelationT, RelationU } from "./Relation";

export interface PersistedAsyncReference<T extends Entity, U extends Entity, N extends never | undefined>
  extends Reference<T, U, N> {
  isLoaded: boolean;
  isSet: boolean;

  load(opts?: { withDeleted?: boolean; forceReload?: true }): Promise<U | N>;

  /**
   * Returns the as-of-last-flush previously-calculated entity.
   *
   * This is useful if you have to purposefully avoid using the lambda to calc the latest entity,
   * i.e. if you're in a test and want to watch a calculated entity change from some dummy entity
   * to the new derived entity.
   * */
  fieldValue: U | N;

  /** Returns the id of the current assigned entity, or a runtime error if either 1) unset or 2) set to a new entity that doesn't have an `id` yet. */
  id: IdOf<U>;

  /** Returns the id of the current assigned entity, undefined if unset, or a runtime error if set to a new entity. */
  idIfSet: IdOf<U> | undefined;

  idUntagged: string;

  idUntaggedIfSet: string | undefined;
}

export function hasPersistedAsyncReference<
  T extends Entity,
  U extends Entity,
  const H extends ReactiveHint<T>,
  N extends never | undefined,
>(
  otherMeta: EntityMetadata<U>,
  fieldName: keyof T & string,
  hint: H,
  fn: (entity: Reacted<T, H>) => U | N,
): PersistedAsyncReference<T, U, N> {
  const entity = currentlyInstantiatingEntity as T;
  return new PersistedAsyncReferenceImpl<T, U, H, N>(entity, fieldName, otherMeta, hint, fn);
}

export class PersistedAsyncReferenceImpl<
    T extends Entity,
    U extends Entity,
    H extends ReactiveHint<T>,
    N extends never | undefined,
  >
  extends AbstractRelationImpl<T, U>
  implements PersistedAsyncReference<T, U, N>
{
  readonly #fieldName: keyof T & string;
  readonly #otherMeta: EntityMetadata;
  readonly #reactiveHint: H;
  // Either the loaded entity, or N/undefined if we're allowed to be null
  private loaded!: U | N | undefined;
  // We need a separate boolean to b/c loaded == undefined can still mean "_isLoaded" for nullable fks.
  private _isLoaded: "ref" | "full" | false = false;
  private loadPromise: any;
  constructor(
    entity: T,
    private fieldName: keyof T & string,
    otherMeta: EntityMetadata,
    public reactiveHint: H,
    private fn: (entity: Reacted<T, H>) => U | N,
  ) {
    super(entity);
    this.#fieldName = fieldName;
    this.#otherMeta = otherMeta;
    this.#reactiveHint = reactiveHint;
    // We can be initialized with [entity | id | undefined], and if it's entity or id, then setImpl
    // will set loaded appropriately; but if we're initialized undefined, then mark loaded here
    if (entity.isNewEntity) {
      this._isLoaded = isEntity(this.current()) ? "ref" : false;
    }
  }

  async load(opts?: { withDeleted?: true; forceReload?: true }): Promise<U | N> {
    ensureNotDeleted(this.entity, "pending");
    const { loadHint } = this;
    if (!this.isLoaded || opts?.forceReload) {
      const { em } = this.entity;
      // Just because we're not loaded, doesn't mean we necessarily need to load our full
      // hint. Ideally we only need to load our previously-calculated/persisted value, and
      // only load the full load hint if we need recalculated.
      const recalc = opts?.forceReload || getEmInternalApi(em).rm.isMaybePendingRecalc(this.entity, this.fieldName);
      if (recalc) {
        return (this.loadPromise ??= em.populate(this.entity, { hint: loadHint, ...opts }).then(() => {
          this.loadPromise = undefined;
          this._isLoaded = "full";
          // Go through `this.get` so that `setField` is called to set our latest value
          return this.doGet(opts);
        }));
      } else {
        // If we don't need a full recalc, just make sure we have the entity in memory
        const current = this.current();
        if (isEntity(current) || current === undefined) {
          this._isLoaded = "ref";
          this.loaded = current;
          return current;
        } else {
          return (this.loadPromise ??= em.load(this.#otherMeta.cstr, current).then((loaded) => {
            this.loadPromise = undefined;
            this._isLoaded = "ref";
            this.loaded = loaded;
            return loaded;
          }));
        }
      }
    }
    return this.doGet(opts);
  }

  private doGet(opts?: { withDeleted?: boolean }): U | N {
    const { fn } = this;
    ensureNotDeleted(this.entity, "pending");
    // We assume `isLoaded` has been called coming into this to manage
    if (this._isLoaded === "full") {
      const newValue = this.filterDeleted(fn(this.entity as Reacted<T, H>), opts);
      // It's cheap to set this every time we're called, i.e. even if it's not the
      // official "being called during em.flush" update (...unless we're accessing it
      // during the validate phase of `em.flush`, then skip it to avoid tripping up
      // the "cannot change entities during flush" logic.)
      if (!getEmInternalApi(this.entity.em).isValidating) {
        this.setImpl(newValue);
      }
      return this.maybeFindEntity();
    } else if (this._isLoaded) {
      return this.loaded as U | N;
    } else {
      throw new Error(`${this.fieldName} has not been derived yet`);
    }
  }

  get fieldValue(): U {
    return getField(this.entity, this.fieldName);
  }

  get getWithDeleted(): U | N {
    return this.doGet({ withDeleted: true });
  }

  get get(): U | N {
    return this.doGet({ withDeleted: false });
  }

  get isLoaded(): boolean {
    const maybeDirty = getEmInternalApi(this.entity.em).rm.isMaybePendingRecalc(this.entity, this.fieldName);
    // If we might be dirty, it doesn't matter what our last _isLoaded value was, we need to
    // check if our tree is loaded, b/c it might have recently been mutated.
    if (maybeDirty) {
      const hintLoaded = isLoaded(this.entity, this.loadHint);
      if (hintLoaded) {
        this._isLoaded = "full";
      }
      return hintLoaded;
    } else {
      // If we're not dirty, then either being "full" or "ref" loaded is fine
      return !!this._isLoaded;
    }
  }

  set(other: U | N): void {
    fail("Cannot set a persisted async relation directly.");
  }

  get isSet(): boolean {
    return this.current() !== undefined;
  }

  // Internal method used by OneToManyCollection
  setImpl(other: U | IdOf<U> | N): void {
    ensureNotDeleted(this.entity, "pending");

    // If the project is not using tagged ids, we still want it tagged internally
    const _other = ensureTagged(this.otherMeta, other) as U | TaggedId | N;

    if (sameEntity(_other, this.current({ withDeleted: true }))) {
      return;
    }

    const previous = this.maybeFindEntity();
    // Prefer to keep the id in our data hash, but if this is a new entity w/o an id, use the entity itself
    setField(this.entity, this.fieldName, isEntity(_other) ? _other.idTaggedMaybe ?? _other : _other);

    if (typeof _other === "string") {
      this.loaded = undefined;
    } else {
      this.loaded = _other;
    }
  }

  get isPreloaded(): boolean {
    return !!this.maybeFindEntity();
  }

  preload(): void {
    this.loaded = this.maybeFindEntity();
    this._isLoaded = "ref";
  }

  /** Returns the tagged id of the current value. */
  get idTaggedMaybe(): TaggedId | N {
    ensureNotDeleted(this.entity, "pending");
    return maybeResolveReferenceToId(this.current()) as TaggedId | N;
  }

  get id(): IdOf<U> {
    return this.idMaybe || failNoId(this.entity, this.fieldName, this.current());
  }

  get idUntagged(): string {
    return this.idUntaggedMaybe || failNoId(this.entity, this.fieldName, this.current());
  }

  get idIfSet(): IdOf<U> | N | undefined {
    failIfNewEntity(this.entity, this.fieldName, this.current());
    return this.idMaybe;
  }

  get idUntaggedIfSet(): string | undefined {
    failIfNewEntity(this.entity, this.fieldName, this.current());
    return this.idUntaggedMaybe;
  }

  get loadHint(): any {
    return getMetadata(this.entity).config.__data.cachedReactiveLoadHints[this.fieldName];
  }

  // private impl

  /** Returns the id of the current value. */
  private get idMaybe(): IdOf<U> | undefined {
    ensureNotDeleted(this.entity, "pending");
    return toIdOf(this.otherMeta, this.idTaggedMaybe);
  }

  private get idUntaggedMaybe(): string | undefined {
    return deTagId(this.otherMeta, this.idMaybe);
  }

  setFromOpts(other: U | IdOf<U> | N): void {
    this.setImpl(other);
  }

  maybeCascadeDelete(): void {
    if (this.isCascadeDelete) {
      const current = this.current({ withDeleted: true });
      if (current !== undefined && typeof current !== "string") {
        this.entity.em.delete(current as U);
      }
    }
  }

  async cleanupOnEntityDeleted(): Promise<void> {
    // if we are going to delete this relation as well, then we don't need to clean it up
    if (this.isCascadeDelete) return;
    setField(this.entity, this.fieldName, undefined);
    this.loaded = undefined as any;
    this._isLoaded = false;
  }

  // We need to keep U in data[fieldName] to handle entities without an id assigned yet.
  current(opts?: { withDeleted?: boolean }): U | string | N {
    const current = getField(this.entity, this.fieldName);
    if (current !== undefined && isEntity(current)) {
      return this.filterDeleted(current as U, opts);
    }
    return current;
  }

  public get otherMeta(): EntityMetadata<U> {
    return (getMetadata(this.entity).allFields[this.#fieldName] as ManyToOneField).otherMetadata();
  }

  public toString(): string {
    return `${this.entity}.${this.fieldName}`;
  }

  /**
   * Removes pending-hard-delete (but not soft-deleted), unless explicitly asked for.
   *
   * Note that we leave soft-deleted entities b/c the call signature of a `book.author.get`
   * very likely does not expect a soft-deleted entity to result in `undefined`.
   *
   * (Contrasted with `author.books.get` which is more intuitive to have soft-deleted
   * entities filtered out, i.e. it doesn't fundamentally change the return type.)
   */
  private filterDeleted(entity: U | N, opts?: { withDeleted?: boolean }): U | N {
    if (entity && (!opts || !opts.withDeleted) && entity.isDeletedEntity) {
      return undefined!;
    }
    return entity;
  }

  private get isCascadeDelete(): boolean {
    return getMetadata(this.entity).config.__data.cascadeDeleteFields.includes(this.#fieldName as any);
  }

  /**
   * Looks for an entity in `EntityManager`, b/c we may have it in memory even if
   * our reference is not specifically loaded.
   */
  maybeFindEntity(): U | N {
    // Check this.loaded first b/c a new entity won't have an id yet
    const { idTaggedMaybe } = this;
    return (
      this.loaded ??
      (idTaggedMaybe !== undefined ? (this.entity.em.getEntity(idTaggedMaybe) as U | N) : (undefined as N))
    );
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
  [ReferenceN]: N = null!;
}
