import { recursiveParentsDataLoader } from "../dataloaders/recursiveParentsDataLoader";
import { ensureNotDeleted, Entity, EntityMetadata, fail, getMetadata, isLoadedReference } from "../index";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { ReadOnlyCollection } from "./ReadOnlyCollection";
import { RelationT, RelationU } from "./Relation";

/**
 * An alias for creating `ManyToRecursiveCollection`s.
 *
 * I.e. for `Author.mentor` (m2o fk), we can return `Author.allMentors` recursively looking up,
 * as well as `Author.allMentees` recursively looking down.
 */
export function hasRecursiveMany<T extends Entity, U extends Entity>(
  entity: T,
  fieldName: keyof T & string, // i.e. `author.mentorRecursive`
  m2oName: keyof T & string, // i.e. `author.mentor`
): ReadOnlyCollection<T, U> {
  return new ManyToRecursiveCollectionImpl(entity, fieldName, m2oName);
}

export class ManyToRecursiveCollectionImpl<T extends Entity, U extends Entity>
  extends AbstractRelationImpl<T, U[]>
  implements ReadOnlyCollection<T, U>
{
  readonly #fieldName: keyof T & string;
  readonly #m2oName: keyof T & string;
  #loaded = false;

  constructor(entity: T, fieldName: keyof T & string, m2oName: keyof T & string) {
    super(entity);
    this.#fieldName = fieldName;
    this.#m2oName = m2oName;
  }

  // opts is an internal parameter
  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<readonly U[]> {
    ensureNotDeleted(this.entity, "pending");
    if (!this.isLoaded || (opts.forceReload && !this.entity.isNewEntity)) {
      await recursiveParentsDataLoader(this.entity.em, this).load(this.entity.idTagged);
      this.#loaded = true;
    }
    return this.filterDeleted(this.doGet(), opts);
  }

  get isLoaded(): boolean {
    // ...maybe do a check against our recursive relations?
    return this.#loaded;
  }

  get get(): U[] {
    return this.filterDeleted(this.doGet(), { withDeleted: false });
  }

  get getWithDeleted(): U[] {
    return this.filterDeleted(this.doGet(), { withDeleted: true });
  }

  setFromOpts(value: U[]): void {
    throw new Error("Method not implemented.");
  }

  set(value: U[]): void {
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

  get fieldName(): string {
    return this.#fieldName;
  }

  get m2oFieldName(): string {
    return this.#m2oName;
  }

  get meta(): EntityMetadata {
    return getMetadata(this.entity);
  }

  toString(): string {
    return `ManyToRecursiveCollectionImpl(entity: ${this.entity}, fieldName: ${this.fieldName})`;
  }

  private doGet(): U[] {
    ensureNotDeleted(this.entity, "pending");
    if (!this.#loaded) {
      // This should only be callable in the type system if we've already resolved this to an instance
      throw new Error(this.toString() + ".get was called when not loaded");
    }
    let parents: U[] = [];
    let current = getLoadedReference(this.entity[this.#m2oName]);
    while (current !== undefined) {
      parents.push(current);
      current = getLoadedReference(current[this.#m2oName]);
    }
    return parents;
  }

  /** Removes pending-hard-delete or soft-deleted entities, unless explicitly asked for. */
  private filterDeleted(entities: U[], opts?: { withDeleted?: boolean }): U[] {
    return opts?.withDeleted === true
      ? [...entities]
      : entities.filter((e) => !e.isDeletedEntity && !(e as any).isSoftDeletedEntity);
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
}

function getLoadedReference(relation: any): any {
  return isLoadedReference(relation) ? relation.get : fail(`${relation} was not loaded`);
}
