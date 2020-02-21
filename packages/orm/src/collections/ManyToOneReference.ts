import { ensureNotDeleted, Entity, EntityConstructor, isEntity } from "../EntityManager";
import { Reference } from "../index";
import { OneToManyCollection } from "./OneToManyCollection";

/**
 * Manages a foreign key from one entity to another, i.e. `Book.author --> Author`.
 *
 * We keep the current `author` / `author_id` value in the `__orm.data` hash, where the
 * current value could be either the (string) author id from the database, or an entity
 * `Author` that the user has set.
 */
export class ManyToOneReference<T extends Entity, U extends Entity, N extends never | undefined>
  implements Reference<T, U, N> {
  private loaded: U | undefined;

  constructor(
    private entity: T,
    public otherType: EntityConstructor<U>,
    private fieldName: keyof T,
    public otherFieldName: keyof U,
    private notNull: boolean,
  ) {}

  async load(): Promise<U | N> {
    ensureNotDeleted(this.entity);
    if (this.loaded !== undefined) {
      return this.returnUndefinedIfDeleted(this.loaded);
    }
    const current = this.current();
    if (current === undefined) {
      return undefined as N;
    }
    // Resolve the id to an entity
    const other = ((await this.entity.__orm.em.load(this.otherType, current)) as any) as U;
    this.loaded = other;
    return this.returnUndefinedIfDeleted(other);
  }

  // opts is an internal parameter
  set(other: U | N, opts?: { beingDeleted?: boolean }): void {
    // setImpl conditionally checked ensureNotDeleted based on opts.beingDeleted
    this.setImpl(other, opts);
  }

  get get(): U | N {
    ensureNotDeleted(this.entity);
    // This should only be callable in the type system if we've already resolved this to an instance
    if (this.loaded === undefined) {
      throw new Error(`${this.current()} should have been an object`);
    }
    return this.returnUndefinedIfDeleted(this.loaded);
  }

  // private impl

  async refreshIfLoaded(): Promise<void> {
    // TODO We should remember what load hints have been applied to this collection and re-apply them.
    if (this.loaded) {
      this.loaded = ((await this.entity.__orm.em.load(this.otherType, this.current() as string)) as any) as U;
    }
  }

  // Internal method used by OneToManyCollection
  setImpl(other: U | N, opts?: { beingDeleted?: boolean }): void {
    // If had an existing value, remove us from its collection
    const current = this.current();
    if (other === current) {
      return;
    }

    if (this.loaded) {
      const previousCollection = (this.loaded[this.otherFieldName] as any) as OneToManyCollection<U, T>;
      previousCollection.removeIfLoaded(this.entity);
    }

    if (!opts || opts.beingDeleted !== true) {
      (this.entity as any).ensureNotDeleted();
    }
    this.entity.__orm.em.setField(this.entity, this.fieldName as string, other?.id);

    if (other !== undefined) {
      const newCollection = ((other as U)[this.otherFieldName] as any) as OneToManyCollection<U, T>;
      newCollection.add(this.entity);
    }
  }

  current(): string | undefined {
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
