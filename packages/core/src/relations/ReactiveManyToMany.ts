import { manyToManyBatchLoader } from "src/batchloaders/manyToManyBatchLoader.ts";
import { hasVisibilityHook } from "src/EntityManager.ts";
import {
  type Entity,
  type EntityMetadata,
  type ManyToManyField,
  type ReadOnlyCollection,
  ensureNotDeleted,
  fail,
  getEmInternalApi,
  getInstanceData,
  getMetadata,
  getMetadataForField,
  isLoaded,
} from "src/index.ts";
import type { IsLoadedCachable } from "src/loading/IsLoadedCache.ts";
import { lazyField } from "src/newEntity.ts";
import {
  type MaybeReactedEntity,
  type Reacted,
  type ReactiveHint,
  convertToLoadHint,
} from "src/reactivity/reactiveHints.ts";
import { AbstractRelationImpl } from "src/relations/AbstractRelationImpl.ts";
import { isCascadeDelete } from "src/relations/isCascadeDelete.ts";
import { RelationT, RelationU } from "src/relations/RelationSymbols.ts";
import { filterVisible } from "src/relations/relationVisibility.ts";
import { runInTrustedContext } from "src/trusted.ts";

/**
 * A reactive, derived many-to-many collection.
 *
 * Similar to `ReactiveReference` but for collections--membership is calculated from a reactive
 * function and persisted to the underlying join table.
 */
export interface ReactiveManyToMany<T extends Entity, U extends Entity> extends ReadOnlyCollection<T, U> {
  load(opts?: { withDeleted?: boolean; forceReload?: boolean }): Promise<readonly U[]>;
}

/** Creates a `ReactiveManyToMany`. */
export function hasReactiveManyToMany<T extends Entity, U extends Entity, const H extends ReactiveHint<T>>(
  hint: H,
  fn: (entity: Reacted<T, H>) => readonly MaybeReactedEntity<U>[],
): ReactiveManyToMany<T, U> {
  return lazyField((entity: T, fieldName) => {
    const m2m = getMetadata(entity).allFields[fieldName] as ManyToManyField;
    const Relation = hasVisibilityHook(entity) ? PluginReactiveManyToMany : ReactiveManyToManyImpl;
    return new Relation<T, U, H>(entity, m2m, hint, fn);
  });
}

/** Implements ReactiveManyToMany, initially a copy/paste of ReactiveReference but for m2m. */
export class ReactiveManyToManyImpl<T extends Entity, U extends Entity, H extends ReactiveHint<T>>
  extends AbstractRelationImpl<T, U[]>
  implements ReactiveManyToMany<T, U>, IsLoadedCachable
{
  readonly #field: ManyToManyField;

  // Could be either the ref-loaded stored array, or full-loaded calculated array
  #loaded: U[] | undefined;
  // Recalculation needs the old membership even when the derivation hint is already loaded.
  #isJoinTableLoaded: boolean;
  // In ref-mode, we use our materialized FK value (which might be undefined)
  // If full-mode, we calculate the FK value from the subgraph
  #loadedMode: "ref" | "full" | undefined = undefined;
  // #isLoaded doesn't necessary care if we're ref-mode or full-mode, it's just
  // whether a caller can call `.get` and not have it blow up.
  #isLoaded: boolean | undefined = undefined;
  #isCached: boolean = false;
  #loadPromise: Promise<ReadonlyArray<U>> | undefined;

  constructor(
    entity: T,
    field: ManyToManyField,
    public reactiveHint: H,
    private fn: (entity: Reacted<T, H>) => readonly MaybeReactedEntity<U>[],
  ) {
    super(entity);
    this.#field = field;
    this.#isJoinTableLoaded = getInstanceData(entity).isOrWasNew;
    (getInstanceData(entity).relations ??= {})[this.fieldName] = this;
  }

  async load(opts?: { withDeleted?: boolean; forceReload?: boolean }): Promise<ReadonlyArray<U>> {
    ensureNotDeleted(this.entity, "pending");
    const { loadHint } = this;

    if (!this.isLoaded || opts?.forceReload) {
      const { em } = this.entity;
      const maybeDirty = opts?.forceReload || getEmInternalApi(em).rm.isMaybePendingRecalc(this.entity, this.fieldName);

      if (maybeDirty) {
        this.#isCached = false;
        return (this.#loadPromise ??= Promise.all([
          em.populate(this.entity, { hint: loadHint, ...opts }),
          !this.#isJoinTableLoaded || opts?.forceReload ? this.#loadFromJoinTable() : undefined,
        ]).then(() => {
          this.#loadPromise = undefined;
          this.#loadedMode = "full";
          this.#isLoaded = true;
          getEmInternalApi(this.entity.em).isLoadedCache.add(this);
          return this.#doGet(opts);
        }));
      } else {
        // Load from join table (existing materialized state)
        return (this.#loadPromise ??= this.#loadFromJoinTable().then((loaded) => {
          this.#loadPromise = undefined;
          this.#loadedMode = "ref";
          this.#isLoaded = true;
          this.#loaded = loaded;
          getEmInternalApi(this.entity.em).isLoadedCache.add(this);
          return this.#filterDeleted(loaded, opts);
        }));
      }
    }
    return this.#doGet(opts);
  }

  get isLoaded(): boolean {
    if (this.#isLoaded !== undefined) return this.#isLoaded;
    getEmInternalApi(this.entity.em).isLoadedCache.add(this);
    // If a WIP mutation has marked our field as potentially dirty, we need to be "full" loaded
    const maybeDirty = getEmInternalApi(this.entity.em).rm.isMaybePendingRecalc(this.entity, this.fieldName);
    if (maybeDirty) {
      // ReactiveReferences can mark themselves isLoaded when merely their
      // loadHint is loaded, but for ReactiveManyToMany we need to also have
      // our old join rows loaded, to tell who needs to be removed
      this.#loadedMode = "full";
      this.#isLoaded = this.#isJoinTableLoaded && isLoaded(this.entity, this.loadHint);
      this.#isCached = false;
    } else {
      // If we've had `.load` called before, assume we're still loaded
      this.#isLoaded = !!this.#loadedMode;
    }
    return this.#isLoaded;
  }

  resetIsLoaded(): void {
    this.#isLoaded = undefined;
    this.#isCached = false;
  }

  #doGet(opts?: { withDeleted?: boolean }): U[] {
    const { fn } = this;
    ensureNotDeleted(this.entity, "pending");
    // Fast pass if we've already calculated this (cache invalidation will happen on
    // any mutation via #resetIsLoaded)..
    if (this.#isCached) {
      return this.#filterDeleted(this.#loaded ?? [], opts) as U[];
    }
    // Call isLoaded to probe the load hint, and get `#isLoaded` set, but still have
    // our `if` check the raw `#isLoaded` to know if we should eval-latest or return `loaded`.
    if (this.isLoaded && this.#loadedMode === "full") {
      const newValue = fn(this.entity as any) as unknown as U[];
      // Preserve deleted entities that were in the previous loaded value
      const previousDeleted = (this.#loaded ?? []).filter((e) => e.isDeletedEntity);
      for (const entity of previousDeleted) {
        if (!newValue.includes(entity)) newValue.push(entity);
      }
      if (!getEmInternalApi(this.entity.em).isValidating) {
        this.#syncJoinTableRows(newValue);
      }
      this.#loaded = newValue;
      this.#isCached = true;
      getEmInternalApi(this.entity.em).isLoadedCache.add(this);
    } else if (!!this.#loadedMode) {
      // We're either loadedMode=ref, or loadedMode=full (but not actually fully loaded),
      // but in theory loadedMode only gets set in `.load()`, so we should have #loaded
      // set to some value, even if it's not fully up-to-date.
      this.#isCached = true;
      getEmInternalApi(this.entity.em).isLoadedCache.add(this);
    } else {
      const noun = this.entity.isNewEntity ? "derived" : "loaded";
      throw new Error(`${this.entity}.${this.fieldName} has not been ${noun} yet`);
    }
    return this.#filterDeleted(this.#loaded ?? [], opts) as U[];
  }

  get getWithDeleted(): U[] {
    return this.#doGet({ withDeleted: true });
  }

  get get(): U[] {
    return this.#doGet({ withDeleted: false });
  }

  /** Returns the stored membership without deriving or queuing join-row changes. */
  current(): readonly U[] {
    return (
      this.#loaded ?? (getEmInternalApi(this.entity.em).joinRows(this).getOthers(this.columnName, this.entity) as U[])
    );
  }

  set(): void {
    fail(`Cannot set ${this.entity}.${this.fieldName} ReactiveManyToMany directly.`);
  }

  get loadHint(): any {
    const meta = getMetadata(this.entity);
    return (meta.config.__data.cachedReactiveLoadHints[this.fieldName] ??= convertToLoadHint(meta, this.reactiveHint));
  }

  setFromOpts(_others: U[]): void {
    throw new Error(`ReactiveManyToMany ${this.entity}.${this.fieldName} cannot be set via opts`);
  }

  maybeCascadeDelete(): void {
    if (this.#isCascadeDelete) {
      const jr = getEmInternalApi(this.entity.em).joinRows(this);
      (jr.getOthers(this.columnName, this.entity) as U[]).forEach((e) => this.entity.em.delete(e));
    }
  }

  async cleanupOnEntityDeleted(): Promise<void> {
    // Required relations may already be detached, so remove stored/pending rows without deriving.
    if (!this.#isJoinTableLoaded) await this.#loadFromJoinTable();
    const jr = getEmInternalApi(this.entity.em).joinRows(this);
    const existing = jr.getOthers(this.columnName, this.entity) as U[];
    for (const entity of existing) jr.addRemove(this, this.entity, entity);
    this.#loaded = [];
    this.#isLoaded = false;
  }

  // Properties needed for JoinRows/ManyToManyCollection compatibility
  get meta(): EntityMetadata {
    return getMetadataForField(getMetadata(this.entity), this.fieldName);
  }

  get fieldName(): string {
    return this.#field.fieldName;
  }

  get otherMeta(): EntityMetadata {
    return this.#field.otherMetadata();
  }

  get joinTableName(): string {
    return this.#field.joinTableName;
  }

  get columnName(): string {
    return this.#field.columnNames[0];
  }

  get otherColumnName(): string {
    return this.#field.columnNames[1];
  }

  get hasJoinTableId(): boolean {
    return this.#field.hasJoinTableId;
  }

  get otherFieldName(): string {
    return this.#field.otherFieldName;
  }

  get hasBeenSet(): boolean {
    return true;
  }

  get isPreloaded(): boolean {
    // isPreloaded lets populate skip load(), but stored rows alone cannot satisfy a pending derivation.
    // Keep that shortcut disabled. RunPlugin calls preload() explicitly with already-derived membership.
    return false;
  }

  /** Installs materialized membership without deriving, e.g. when RunPlugin mirrors a flush. */
  preload(): void {
    if (this.entity.isNewEntity) return;
    const api = getEmInternalApi(this.entity.em);
    const preloaded = api.getPreloadedRelation<U>(this.entity.idTagged, this.fieldName);
    if (preloaded) {
      this.#loaded = preloaded;
      this.#loadedMode = "ref";
      this.#isJoinTableLoaded = true;
      this.#isLoaded = true;
      this.#isCached = false;
      api.isLoadedCache.add(this);
    }
  }

  import(
    other: ReactiveManyToManyImpl<T, U, H>,
    _: unknown,
    mapEntities: (e: U[] | undefined) => U[] | undefined,
  ): void {
    this.#loaded = mapEntities(other.#loaded);
    // A fork copies members, not JoinRows; treat the snapshot as ref-mode until its own rows are loaded.
    this.#isJoinTableLoaded = this.entity.isNewEntity;
    this.#loadedMode = other.#loadedMode ? "ref" : undefined;
    this.#isLoaded = undefined;
    // Don't set `#isCached b/c we're not registering ourselves with `isLoadedCache` yet; let
    // the first caller to `#doGet` do that if needed.
  }

  public toString(): string {
    return `ReactiveManyToMany(entity: ${this.entity}, fieldName: ${this.fieldName}, otherMeta: ${this.otherMeta.type})`;
  }

  get #isCascadeDelete(): boolean {
    return isCascadeDelete(this, this.#field.fieldName);
  }

  /** Loads the previous membership so recalculation and deletion can remove its join rows. */
  async #loadFromJoinTable(): Promise<U[]> {
    const { em } = this.entity;
    if (!this.entity.isNewEntity) {
      const key = `${this.columnName}=${this.entity.id}`;
      // Use the existing m2m loader by creating a compatible collection-like object
      await manyToManyBatchLoader(em, this).load(key);
    }
    this.#isJoinTableLoaded = true;
    return getEmInternalApi(em).joinRows(this).getOthers(this.columnName, this.entity) as U[];
  }

  // This is like calling `setField` but for a m2m relation...
  #syncJoinTableRows(newValue: U[]): void {
    const jr = getEmInternalApi(this.entity.em).joinRows(this);
    const newSet = new Set(newValue);
    const oldSet = new Set(jr.getOthers(this.columnName, this.entity) as U[]);
    // Find entities to add (in new but not in old)
    for (const entity of newValue) {
      if (!oldSet.has(entity)) {
        jr.addNew(this, this.entity, entity);
      }
    }
    // Find entities to remove (in old but not in new)
    for (const entity of oldSet) {
      if (!newSet.has(entity)) {
        jr.addRemove(this, this.entity, entity);
      }
    }
  }

  #filterDeleted(entities: U[], opts?: { withDeleted?: boolean }): U[] {
    return opts?.withDeleted === true
      ? [...entities]
      : entities.filter((e) => !e.isDeletedEntity && !(e as any).isSoftDeletedEntity);
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
}

/** Projects derived membership after business logic has evaluated its complete dependencies. */
class PluginReactiveManyToMany<
  T extends Entity,
  U extends Entity,
  H extends ReactiveHint<T>,
> extends ReactiveManyToManyImpl<T, U, H> {
  override get get(): U[] {
    return this.filter(runInTrustedContext(() => super.get));
  }

  override get getWithDeleted(): U[] {
    return this.filter(runInTrustedContext(() => super.getWithDeleted));
  }

  override async load(opts?: { withDeleted?: boolean; forceReload?: boolean }): Promise<readonly U[]> {
    return this.filter(await runInTrustedContext(() => super.load(opts)));
  }

  /** Leaves materialized membership intact for reactions. */
  private filter(values: readonly U[]): U[] {
    return filterVisible(this.entity, this.fieldName, values);
  }
}

/** Type guard utility for determining if an entity field is a ReactiveManyToMany. */
export function isReactiveManyToMany(
  maybeReactiveManyToMany: any,
): maybeReactiveManyToMany is ReactiveManyToMany<any, any> {
  return maybeReactiveManyToMany instanceof ReactiveManyToManyImpl;
}
