import {
  ensureNotDeleted,
  Entity,
  EntityMetadata,
  fail,
  getEmInternalApi,
  getInstanceData,
  getMetadata,
  ManyToManyField,
  ReadOnlyCollection,
} from "..";
import { manyToManyDataLoader } from "../dataloaders/manyToManyDataLoader";
import { IsLoadedCachable } from "../IsLoadedCache";
import { ManyToManyLike } from "../JoinRows";
import { lazyField } from "../newEntity";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { RelationT, RelationU } from "./Relation";

/**
 * A read-only collection representing the "other side" of a ReactiveCollection.
 *
 * I.e. when `Author.bestReviews` is a `ReactiveCollection` (controlling side), `BookReview.bestReviewAuthors`
 * the `ReactiveCollectionOtherSide` (read-only view).
 */
export interface ReactiveCollectionOtherSide<T extends Entity, U extends Entity> extends ReadOnlyCollection<T, U> {}

/** Creates a ReactiveCollectionOtherSide, the read-only other side of a ReactiveCollection. */
export function hasReactiveCollectionOtherSide<T extends Entity, U extends Entity>(): ReactiveCollectionOtherSide<
  T,
  U
> {
  return lazyField((entity: T, fieldName) => {
    const m2m = getMetadata(entity).allFields[fieldName] as ManyToManyField;
    return new ReactiveCollectionOtherSideImpl<T, U>(entity, m2m);
  });
}

export class ReactiveCollectionOtherSideImpl<T extends Entity, U extends Entity>
  extends AbstractRelationImpl<T, U[]>
  implements ReactiveCollectionOtherSide<T, U>, ManyToManyLike, IsLoadedCachable
{
  #field: ManyToManyField;
  // Loading state
  #loaded: U[] | undefined;
  #isLoaded: boolean = false;
  #loadPromise: Promise<readonly U[]> | undefined;
  // Cached result of applyPendingChanges (without deleted filtering)
  #cached: U[] | undefined;
  #isCached: boolean = false;

  constructor(entity: T, field: ManyToManyField) {
    super(entity);
    this.#field = field;
    getInstanceData(entity).relations[field.fieldName] = this;
  }

  async load(opts?: { withDeleted?: boolean; forceReload?: boolean }): Promise<readonly U[]> {
    ensureNotDeleted(this.entity, "pending");
    if (!this.#isLoaded || opts?.forceReload) {
      this.#isCached = false;
      return (this.#loadPromise ??= this.loadFromJoinTable().then((loaded) => {
        this.#loadPromise = undefined;
        this.#loaded = loaded;
        this.#isLoaded = true;
        getEmInternalApi(this.entity.em).isLoadedCache.addNaive(this);
        return this.doGet(opts);
      }));
    }
    return this.doGet(opts);
  }

  private async loadFromJoinTable(): Promise<U[]> {
    const { em } = this.entity;
    const key = `${this.columnName}=${this.entity.id}`;
    const result = await manyToManyDataLoader(em, this as any).load(key);
    return result as U[];
  }

  get isLoaded(): boolean {
    return this.#isLoaded;
  }

  resetIsLoaded(): void {
    this.#isCached = false;
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

    if (!this.#isCached) {
      this.#cached = this.applyPendingChanges(this.#loaded ?? []);
      this.#isCached = true;
      getEmInternalApi(this.entity.em).isLoadedCache.addNaive(this);
    }

    return this.filterDeleted(this.#cached!, opts);
  }

  /** Apply pending changes from the controlling side. */
  private applyPendingChanges(baseEntities: U[]): U[] {
    const result = new Set(baseEntities);
    const jr = getEmInternalApi(this.entity.em).joinRows(this);
    const added = jr.addedFor(this, this.entity);
    for (const other of added) result.add(other as U);
    const removed = jr.removedFor(this, this.entity);
    for (const other of removed) result.delete(other as U);
    return [...result];
  }

  private filterDeleted(entities: U[], opts?: { withDeleted?: boolean }): U[] {
    if (opts?.withDeleted === true) {
      return entities;
    }
    return entities.filter((e) => !e.isDeletedEntity && !(e as any).isSoftDeletedEntity);
  }

  set(): void {
    fail(`Cannot set ${this.entity}.${this.fieldName} - it is the read-only other side of a ReactiveCollection.`);
  }

  setFromOpts(_others: U[]): void {
    throw new Error(`ReactiveCollectionOtherSide ${this.entity}.${this.fieldName} cannot be set via opts`);
  }

  maybeCascadeDelete(): void {
    // Don't cascade - the controlling side handles this
  }

  async cleanupOnEntityDeleted(): Promise<void> {
    this.#loaded = [];
    this.#cached = undefined;
    this.#isCached = false;
    this.#isLoaded = false;
  }

  current(opts?: { withDeleted?: boolean }): U[] {
    return this.filterDeleted(this.#loaded ?? [], opts);
  }

  public get fieldName(): string {
    return this.#field.fieldName;
  }

  // Properties for JoinRows/ManyToManyCollection compatibility
  public get meta(): EntityMetadata {
    return getMetadata(this.entity);
  }

  public get otherMeta(): EntityMetadata {
    return this.#field.otherMetadata();
  }

  public get joinTableName(): string {
    return this.#field.joinTableName;
  }

  public get columnName(): string {
    return this.#field.columnNames[0];
  }

  public get otherColumnName(): string {
    return this.#field.columnNames[1];
  }

  public get otherFieldName(): string {
    return this.#field.otherFieldName;
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
    return `ReactiveCollectionOtherSide(entity: ${this.entity}, fieldName: ${this.fieldName}, otherMeta: ${this.otherMeta.type})`;
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
}

export function isReactiveCollectionOtherSide(
  maybeCollection: any,
): maybeCollection is ReactiveCollectionOtherSide<any, any> {
  return maybeCollection instanceof ReactiveCollectionOtherSideImpl;
}
