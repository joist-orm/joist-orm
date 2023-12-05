import { manyToManyFindDataLoader } from "../dataloaders/manyToManyFindDataLoader";
import { Entity } from "../Entity";
import { IdOf } from "../EntityManager";
import { EntityMetadata } from "../EntityMetadata";
import { ensureNotDeleted, getMetadata, ManyToManyCollection, toTaggedId } from "../index";
import { remove } from "../utils";
import { LargeCollection } from "./LargeCollection";
import { RelationT, RelationU } from "./Relation";

/** An alias for creating `ManyToManyLargeCollection`s. */
export function hasLargeManyToMany<T extends Entity, U extends Entity>(
  entity: T,
  joinTableName: string,
  fieldName: keyof T & string,
  columnName: string,
  otherMeta: EntityMetadata<U>,
  otherFieldName: keyof U & string,
  otherColumnName: string,
): LargeCollection<T, U> {
  return new ManyToManyLargeCollection(
    joinTableName,
    entity,
    fieldName,
    columnName,
    otherMeta,
    otherFieldName,
    otherColumnName,
  );
}

export class ManyToManyLargeCollection<T extends Entity, U extends Entity> implements LargeCollection<T, U> {
  // Even though a large collection can never be loaded, we do track local
  // mutations so that `find` can be accurate.
  private locallyAdded: U[] = [];
  private locallyRemoved: U[] = [];

  constructor(
    public joinTableName: string,
    // I.e. when entity = Book:
    // fieldName == tags, because it's our collection to tags
    // columnName = book_id, what we use as the `where book_id = us` to find our join table rows
    // otherFieldName = books, how tags points to us
    // otherColumnName = tag_id, how the other side finds its join table rows
    public entity: T,
    public fieldName: keyof T & string,
    public columnName: string,
    public otherMeta: EntityMetadata,
    public otherFieldName: keyof U & string,
    public otherColumnName: string,
  ) {}

  async find(id: IdOf<U>): Promise<U | undefined> {
    ensureNotDeleted(this.entity, "pending");

    // locallyAdded is never authorative b/c we never become fully loaded (unlike OneToManyCollection),
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

    // Make a cacheable tuple to look up this specific m2m row
    const key = `${this.columnName}=${this.entity.id},${this.otherColumnName}=${id}`;
    const includes = await manyToManyFindDataLoader(this.entity.em, this).load(key);
    const taggedId = toTaggedId(this.otherMeta, id);
    return includes ? (this.entity.em.load(taggedId) as Promise<U>) : undefined;
  }

  async includes(other: U): Promise<boolean> {
    const localAdd = this.locallyAdded.includes(other);
    if (localAdd) {
      return true;
    }

    const localRemove = this.locallyRemoved.includes(other);
    if (localRemove) {
      return false;
    }

    if (this.entity.isNewEntity || other.isNewEntity) {
      return false;
    }

    // Make a cacheable tuple to look up this specific m2m row
    const key = `${this.columnName}=${this.entity.id},${this.otherColumnName}=${other.id}`;
    return manyToManyFindDataLoader(this.entity.em, this).load(key);
  }

  add(other: U): void {
    remove(this.locallyRemoved, other);
    if (!this.locallyAdded.includes(other)) {
      this.locallyAdded.push(other);
    }
    (other[this.otherFieldName] as any as ManyToManyCollection<U, T>).add(this.entity, true);
  }

  remove(other: U): void {
    remove(this.locallyAdded, other);
    if (!this.locallyRemoved.includes(other)) {
      this.locallyRemoved.push(other);
    }
    (other[this.otherFieldName] as any as ManyToManyCollection<U, T>).remove(this.entity, true);
  }

  public get meta(): EntityMetadata {
    return getMetadata(this.entity);
  }

  public toString(): string {
    return `${this.entity}.${this.fieldName}`;
  }

  isLoaded = false;

  [RelationT]: T = null!;
  [RelationU]: U = null!;
}
