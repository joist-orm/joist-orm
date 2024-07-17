import { recursiveChildrenDataLoader } from "../dataloaders/recursiveChildrenDataLoader";
import { recursiveParentsDataLoader } from "../dataloaders/recursiveParentsDataLoader";
import {
  ensureNotDeleted,
  Entity,
  EntityMetadata,
  fail,
  getMetadata,
  isCollection,
  isLoadedCollection,
  isLoadedOneToOneReference,
  isLoadedReference,
  isOneToOneReference,
  isReference,
  Reference,
  Relation,
} from "../index";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { ReadOnlyCollection } from "./ReadOnlyCollection";
import { RelationT, RelationU } from "./Relation";

/**
 * An alias for creating `RecursiveParentsCollectionImpl`s.
 *
 * I.e. for `Author.mentor` (m2o fk), we can return `Author.mentorsRecursive` recursively looking up.
 */
export function hasRecursiveParents<T extends Entity, U extends Entity>(
  entity: T,
  fieldName: keyof T & string, // i.e. `author.mentorsRecursive`
  m2oName: keyof T & string, // i.e. `author.mentor`
): ReadOnlyCollection<T, U> {
  return new RecursiveParentsCollectionImpl(entity, fieldName, m2oName);
}

/**
 * An alias for creating `RecursiveChildrenCollectionImpl`s.
 *
 * I.e. for `Author.mentees` (o2m), we can return `Author.menteesRecursive` recursively looking down.
 */
export function hasRecursiveChildren<T extends Entity, U extends Entity>(
  entity: T,
  fieldName: keyof T & string, // i.e. `author.menteesRecursive`
  o2mName: keyof T & string, // i.e. `author.mentees`
): ReadOnlyCollection<T, U> {
  return new RecursiveChildrenCollectionImpl(entity, fieldName, o2mName);
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
  implements ReadOnlyCollection<T, U>
{
  readonly #fieldName: keyof T & string;
  readonly #m2oName: keyof T & string;

  constructor(entity: T, fieldName: keyof T & string, m2oName: keyof T & string) {
    super(entity);
    this.#fieldName = fieldName;
    this.#m2oName = m2oName;
  }

  // opts is an internal parameter
  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<readonly U[]> {
    ensureNotDeleted(this.entity, "pending");
    if (!this.isLoaded || opts.forceReload) {
      await recursiveParentsDataLoader(this.entity.em, this).load(this.entity);
      // See if there are any WIP changes, i.e. new parents, that the ^ SQL query didn't know to load.
      // We don't have to `while` loop this, because if parent itself has WIP changes above it, then
      // its own `RecursiveParentsCollectionImpl.load` will load it, before returning to this method.
      const unloadedParent = this.findUnloadedReference();
      if (unloadedParent) {
        await recursiveParentsDataLoader(this.entity.em, this).load(unloadedParent.entity);
      }
    }
    return this.filterDeleted(this.doGet(), opts);
  }

  get isLoaded(): boolean {
    return this.findUnloadedReference() === undefined;
  }

  get fieldName(): string {
    return this.#fieldName;
  }

  get m2oFieldName(): string {
    return this.#m2oName;
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
  implements ReadOnlyCollection<T, U>
{
  readonly #fieldName: keyof T & string;
  readonly #o2mName: keyof T & string;
  #loaded: boolean;

  constructor(entity: T, fieldName: keyof T & string, o2mName: keyof T & string) {
    super(entity);
    this.#fieldName = fieldName;
    this.#o2mName = o2mName;
    this.#loaded = entity.isNewEntity;
  }

  // opts is an internal parameter
  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<readonly U[]> {
    ensureNotDeleted(this.entity, "pending");
    if (!this.isLoaded || opts.forceReload) {
      // New entities can't have any children
      if (!this.entity.isNewEntity) {
        await recursiveChildrenDataLoader(this.entity.em, this).load(this.entity);
        const unloaded = this.findUnloadedCollections();
        if (unloaded.length > 0) {
          // Go through the entities own `fooRecursive` collection so that it's marked as loaded.
          // We don't have to `while` loop this, because if they children themselves have any WIP
          // changes, then their own `RecursiveChildrenCollectionImpl.load` will load them.
          await Promise.all(unloaded.map((r) => (r.entity as any)[this.fieldName].load(opts)));
        }
      }
      this.#loaded = true;
    }
    return this.filterDeleted(this.doGet(), opts);
  }

  get isLoaded(): boolean {
    return this.#loaded;
  }

  get fieldName(): string {
    return this.#fieldName;
  }

  get o2mFieldName(): string {
    return this.#o2mName;
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
  entities: Entity[] = [];
  constructor(relation: AbstractRecursiveCollectionImpl<any, any>, entities: Entity[]) {
    super(`Cycle detected in ${relation.entity.toString()}.${relation.fieldName}`);
    this.entities = entities;
  }
}
