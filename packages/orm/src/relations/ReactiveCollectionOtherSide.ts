import {
  ensureNotDeleted,
  Entity,
  EntityMetadata,
  fail,
  getEmInternalApi,
  getInstanceData,
  getMetadata,
  ReadOnlyCollection,
} from "..";
import { manyToManyDataLoader } from "../dataloaders/manyToManyDataLoader";
import { lazyField, resolveOtherMeta } from "../newEntity";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { RelationT, RelationU } from "./Relation";

/**
 * A read-only collection representing the "other side" of a ReactiveCollection.
 *
 * When Author.bestReviews is a ReactiveCollection (controlling side),
 * BookReview.bestReviewAuthors is a ReactiveCollectionOtherSide (read-only view).
 */
export interface ReactiveCollectionOtherSide<T extends Entity, U extends Entity> extends ReadOnlyCollection<T, U> {}

/** Creates a ReactiveCollectionOtherSide - the read-only other side of a ReactiveCollection. */
export function hasReactiveCollectionOtherSide<T extends Entity, U extends Entity>(
  joinTableName: string,
  columnName: string,
  otherFieldName: string,
  otherColumnName: string,
): ReactiveCollectionOtherSide<T, U> {
  let otherMeta: EntityMetadata<U>;
  return lazyField((entity: T, fieldName) => {
    otherMeta ??= resolveOtherMeta(entity, fieldName);
    return new ReactiveCollectionOtherSideImpl<T, U>(
      joinTableName,
      entity,
      fieldName as keyof T & string,
      columnName,
      otherMeta,
      otherFieldName,
      otherColumnName,
    );
  });
}

export class ReactiveCollectionOtherSideImpl<T extends Entity, U extends Entity>
  extends AbstractRelationImpl<T, U[]>
  implements ReactiveCollectionOtherSide<T, U>
{
  readonly #otherMeta: EntityMetadata;

  // M2M join table metadata
  readonly #joinTableName: string;
  readonly #columnName: string;
  readonly #otherFieldName: string;
  readonly #otherColumnName: string;

  // Loading state
  #loaded: U[] | undefined;
  #isLoaded: boolean = false;
  #loadPromise: Promise<readonly U[]> | undefined;

  constructor(
    joinTableName: string,
    entity: T,
    public fieldName: keyof T & string,
    columnName: string,
    otherMeta: EntityMetadata,
    otherFieldName: string,
    otherColumnName: string,
  ) {
    super(entity);
    this.#otherMeta = otherMeta;
    this.#joinTableName = joinTableName;
    this.#columnName = columnName;
    this.#otherFieldName = otherFieldName;
    this.#otherColumnName = otherColumnName;

    if (entity.isNewEntity) {
      this.#loaded = [];
      this.#isLoaded = true;
    }
    getInstanceData(entity).relations[fieldName] = this;
  }

  async load(opts?: { withDeleted?: boolean; forceReload?: boolean }): Promise<readonly U[]> {
    ensureNotDeleted(this.entity, "pending");

    if (!this.#isLoaded || opts?.forceReload) {
      return (this.#loadPromise ??= this.loadFromJoinTable().then((loaded) => {
        this.#loadPromise = undefined;
        this.#loaded = loaded;
        this.#isLoaded = true;
        return this.applyPendingChangesAndFilter(loaded, opts);
      }));
    }
    return this.applyPendingChangesAndFilter(this.#loaded ?? [], opts);
  }

  private async loadFromJoinTable(): Promise<U[]> {
    const { em } = this.entity;
    const key = `${this.#columnName}=${this.entity.id}`;
    const result = await manyToManyDataLoader(em, this as any).load(key);
    return result as U[];
  }

  get isLoaded(): boolean {
    return this.#isLoaded;
  }

  get get(): U[] {
    return this.doGet({ withDeleted: false });
  }

  get getWithDeleted(): U[] {
    return this.doGet({ withDeleted: true });
  }

  private doGet(opts?: { withDeleted?: boolean }): U[] {
    ensureNotDeleted(this.entity, "pending");
    if (!this.#isLoaded) {
      throw new Error(`${this.entity}.${this.fieldName} has not been loaded yet`);
    }
    return this.applyPendingChangesAndFilter(this.#loaded ?? [], opts);
  }

  /**
   * Apply pending changes from the controlling side and filter deleted entities.
   *
   * The controlling side stores join rows via JoinRows. We query the same JoinRows
   * instance but from our perspective (column names are swapped).
   */
  private applyPendingChangesAndFilter(baseEntities: U[], opts?: { withDeleted?: boolean }): U[] {
    const em = this.entity.em;
    const result = new Set(baseEntities);

    // Get the JoinRows instance for our join table (if it exists)
    const joinRows = getEmInternalApi(em).joinRowsIfPresent(this.#joinTableName);
    if (joinRows) {
      // Get pending adds: rows where our entity is involved and they're new (no id, not deleted)
      const added = joinRows.addedForOtherSide(this.#columnName, this.entity);
      for (const other of added) {
        result.add(other as U);
      }

      // Get pending removes: rows where our entity is involved and they're deleted
      const removed = joinRows.removedForOtherSide(this.#columnName, this.entity);
      for (const other of removed) {
        result.delete(other as U);
      }
    }

    // Filter deleted unless withDeleted
    let entities = [...result];
    if (opts?.withDeleted !== true) {
      entities = entities.filter((e) => !e.isDeletedEntity && !(e as any).isSoftDeletedEntity);
    }

    return entities;
  }

  // Read-only - these throw errors
  add(_other: U): void {
    fail(`Cannot add to ${this.entity}.${this.fieldName} - it is the read-only other side of a ReactiveCollection.`);
  }

  remove(_other: U): void {
    fail(
      `Cannot remove from ${this.entity}.${this.fieldName} - it is the read-only other side of a ReactiveCollection.`,
    );
  }

  set(_values: readonly U[]): void {
    fail(`Cannot set ${this.entity}.${this.fieldName} - it is the read-only other side of a ReactiveCollection.`);
  }

  removeAll(): void {
    fail(
      `Cannot removeAll on ${this.entity}.${this.fieldName} - it is the read-only other side of a ReactiveCollection.`,
    );
  }

  setFromOpts(_others: U[]): void {
    throw new Error(`ReactiveCollectionOtherSide ${this.entity}.${this.fieldName} cannot be set via opts`);
  }

  maybeCascadeDelete(): void {
    // Don't cascade - the controlling side handles this
  }

  async cleanupOnEntityDeleted(): Promise<void> {
    this.#loaded = [];
    this.#isLoaded = false;
  }

  current(opts?: { withDeleted?: boolean }): U[] {
    const entities = this.#loaded ?? [];
    if (opts?.withDeleted === true) {
      return [...entities];
    }
    return entities.filter((e) => !e.isDeletedEntity && !(e as any).isSoftDeletedEntity);
  }

  // Properties for JoinRows/ManyToManyCollection compatibility
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

  public get otherFieldName(): string {
    return this.#otherFieldName;
  }

  public get hasBeenSet(): boolean {
    return false;
  }

  get isPreloaded(): boolean {
    return false;
  }

  preload(): void {
    // No-op for reactive collection other side
  }

  public toString(): string {
    return `ReactiveCollectionOtherSide(entity: ${this.entity}, fieldName: ${this.fieldName}, otherMeta: ${this.#otherMeta.type})`;
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
}

export function isReactiveCollectionOtherSide(
  maybeCollection: any,
): maybeCollection is ReactiveCollectionOtherSide<any, any> {
  return maybeCollection instanceof ReactiveCollectionOtherSideImpl;
}
