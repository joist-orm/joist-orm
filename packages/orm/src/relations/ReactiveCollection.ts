import {
  Collection,
  Entity,
  EntityMetadata,
  ensureNotDeleted,
  fail,
  getEmInternalApi,
  getInstanceData,
  getMetadata,
  IdOf,
  isLoaded,
} from "..";
import { manyToManyDataLoader } from "../dataloaders/manyToManyDataLoader";
import { IsLoadedCachable } from "../IsLoadedCache";
import { lazyField, resolveOtherMeta } from "../newEntity";
import { Reacted, ReactiveHint, convertToLoadHint } from "../reactiveHints";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { ManyToManyCollection } from "./ManyToManyCollection";
import { RelationT, RelationU } from "./Relation";

/**
 * A reactive, derived many-to-many collection.
 *
 * Similar to `ReactiveReference` but for collections - the membership is calculated
 * from a reactive hint function and persisted to a join table.
 */
export interface ReactiveCollection<T extends Entity, U extends Entity>
  extends Omit<Collection<T, U>, "add" | "remove" | "set" | "removeAll"> {
  readonly isLoaded: boolean;
  readonly isSet: boolean;
  load(opts?: { withDeleted?: boolean; forceReload?: boolean }): Promise<readonly U[]>;
  readonly get: U[];
  readonly getWithDeleted: U[];
  /** Returns the as-of-last-flush previously-calculated collection (materialized DB value). */
  readonly fieldValue: readonly U[];
}

/** Creates a `ReactiveCollection`. */
export function hasReactiveCollection<T extends Entity, U extends Entity, const H extends ReactiveHint<T>>(
  joinTableName: string,
  columnName: string,
  otherMeta: EntityMetadata<U>,
  otherFieldName: keyof U & string,
  otherColumnName: string,
  fieldName: keyof T & string,
  hint: H,
  fn: (entity: Reacted<T, H>) => readonly U[],
): ReactiveCollection<T, U> {
  return lazyField((entity: T, fieldName) => {
    otherMeta ??= resolveOtherMeta(entity, fieldName);
    return new ReactiveCollectionImpl<T, U, H>(
      joinTableName,
      entity,
      fieldName as keyof T & string,
      columnName,
      otherMeta,
      otherFieldName,
      otherColumnName,
      hint,
      fn,
    );
  });
}

/**
 * Implements ReactiveCollection.
 *
 * Similar to ReactiveReference but for m2m collections:
 * - Takes a reactive hint to specify dependencies
 * - Calculates collection membership via a function
 * - Persists to a join table
 * - Recalculates when dependencies change
 */
export class ReactiveCollectionImpl<T extends Entity, U extends Entity, H extends ReactiveHint<T>>
  extends AbstractRelationImpl<T, U[]>
  implements ReactiveCollection<T, U>, IsLoadedCachable
{
  readonly #fieldName: keyof T & string;
  readonly #otherMeta: EntityMetadata;
  readonly #reactiveHint: H;

  // M2M join table metadata - needed for JoinRows compatibility
  readonly #joinTableName: string;
  readonly #columnName: string;
  readonly #otherFieldName: keyof U & string;
  readonly #otherColumnName: string;

  // Loading state
  #loaded: U[] | undefined;
  #loadedMode: "ref" | "full" | undefined = undefined;
  #isLoaded: boolean | undefined = undefined;
  #isCached: boolean = false;
  #loadPromise: Promise<ReadonlyArray<U>> | undefined;

  // Track the materialized DB state for change detection
  #fieldValueEntities: U[] = [];

  constructor(
    joinTableName: string,
    entity: T,
    public fieldName: keyof T & string,
    columnName: string,
    otherMeta: EntityMetadata,
    otherFieldName: keyof U & string,
    otherColumnName: string,
    public reactiveHint: H,
    private fn: (entity: Reacted<T, H>) => readonly U[],
  ) {
    super(entity);
    this.#fieldName = fieldName;
    this.#otherMeta = otherMeta;
    this.#reactiveHint = reactiveHint;
    this.#joinTableName = joinTableName;
    this.#columnName = columnName;
    this.#otherFieldName = otherFieldName;
    this.#otherColumnName = otherColumnName;

    if (entity.isNewEntity) {
      this.#loaded = [];
      this.#loadedMode = "full";
      this.#isLoaded = true;
    }
    getInstanceData(entity).relations[fieldName] = this;
  }

  async load(opts?: { withDeleted?: boolean; forceReload?: boolean }): Promise<ReadonlyArray<U>> {
    ensureNotDeleted(this.entity, "pending");
    const { loadHint } = this;

    if (!this.isLoaded || opts?.forceReload) {
      const { em } = this.entity;
      const maybeDirty =
        opts?.forceReload || getEmInternalApi(em).rm.isMaybePendingRecalc(this.entity, this.fieldName);

      if (maybeDirty) {
        this.#isCached = false;
        return (this.#loadPromise ??= em.populate(this.entity, { hint: loadHint, ...opts }).then(() => {
          this.#loadPromise = undefined;
          this.#loadedMode = "full";
          this.#isLoaded = true;
          getEmInternalApi(this.entity.em).isLoadedCache.add(this);
          return this.doGet(opts);
        }));
      } else {
        // Load from join table (existing materialized state)
        return (this.#loadPromise ??= this.loadFromJoinTable().then((loaded) => {
          this.#loadPromise = undefined;
          this.#loadedMode = "ref";
          this.#isLoaded = true;
          this.#loaded = loaded;
          this.#fieldValueEntities = [...loaded];
          getEmInternalApi(this.entity.em).isLoadedCache.add(this);
          return this.filterDeleted(loaded, opts);
        }));
      }
    }
    return this.doGet(opts);
  }

  private async loadFromJoinTable(): Promise<U[]> {
    const { em } = this.entity;
    // Use the existing m2m dataloader by creating a compatible collection-like object
    const key = `${this.#columnName}=${this.entity.id}`;
    const result = await manyToManyDataLoader(em, this as any).load(key);
    return result as U[];
  }

  get isLoaded(): boolean {
    if (this.#isLoaded !== undefined) return this.#isLoaded;
    getEmInternalApi(this.entity.em).isLoadedCache.add(this);

    const maybeDirty = getEmInternalApi(this.entity.em).rm.isMaybePendingRecalc(this.entity, this.fieldName);
    if (maybeDirty) {
      this.#loadedMode = "full";
      this.#isLoaded = isLoaded(this.entity, this.loadHint);
      this.#isCached = false;
    } else {
      this.#isLoaded = !!this.#loadedMode;
    }
    return this.#isLoaded;
  }

  resetIsLoaded(): void {
    this.#isLoaded = undefined;
    this.#isCached = false;
  }

  private doGet(opts?: { withDeleted?: boolean }): U[] {
    const { fn } = this;
    ensureNotDeleted(this.entity, "pending");

    if (this.#isCached) {
      return this.filterDeleted(this.#loaded ?? [], opts) as U[];
    }

    if (this.isLoaded && this.#loadedMode === "full") {
      const newValue = [...(fn(this.entity as any) as U[])];

      // Preserve deleted entities that were in the previous loaded value
      const previousDeleted = (this.#loaded ?? []).filter((e) => e.isDeletedEntity);
      for (const entity of previousDeleted) {
        if (!newValue.includes(entity)) {
          newValue.push(entity);
        }
      }

      if (!getEmInternalApi(this.entity.em).isValidating) {
        this.syncJoinTableRows(newValue);
      }

      this.#loaded = newValue;
      this.#isCached = true;
      getEmInternalApi(this.entity.em).isLoadedCache.add(this);
    } else if (!!this.#loadedMode) {
      this.#isCached = true;
      getEmInternalApi(this.entity.em).isLoadedCache.add(this);
    } else {
      const noun = this.entity.isNewEntity ? "derived" : "loaded";
      throw new Error(`${this.entity}.${this.fieldName} has not been ${noun} yet`);
    }

    return this.filterDeleted(this.#loaded ?? [], opts) as U[];
  }

  private syncJoinTableRows(newValue: U[]): void {
    const joinRows = getEmInternalApi(this.entity.em).joinRows(this as unknown as ManyToManyCollection<any, any>);
    const newSet = new Set(newValue);
    const oldSet = new Set(this.#fieldValueEntities);

    // Find entities to add (in new but not in old)
    for (const entity of newValue) {
      if (!oldSet.has(entity)) {
        joinRows.addNew(this as unknown as ManyToManyCollection<any, any>, this.entity, entity);
      }
    }

    // Find entities to remove (in old but not in new)
    for (const entity of oldSet) {
      if (!newSet.has(entity)) {
        joinRows.addRemove(this as unknown as ManyToManyCollection<any, any>, this.entity, entity);
      }
    }

    this.#fieldValueEntities = [...newValue];
  }

  get fieldValue(): readonly U[] {
    return this.#fieldValueEntities;
  }

  get getWithDeleted(): U[] {
    return this.doGet({ withDeleted: true });
  }

  get get(): U[] {
    return this.doGet({ withDeleted: false });
  }

  get isSet(): boolean {
    return this.#fieldValueEntities.length > 0 || (this.#loaded !== undefined && this.#loaded.length > 0);
  }

  // Read-only - these throw errors
  add(_other: U): void {
    fail(`Cannot add to ${this.entity}.${this.fieldName} ReactiveCollection directly.`);
  }

  remove(_other: U): void {
    fail(`Cannot remove from ${this.entity}.${this.fieldName} ReactiveCollection directly.`);
  }

  set(_values: readonly U[]): void {
    fail(`Cannot set ${this.entity}.${this.fieldName} ReactiveCollection directly.`);
  }

  removeAll(): void {
    fail(`Cannot removeAll on ${this.entity}.${this.fieldName} ReactiveCollection directly.`);
  }

  async includes(other: U): Promise<boolean> {
    const loaded = await this.load();
    return loaded.includes(other);
  }

  async find(id: IdOf<U>): Promise<U | undefined> {
    const loaded = await this.load();
    return loaded.find((e) => e.id === id);
  }

  get loadHint(): any {
    const meta = getMetadata(this.entity);
    return (meta.config.__data.cachedReactiveLoadHints[this.fieldName] ??= convertToLoadHint(meta, this.reactiveHint));
  }

  setFromOpts(_others: U[]): void {
    throw new Error(`ReactiveCollection ${this.entity}.${this.fieldName} cannot be set via opts`);
  }

  maybeCascadeDelete(): void {
    // ReactiveCollections don't cascade delete
  }

  async cleanupOnEntityDeleted(): Promise<void> {
    this.#loaded = [];
    this.#fieldValueEntities = [];
    this.#isLoaded = false;
  }

  current(opts?: { withDeleted?: boolean }): U[] {
    return this.filterDeleted(this.#loaded ?? [], opts) as U[];
  }

  // Properties needed for JoinRows/ManyToManyCollection compatibility
  public get meta(): EntityMetadata {
    return getMetadata(this.entity);
  }

  public get otherMeta(): EntityMetadata {
    return this.#otherMeta;
  }

  public get joinTableName(): string {
    return this.#joinTableName;
  }

  public get columnName(): string {
    return this.#columnName;
  }

  public get otherColumnName(): string {
    return this.#otherColumnName;
  }

  public get otherFieldName(): keyof U & string {
    return this.#otherFieldName;
  }

  public get hasBeenSet(): boolean {
    return false;
  }

  get isPreloaded(): boolean {
    return false;
  }

  preload(): void {
    // No-op for now - could implement if needed
  }

  private filterDeleted(entities: U[], opts?: { withDeleted?: boolean }): U[] {
    return opts?.withDeleted === true
      ? [...entities]
      : entities.filter((e) => !e.isDeletedEntity && !(e as any).isSoftDeletedEntity);
  }

  public toString(): string {
    return `ReactiveCollection(entity: ${this.entity}, fieldName: ${this.fieldName}, otherMeta: ${this.#otherMeta.type})`;
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
}

/** Type guard utility for determining if an entity field is a ReactiveCollection. */
export function isReactiveCollection(maybeReactiveCollection: any): maybeReactiveCollection is ReactiveCollection<any, any> {
  return maybeReactiveCollection instanceof ReactiveCollectionImpl;
}
