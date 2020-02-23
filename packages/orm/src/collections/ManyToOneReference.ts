import { ensureNotDeleted, Entity, EntityConstructor, getMetadata, isEntity, sameEntity } from "../EntityManager";
import { maybeResolveReferenceToId, Reference } from "../index";
import { OneToManyCollection } from "./OneToManyCollection";
import { AbstractRelationImpl } from "./AbstractRelationImpl";

/**
 * Manages a foreign key from one entity to another, i.e. `Book.author --> Author`.
 *
 * We keep the current `author` / `author_id` value in the `__orm.data` hash, where the
 * current value could be either the (string) author id from the database, or an entity
 * `Author` that the user has set.
 */
export class ManyToOneReference<T extends Entity, U extends Entity, N extends never | undefined>
  extends AbstractRelationImpl
  implements Reference<T, U, N> {
  private loaded!: U | N;
  // We need a separate boolean to b/c loaded == undefined can still mean "isLoaded" for nullable fks.
  private isLoaded = false;

  constructor(
    private entity: T,
    public otherType: EntityConstructor<U>,
    private fieldName: keyof T,
    public otherFieldName: keyof U,
    private notNull: boolean,
  ) {
    super();
  }

  async load(): Promise<U | N> {
    ensureNotDeleted(this.entity);
    const current = this.current();
    // Resolve the id to an entity
    if (!isEntity(current) && current !== undefined) {
      this.loaded = ((await this.entity.__orm.em.load(this.otherType, current)) as any) as U;
    }
    this.isLoaded = true;
    return this.returnUndefinedIfDeleted(this.loaded);
  }

  set(other: U | N): void {
    // setImpl conditionally checked ensureNotDeleted based on opts.beingDeleted
    this.setImpl(other, {});
  }

  get get(): U | N {
    ensureNotDeleted(this.entity);
    // This should only be callable in the type system if we've already resolved this to an instance
    if (!this.isLoaded) {
      throw new Error(`${this.entity}.${this.fieldName} was not loaded`);
    }
    return this.returnUndefinedIfDeleted(this.loaded);
  }

  get id(): string | N {
    ensureNotDeleted(this.entity);
    return maybeResolveReferenceToId(this.current()) as string | N;
  }

  // private impl

  async refreshIfLoaded(): Promise<void> {
    // TODO We should remember what load hints have been applied to this collection and re-apply them.
    if (this.isLoaded) {
      const current = this.current();
      if (typeof current === "string") {
        this.loaded = ((await this.entity.__orm.em.load(this.otherType, current)) as any) as U;
      } else {
        this.loaded = current;
      }
    }
  }

  /** Some random entity got deleted, it it was in our reference, remove it. */
  onDeleteOfMaybeOtherEntity(maybeOther: Entity): void {
    if (sameEntity(maybeOther, getMetadata(this.otherType), this.current())) {
      // TODO Should we fail this if the field is notNull?
      this.setImpl(undefined as N, { beingDeleted: true });
    }
  }

  // Internal method used by OneToManyCollection
  setImpl(other: U | N, opts?: { beingDeleted?: boolean }): void {
    if (this.isLoaded && other === this.loaded) {
      return;
    }

    const previousLoaded = this.loaded;

    if (!opts || opts.beingDeleted !== true) {
      (this.entity as any).ensureNotDeleted();
    }
    // Prefer to keep the id in our data hash, but if this is a new entity w/o an id, use the entity itself
    this.entity.__orm.em.setField(this.entity, this.fieldName as string, other?.id ?? other);
    this.loaded = other;
    this.isLoaded = true;

    // If had an existing value, remove us from its collection
    if (previousLoaded) {
      const previousCollection = ((previousLoaded as U)[this.otherFieldName] as any) as OneToManyCollection<U, T>;
      previousCollection.removeIfLoaded(this.entity);
    }
    if (other !== undefined) {
      const newCollection = ((other as U)[this.otherFieldName] as any) as OneToManyCollection<U, T>;
      newCollection.add(this.entity);
    }
  }

  // We need to keep U in data[fieldName] to handle entities without an id assigned yet.
  current(): U | string | N {
    return this.entity.__orm.data[this.fieldName];
  }

  private returnUndefinedIfDeleted(e: U | N): U | N {
    if (e !== undefined && e.__orm.deleted) {
      if (this.notNull) {
        throw new Error(`Referenced entity ${e} has been marked as deleted`);
      }
      return undefined as N;
    }
    return e;
  }
}
