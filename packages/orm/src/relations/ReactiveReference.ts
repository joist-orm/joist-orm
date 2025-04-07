import {
  EntityMetadata,
  ManyToOneField,
  TaggedId,
  deTagId,
  ensureNotDeleted,
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
import { IsLoadedCachable } from "../IsLoadedCache";
import { MaybeReactedEntity, Reacted, ReactiveHint, convertToLoadHint } from "../reactiveHints";
import { AbstractRelationImpl, isCascadeDelete } from "./AbstractRelationImpl";
import { failIfNewEntity, failNoId } from "./ManyToOneReference";
import { Reference, ReferenceN } from "./Reference";
import { RelationT, RelationU } from "./Relation";

export interface ReactiveReference<T extends Entity, U extends Entity, N extends never | undefined>
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

export function hasReactiveReference<T extends Entity, U extends Entity, const H extends ReactiveHint<T>>(
  otherMeta: EntityMetadata<U>,
  fieldName: keyof T & string,
  hint: H,
  fn: (entity: Reacted<T, H>) => MaybeReactedEntity<U>,
): ReactiveReference<T, U, never>;
export function hasReactiveReference<T extends Entity, U extends Entity, const H extends ReactiveHint<T>>(
  otherMeta: EntityMetadata<U>,
  fieldName: keyof T & string,
  hint: H,
  fn: (entity: Reacted<T, H>) => MaybeReactedEntity<U> | undefined,
): ReactiveReference<T, U, undefined>;
/** Creates a `ReactiveReference`. */
export function hasReactiveReference<
  T extends Entity,
  U extends Entity,
  const H extends ReactiveHint<T>,
  N extends never | undefined,
>(
  otherMeta: EntityMetadata<U>,
  fieldName: keyof T & string,
  hint: H,
  fn: (entity: Reacted<T, H>) => MaybeReactedEntity<U> | N,
): ReactiveReference<T, U, N> {
  const entity = currentlyInstantiatingEntity as T;
  return new ReactiveReferenceImpl<T, U, H, N>(entity, fieldName, otherMeta, hint, fn);
}

/**
 * Implements ReactiveReferences.
 *
 * This is a bit trickier than ReactiveFields, because we have to differentiate our loaded
 * between:
 *
 * - our load hint is loaded, and we can directly calculate the referenced entity, or
 * - we've fetched the calculated/stored entity from the database, but not purposefully
 *   not re-calculating it (which would require fetching the load hint, which might be
 *   expensive, and defeat the point of having our field materialized in the database)
 *
 * Further, want to support all of:
 *
 * - When loaded & `.get` has been called, we cache the value
 *
 * - If a WIP mutation happens, we invalidate `.get` *but* if we check `.isLoaded`,
 *   we can return the live/updated value, without an `await`.
 *
 * - If a WIP mutation happens, we invalidate `.isLoaded`, and if we're *no longer loaded*,
 *   we want to keep returning the stale value (as asserted by the tests), but the next
 *   `load` / `populate` should load the graph & recalculate the value.
 */
export class ReactiveReferenceImpl<
    T extends Entity,
    U extends Entity,
    H extends ReactiveHint<T>,
    N extends never | undefined,
  >
  extends AbstractRelationImpl<T, U>
  implements ReactiveReference<T, U, N>, IsLoadedCachable
{
  readonly #fieldName: keyof T & string;
  readonly #otherMeta: EntityMetadata;
  readonly #reactiveHint: H;
  // Either the loaded entity, or N/undefined if we're allowed to be null
  #loaded!: U | N | undefined;
  // In ref-mode, we use our materialized FK value (which might be undefined)
  // If full-mode, we calculate the FK value from the subgraph
  #loadedMode: "ref" | "full" | undefined = undefined;
  #isLoaded: boolean | undefined = undefined;
  #isCached: boolean = false;
  #loadPromise: any;

  constructor(
    entity: T,
    public fieldName: keyof T & string,
    otherMeta: EntityMetadata,
    public reactiveHint: H,
    private fn: (entity: Reacted<T, H>) => MaybeReactedEntity<U> | N,
  ) {
    super(entity);
    this.#fieldName = fieldName;
    this.#otherMeta = otherMeta;
    this.#reactiveHint = reactiveHint;
    // We can be initialized with [entity | id | undefined], and if it's entity or id, then setImpl
    // will set loaded appropriately; but if we're initialized undefined, then mark loaded here
    if (entity.isNewEntity) {
      const isLoaded = isEntity(this.current()) ? true : undefined;
    }
  }

  async load(opts?: { withDeleted?: true; forceReload?: true }): Promise<U | N> {
    ensureNotDeleted(this.entity, "pending");
    const { loadHint } = this;
    if (!this.isLoaded || opts?.forceReload) {
      const { em } = this.entity;
      // Just because we're not loaded, doesn't mean we necessarily need to load our full hint.
      // We prefer to load only our previously-calculated/materialized value, and only load the
      // full load hint if we need recalculated.
      const maybeDirty = opts?.forceReload || getEmInternalApi(em).rm.isMaybePendingRecalc(this.entity, this.fieldName);
      if (maybeDirty) {
        this.#isCached = false;
        return (this.#loadPromise ??= em.populate(this.entity, { hint: loadHint, ...opts }).then(() => {
          this.#loadPromise = undefined;
          this.#loadedMode = "full";
          this.#isLoaded = true;
          getEmInternalApi(this.entity.em).isLoadedCache.add(this);
          // Go through `this.get` so that `setField` is called to set our latest value
          return this.doGet(opts);
        }));
      } else {
        // If we don't need a full recalc, just make sure we have the entity in memory
        // ...ideally we would check `isSet` and whether the key was in the `instanceData`
        const current = this.current();
        if (isEntity(current) || current === undefined) {
          this.#loadedMode = "ref";
          this.#isLoaded = true;
          this.#loaded = current;
          getEmInternalApi(this.entity.em).isLoadedCache.add(this);
          return current;
        } else {
          return (this.#loadPromise ??= em.load(this.#otherMeta.cstr, current).then((loaded) => {
            this.#loadPromise = undefined;
            this.#loadedMode = "ref";
            this.#isLoaded = true;
            this.#loaded = loaded;
            getEmInternalApi(this.entity.em).isLoadedCache.add(this);
            return loaded;
          }));
        }
      }
    }
    return this.doGet(opts);
  }

  get isLoaded(): boolean {
    // If we've cached an isLoaded value, just use that, see https://github.com/joist-orm/joist-orm/issues/1166
    if (this.#isLoaded !== undefined) return this.#isLoaded;
    getEmInternalApi(this.entity.em).isLoadedCache.add(this);
    // If a WIP mutation has marked our field as potentially dirty, we need to be "full" loaded
    const maybeDirty = getEmInternalApi(this.entity.em).rm.isMaybePendingRecalc(this.entity, this.fieldName);
    if (maybeDirty) {
      // If we're dirty, only being "full" loaded is good enough to recalc
      this.#loadedMode = "full";
      this.#isLoaded = isLoaded(this.entity, this.loadHint);
      this.#isCached = false;
    } else {
      // If we've had `.load` called before, assume we're still loaded
      this.#isLoaded = !!this.#loadedMode;
    }
    return this.#isLoaded;
  }

  resetIsLoaded(): void {
    // We only reset #isLoaded so that callers can keep calling `.get` and technically
    // see the stale value, but once they call `.load` again, we'll recalc it.
    this.#isLoaded = undefined;
  }

  private doGet(opts?: { withDeleted?: boolean }): U | N {
    const { fn } = this;
    ensureNotDeleted(this.entity, "pending");
    // Fast pass if we've already calculated this (cache invalidation will happen on
    // any mutation via #resetIsLoaded)..
    if (this.#isCached) {
      return this.#loaded ? this.filterDeleted(this.#loaded, opts) : (undefined as N);
    }
    // Call isLoaded to probe the load hint, and get `#isLoaded` set, but still have
    // our `if` check the raw `#isLoaded` to know if we should eval-latest or return `loaded`.
    this.isLoaded;
    if (this.#loadedMode === "full") {
      const newValue = this.filterDeleted(fn(this.entity as any) as any, opts);
      // It's cheap to set this every time we're called, i.e. even if it's not the
      // official "being called during em.flush" update (...unless we're accessing it
      // during the validate phase of `em.flush`, then skip it to avoid tripping up
      // the "cannot change entities during flush" logic.)
      if (!getEmInternalApi(this.entity.em).isValidating) {
        this.setImpl(newValue);
      }
      this.#loaded = newValue;
      this.#isCached = true;
      getEmInternalApi(this.entity.em).isLoadedCache.add(this);
    } else if (this.#loadedMode === "ref") {
      // #loaded was already set by whoever set ref; mark it as cached as well
      this.#isCached = true;
      getEmInternalApi(this.entity.em).isLoadedCache.add(this);
    } else {
      const noun = this.entity.isNewEntity ? "derived" : "loaded";
      throw new Error(`${this.entity}.${this.fieldName} has not been ${noun} yet`);
    }
    return this.#loaded ? this.filterDeleted(this.#loaded, opts) : (undefined as N);
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

  set(_: U | N): void {
    fail(`Cannot set ${this.entity}.${this.fieldName} ReactiveReference directly.`);
  }

  get isSet(): boolean {
    return this.current() !== undefined;
  }

  // Internal method used by OneToManyCollection
  setImpl(entity: U | N): void {
    ensureNotDeleted(this.entity, "pending");
    if (sameEntity(entity, this.current({ withDeleted: true }))) {
      return;
    }
    // Prefer to keep the id in our data hash, but if this is a new entity w/o an id, use the entity itself
    setField(this.entity, this.fieldName, isEntity(entity) ? (entity.idTaggedMaybe ?? entity) : entity);
  }

  get isPreloaded(): boolean {
    return !!this.maybeFindEntity();
  }

  preload(): void {
    this.#loaded = this.maybeFindEntity();
    this.#loadedMode = "ref";
    this.#isLoaded = true;
    this.#isCached = true;
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
    return this.idMaybe || failIfNewEntity(this.entity, this.fieldName, this.current());
  }

  get idUntaggedIfSet(): string | undefined {
    return this.idUntaggedMaybe || failIfNewEntity(this.entity, this.fieldName, this.current());
  }

  get loadHint(): any {
    const meta = getMetadata(this.entity);
    return (meta.config.__data.cachedReactiveLoadHints[this.fieldName] ??= convertToLoadHint(meta, this.reactiveHint));
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

  setFromOpts(_: U | IdOf<U> | N): void {
    throw new Error("ReactiveReferences cannot be set via opts");
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
    this.#loaded = undefined as any;
    this.#isLoaded = false;
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

  public get hasBeenSet(): boolean {
    return false;
  }

  public toString(): string {
    return `PersistedAsyncReference(entity: ${this.entity}, hint: ${this.loadHint}, fieldName: ${this.fieldName}, otherMeta: {
      this.otherMeta.type
    }, id: ${this.id})`;
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
    return isCascadeDelete(this, this.#fieldName);
  }

  /**
   * Looks for an entity in `EntityManager`, b/c we may have it in memory even if
   * our reference is not specifically loaded.
   */
  maybeFindEntity(): U | N {
    // Check this.loaded first b/c a new entity won't have an id yet
    const { idTaggedMaybe } = this;
    return (
      this.#loaded ??
      (idTaggedMaybe !== undefined ? (this.entity.em.getEntity(idTaggedMaybe) as U | N) : (undefined as N))
    );
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
  [ReferenceN]: N = null!;
}

/** Type guard utility for determining if an entity field is a ReactiveReference. */
export function isReactiveReference(maybeReactiveRef: any): maybeReactiveRef is ReactiveReference<any, any, any> {
  return maybeReactiveRef instanceof ReactiveReferenceImpl;
}
