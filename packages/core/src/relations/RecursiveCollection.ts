import { recursiveChildrenBatchLoader } from "../batchloaders/recursiveChildrenBatchLoader";
import { recursiveM2mBatchLoader } from "../batchloaders/recursiveM2mBatchLoader";
import { recursiveParentsBatchLoader } from "../batchloaders/recursiveParentsBatchLoader";
import {
  appendStack,
  ensureNotDeleted,
  Entity,
  EntityMetadata,
  fail,
  getEmInternalApi,
  getMetadata,
  isCollection,
  isLoadedCollection,
  isLoadedOneToOneReference,
  isLoadedReference,
  isOneToOneReference,
  isReference,
  ManyToManyField,
  Reference,
  Relation,
} from "../index";
import { IsLoadedCachable } from "../IsLoadedCache";
import { lazyField } from "../newEntity";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { ReadOnlyCollection } from "./ReadOnlyCollection";
import { RelationT, RelationU } from "./Relation";

/**
 * An alias for creating `RecursiveParentsCollectionImpl`s.
 *
 * I.e. for `Author.mentor` (m2o fk), we can return `Author.mentorsRecursive` recursively looking up.
 */
export function hasRecursiveParents<T extends Entity, U extends Entity>(
  m2oName: keyof T & string, // i.e. `author.mentor`
  otherFieldName: keyof T & string, // i.e. `author.menteesRecursive`
): ReadOnlyCollection<T, U> {
  return lazyField((entity: T, fieldName) => {
    return new RecursiveParentsCollectionImpl(entity, fieldName as keyof T & string, m2oName, otherFieldName);
  });
}

/**
 * An alias for creating `RecursiveChildrenCollectionImpl`s.
 *
 * I.e. for `Author.mentees` (o2m), we can return `Author.menteesRecursive` recursively looking down.
 */
export function hasRecursiveChildren<T extends Entity, U extends Entity>(
  o2mName: keyof T & string, // i.e. `author.mentees`
  otherFieldName: keyof T & string, // i.e. `author.mentorsRecursive`
): ReadOnlyCollection<T, U> {
  return lazyField((entity: T, fieldName) => {
    return new RecursiveChildrenCollectionImpl(entity, fieldName as keyof T & string, o2mName, otherFieldName);
  });
}

/**
 * An alias for creating `RecursiveM2mCollectionImpl`s.
 *
 * I.e. for `User.parents` (m2m), we can return `User.parentsRecursive` recursively looking up through the m2m.
 * Or for `User.children` (m2m), we can return `User.childrenRecursive` recursively looking down.
 */
export function hasRecursiveM2m<T extends Entity, U extends Entity>(
  m2mName: keyof T & string, // i.e. `user.parents` or `user.children`
  otherFieldName: keyof T & string, // i.e. `user.childrenRecursive` or `user.parentsRecursive`
): ReadOnlyCollection<T, U> {
  return lazyField((entity: T, fieldName) => {
    return new RecursiveM2mCollectionImpl(entity, fieldName as keyof T & string, m2mName, otherFieldName);
  });
}

/**
 * A base class for the common methods between the parent & children recursive collections.
 *
 * We could probably move some of this into AbstractRelationImpl?
 */
abstract class AbstractRecursiveCollectionImpl<T extends Entity, U extends Entity> extends AbstractRelationImpl<
  T,
  U[]
> {
  abstract fieldName: string;

  get get(): U[] {
    return this.filterDeleted(this.doGet(), { withDeleted: false });
  }

  get getWithDeleted(): U[] {
    return this.filterDeleted(this.doGet(), { withDeleted: true });
  }

  setFromOpts(): void {
    throw new Error("Method not implemented.");
  }

  set(): void {
    throw new Error("Method not implemented.");
  }

  get isPreloaded(): boolean {
    return false;
  }

  preload(): void {
    throw new Error("Method not implemented.");
  }

  cleanupOnEntityDeleted(): Promise<void> {
    return Promise.resolve();
  }

  maybeCascadeDelete(): void {}

  get meta(): EntityMetadata {
    return getMetadata(this.entity);
  }

  abstract doGet(): U[];

  /** Removes pending-hard-delete or soft-deleted entities, unless explicitly asked for. */
  protected filterDeleted(entities: U[], opts?: { withDeleted?: boolean }): U[] {
    return opts?.withDeleted === true
      ? [...entities]
      : entities.filter((e) => !e.isDeletedEntity && !(e as any).isSoftDeletedEntity);
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
}

export class RecursiveParentsCollectionImpl<T extends Entity, U extends Entity>
  extends AbstractRecursiveCollectionImpl<T, U>
  implements ReadOnlyCollection<T, U>, IsLoadedCachable
{
  readonly #fieldName: keyof T & string;
  readonly #m2oName: keyof T & string;
  readonly #otherFieldName: keyof T & string;
  #loaded: boolean | undefined = undefined;
  #loadPromise: Promise<void> | undefined;

  constructor(entity: T, fieldName: keyof T & string, m2oName: keyof T & string, otherFieldName: keyof T & string) {
    super(entity);
    this.#fieldName = fieldName;
    this.#m2oName = m2oName;
    this.#otherFieldName = otherFieldName;
  }

  // opts is an internal parameter
  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<readonly U[]> {
    ensureNotDeleted(this.entity, "pending");
    if (!this.isLoaded || opts.forceReload) {
      if (opts.forceReload) {
        this.#loaded = undefined;
      }
      // If we have `[grandchild, newlyCreatedParent, existingGrandparent, ...more...]`, skip up to the
      // `existingGrandparent`, because if we `.load(entity)` (i.e. where we are the `grandchild`) then
      // recursiveParentsBatchLoader will try CTE query up from `grandchild[parent]`, but since that will
      // be `newlyCreatedParent`, it doesn't have an id yet.
      const entityToLoad = opts.forceReload ? this.entity : this.findUnloadedReference()?.entity;
      if (entityToLoad && !entityToLoad.isNewEntity) {
        await (this.#loadPromise ??= recursiveParentsBatchLoader(this.entity.em, this)
          .load(entityToLoad)
          .catch(function load(err) {
            throw appendStack(err, new Error());
          })
          .finally(() => {
            this.#loadPromise = undefined;
          }));
        // See if there are any WIP changes, i.e. new parents, that the ^ SQL query didn't know to load.
        // We don't have to `while` loop this, because if parent itself has WIP changes above it, then
        // its own `RecursiveParentsCollectionImpl.load` will load it, before returning to this method.
        const unloadedParent = this.findUnloadedReference();
        if (unloadedParent) {
          await recursiveParentsBatchLoader(this.entity.em, this)
            .load(unloadedParent.entity)
            .catch(function load(err) {
              throw appendStack(err, new Error());
            });
        }
      }
      this.#loaded = true;
    }
    return this.filterDeleted(this.doGet(), opts);
  }

  get isLoaded(): boolean {
    if (this.#loaded !== undefined) return this.#loaded;
    this.#loaded = this.findUnloadedReference() === undefined;
    getEmInternalApi(this.entity.em).isLoadedCache.addNaive(this);
    return this.#loaded;
  }

  resetIsLoaded(): void {
    this.#loaded = undefined;
  }

  get fieldName(): string {
    return this.#fieldName;
  }

  get m2oFieldName(): string {
    return this.#m2oName;
  }

  get otherFieldName(): string {
    return this.#otherFieldName;
  }

  get hasBeenSet(): boolean {
    return false;
  }

  toString(): string {
    return `RecursiveParentsCollectionImpl(entity: ${this.entity}, fieldName: ${this.fieldName})`;
  }

  doGet(): U[] {
    ensureNotDeleted(this.entity, "pending");
    const unloaded = this.findUnloadedReference();
    if (unloaded) {
      throw new Error(this.toString() + `.get was called but ${unloaded} was not loaded`);
    }
    const parents: U[] = [];
    const visited = new Set<U>();
    for (
      let current = getLoadedReference(this.entity[this.#m2oName]);
      current !== undefined;
      current = getLoadedReference(current[this.#m2oName])
    ) {
      parents.push(current);
      if (visited.has(current)) throw new RecursiveCycleError(this, [...visited, current]);
      visited.add(current);
    }
    return parents;
  }

  private findUnloadedReference(): Reference<any, any, any> | undefined {
    const visited = new Set<any>();
    for (let current = this.entity; current !== undefined; current = getLoadedReference(current[this.#m2oName])) {
      const relation = current[this.#m2oName];
      if (isReference(relation) && !isLoadedReference(relation)) return relation;
      if (visited.has(current)) throw new RecursiveCycleError(this, [...visited, current]);
      visited.add(current);
    }
    return undefined;
  }
}

export class RecursiveChildrenCollectionImpl<T extends Entity, U extends Entity>
  extends AbstractRecursiveCollectionImpl<T, U>
  implements ReadOnlyCollection<T, U>, IsLoadedCachable
{
  readonly #fieldName: keyof T & string;
  readonly #o2mName: keyof T & string;
  readonly #otherFieldName: keyof T & string;
  #loaded: boolean | undefined = undefined;
  #loadPromise: Promise<void> | undefined;

  constructor(entity: T, fieldName: keyof T & string, o2mName: keyof T & string, otherFieldName: keyof T & string) {
    super(entity);
    this.#fieldName = fieldName;
    this.#o2mName = o2mName;
    this.#otherFieldName = otherFieldName;
  }

  // opts is an internal parameter
  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<readonly U[]> {
    ensureNotDeleted(this.entity, "pending");
    if (!this.isLoaded || opts.forceReload) {
      if (opts.forceReload) {
        this.#loaded = undefined;
      }
      if (!this.entity.isNewEntity) {
        await (this.#loadPromise ??= recursiveChildrenBatchLoader(this.entity.em, this)
          .load(this.entity)
          .catch(function load(err) {
            throw appendStack(err, new Error());
          })
          .finally(() => {
            this.#loadPromise = undefined;
          }));
      }
      const unloaded = this.findUnloadedCollections();
      if (unloaded.length > 0) {
        // Go through the entities own `fooRecursive` collection so that it's marked as loaded.
        // We don't have to `while` loop this, because if they children themselves have any WIP
        // changes, then their own `RecursiveChildrenCollectionImpl.load` will load them.
        await Promise.all(unloaded.map((r) => (r.entity as any)[this.fieldName].load(opts)));
      }
      this.#loaded = true;
    }
    return this.filterDeleted(this.doGet(), opts);
  }

  get isLoaded(): boolean {
    if (this.#loaded !== undefined) return this.#loaded;
    this.#loaded = this.findUnloadedCollections().length === 0;
    getEmInternalApi(this.entity.em).isLoadedCache.addNaive(this);
    return this.#loaded;
  }

  resetIsLoaded(): void {
    this.#loaded = undefined;
  }

  get fieldName(): string {
    return this.#fieldName;
  }

  get o2mFieldName(): string {
    return this.#o2mName;
  }

  get otherFieldName(): string {
    return this.#otherFieldName;
  }

  get hasBeenSet(): boolean {
    return false;
  }

  toString(): string {
    return `RecursiveChildrenCollectionImpl(entity: ${this.entity}, fieldName: ${this.fieldName})`;
  }

  doGet(): U[] {
    ensureNotDeleted(this.entity, "pending");
    if (!this.isLoaded) {
      throw new Error(this.toString() + `.get was called but when not loaded`);
    }
    const children: U[] = [];
    const visited = new Set<any>();
    // Use a node+path combo to know which path caused the cycle
    const todo: { relation: any; path: U[] }[] = [{ relation: this.entity[this.#o2mName], path: [this.entity as any] }];
    while (todo.length > 0) {
      const { relation, path } = todo.pop()!;
      if (visited.has(relation)) throw new RecursiveCycleError(this, path);
      visited.add(relation);
      for (const child of getLoadedCollection(relation)) {
        children.push(child);
        todo.push({ relation: child[this.#o2mName], path: [...path, child] });
      }
    }
    return children;
  }

  /** Finds any children/downstream o2m collections or o2o references. */
  private findUnloadedCollections(): Relation<any, any>[] {
    const visited = new Set<any>();
    const unloaded: Relation<any, any>[] = [];
    const todo: { relation: any; path: U[] }[] = [{ relation: this.entity[this.#o2mName], path: [this.entity as any] }];
    while (todo.length > 0) {
      const { relation, path } = todo.pop()!;
      if (visited.has(relation)) throw new RecursiveCycleError(this, path);
      visited.add(relation);
      if (isCollection(relation) && !isLoadedCollection(relation)) {
        unloaded.push(relation);
      } else if (isOneToOneReference(relation) && !isLoadedOneToOneReference(relation)) {
        unloaded.push(relation);
      } else {
        for (const child of getLoadedCollection(relation)) {
          todo.push({ relation: child[this.#o2mName], path: [...path, child] });
        }
      }
    }
    return unloaded;
  }
}

export class RecursiveM2mCollectionImpl<T extends Entity, U extends Entity>
  extends AbstractRecursiveCollectionImpl<T, U>
  implements ReadOnlyCollection<T, U>, IsLoadedCachable
{
  readonly #fieldName: keyof T & string;
  readonly #m2mName: keyof T & string;
  readonly #otherFieldName: keyof T & string;
  #loaded: boolean | undefined = undefined;
  #loadPromise: Promise<void> | undefined;

  constructor(entity: T, fieldName: keyof T & string, m2mName: keyof T & string, otherFieldName: keyof T & string) {
    super(entity);
    this.#fieldName = fieldName;
    this.#m2mName = m2mName;
    this.#otherFieldName = otherFieldName;
  }

  // opts is an internal parameter
  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<readonly U[]> {
    ensureNotDeleted(this.entity, "pending");
    if (!this.isLoaded || opts.forceReload) {
      if (opts.forceReload) {
        this.#loaded = undefined;
      }
      if (!this.entity.isNewEntity) {
        await (this.#loadPromise ??= recursiveM2mBatchLoader(this.entity.em, this)
          .load(this.entity)
          .catch(function load(err: any) {
            throw appendStack(err, new Error());
          })
          .finally(() => {
            this.#loadPromise = undefined;
          }));
      }
      const unloaded = this.findUnloadedCollections();
      if (unloaded.length > 0) {
        // Go through the entity's own `fooRecursive` collection so that it's marked as loaded.
        await Promise.all(unloaded.map((r) => (r.entity as any)[this.fieldName].load(opts)));
      }
      this.#loaded = true;
    }
    return this.filterDeleted(this.doGet(), opts);
  }

  get isLoaded(): boolean {
    if (this.#loaded !== undefined) return this.#loaded;
    this.#loaded = this.findUnloadedCollections().length === 0;
    getEmInternalApi(this.entity.em).isLoadedCache.addNaive(this);
    return this.#loaded;
  }

  resetIsLoaded(): void {
    this.#loaded = undefined;
  }

  get fieldName(): string {
    return this.#fieldName;
  }

  get m2mFieldName(): string {
    return this.#m2mName;
  }

  get otherFieldName(): string {
    return this.#otherFieldName;
  }

  get m2mField(): ManyToManyField {
    return this.meta.allFields[this.#m2mName] as ManyToManyField;
  }

  get hasBeenSet(): boolean {
    return false;
  }

  toString(): string {
    return `RecursiveM2mCollectionImpl(entity: ${this.entity}, fieldName: ${this.fieldName})`;
  }

  doGet(): U[] {
    ensureNotDeleted(this.entity, "pending");
    if (!this.isLoaded) {
      throw new Error(this.toString() + `.get was called but when not loaded`);
    }
    const results: U[] = [];
    // Track by entity to handle diamonds (same entity reachable via multiple paths)
    const visited = new Set<any>();
    visited.add(this.entity);
    const todo: { entity: any; path: U[] }[] = [{ entity: this.entity, path: [this.entity as any] }];
    while (todo.length > 0) {
      const { entity: current, path } = todo.pop()!;
      for (const other of getLoadedCollection(current[this.#m2mName])) {
        if (visited.has(other)) {
          // If we're reaching an entity we've already visited, and it's this.entity, that's a cycle
          if (other === this.entity) throw new RecursiveCycleError(this, [...path, other]);
          // Otherwise it's a diamond (reachable via multiple paths) — skip
          continue;
        }
        visited.add(other);
        results.push(other);
        todo.push({ entity: other, path: [...path, other] });
      }
    }
    return results;
  }

  /** Finds any m2m collections that are not yet loaded in the recursive tree. */
  private findUnloadedCollections(): Relation<any, any>[] {
    const visited = new Set<any>();
    visited.add(this.entity);
    const unloaded: Relation<any, any>[] = [];
    const todo: { entity: any; path: U[] }[] = [{ entity: this.entity, path: [this.entity as any] }];
    while (todo.length > 0) {
      const { entity: current, path } = todo.pop()!;
      const relation = current[this.#m2mName];
      if (isCollection(relation) && !isLoadedCollection(relation)) {
        unloaded.push(relation);
      } else {
        for (const other of getLoadedCollection(relation)) {
          if (visited.has(other)) {
            if (other === this.entity) throw new RecursiveCycleError(this, [...path, other]);
            continue;
          }
          visited.add(other);
          todo.push({ entity: other, path: [...path, other] });
        }
      }
    }
    return unloaded;
  }
}

function getLoadedReference(relation: any): any {
  return isLoadedReference(relation) ? relation.get : fail(`${relation} was not loaded`);
}

function getLoadedCollection(relation: any): any {
  return isLoadedCollection(relation)
    ? relation.get
    : isLoadedOneToOneReference(relation)
      ? relation.get
        ? [relation.get]
        : []
      : fail(`${relation} was not loaded`);
}

export class RecursiveCycleError extends Error {
  readonly fieldName: string;
  entities: Entity[] = [];
  constructor(relation: AbstractRecursiveCollectionImpl<any, any>, entities: Entity[]) {
    super(`Cycle detected in ${relation.entity.toString()}.${relation.fieldName}`);
    this.fieldName = relation.fieldName;
    this.entities = entities;
  }
}
