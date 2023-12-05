import { oneToManyFindDataLoader } from "../dataloaders/oneToManyFindDataLoader";
import { Entity } from "../Entity";
import { IdOf, sameEntity } from "../EntityManager";
import { EntityMetadata } from "../EntityMetadata";
import { ensureNotDeleted, getMetadata, ManyToOneReferenceImpl } from "../index";
import { remove } from "../utils";
import { LargeCollection } from "./LargeCollection";
import { RelationT, RelationU } from "./Relation";

/** An alias for creating `OneToManyLargeCollection`s. */
export function hasLargeMany<T extends Entity, U extends Entity>(
  entity: T,
  otherMeta: EntityMetadata<U>,
  fieldName: keyof T & string,
  otherFieldName: keyof U & string,
  otherColumnName: string,
): LargeCollection<T, U> {
  return new OneToManyLargeCollection(entity, otherMeta, fieldName, otherFieldName, otherColumnName);
}

export class OneToManyLargeCollection<T extends Entity, U extends Entity> implements LargeCollection<T, U> {
  // Even though a large collection can never be loaded, we do track local
  // mutations so that `find` can be accurate.
  private locallyAdded: U[] = [];
  private locallyRemoved: U[] = [];

  constructor(
    // These are public to our internal implementation but not exposed in the Collection API
    public entity: T,
    public otherMeta: EntityMetadata,
    public fieldName: keyof T & string,
    public otherFieldName: keyof U & string,
    public otherColumnName: string,
  ) {}

  async find(id: IdOf<U>): Promise<U | undefined> {
    ensureNotDeleted(this.entity, "pending");

    // locallyAdded is never authoritative b/c we never become fully loaded (unlike OneToManyCollection),
    // so we can probe our local collection, but if we don't find anything, we still have to query
    const localAdd = this.locallyAdded.find((u) => u.id === id);
    if (localAdd) {
      return localAdd;
    }

    const localRemove = this.locallyRemoved.find((u) => u.id === id);
    if (localRemove) {
      return undefined;
    }

    if (this.entity.isNewEntity) {
      return undefined;
    }

    // Make a cacheable tuple to look up this specific o2m row
    const key = `id=${id},${this.otherColumnName}=${this.entity.id}`;
    return oneToManyFindDataLoader(this.entity.em, this).load(key);
  }

  async includes(other: U): Promise<boolean> {
    return sameEntity(this.entity, this.getOtherRelation(other).current());
  }

  add(other: U): void {
    remove(this.locallyRemoved, other);
    if (!this.locallyAdded.includes(other)) {
      this.locallyAdded.push(other);
    }
    // This will no-op and mark other dirty if necessary
    this.getOtherRelation(other).set(this.entity);
  }

  remove(other: U): void {
    remove(this.locallyAdded, other);
    if (!this.locallyRemoved.includes(other)) {
      this.locallyRemoved.push(other);
    }
    // This will no-op and mark other dirty if necessary
    this.getOtherRelation(other).set(undefined);
  }

  public get meta(): EntityMetadata {
    return getMetadata(this.entity);
  }

  public toString(): string {
    return `${this.entity}.${this.fieldName}`;
  }

  /** Returns the other relation that points back at us, i.e. we're `Author.image` and this is `Image.author_id`. */
  private getOtherRelation(other: U): ManyToOneReferenceImpl<U, T, any> {
    return (other as U)[this.otherFieldName] as any;
  }

  isLoaded = false;

  [RelationT]: T = null!;
  [RelationU]: U = null!;
}
