import { Entity, EntityConstructor, getMetadata, IdOf, isEntity, sameEntity } from "../EntityManager";
import { ensureNotDeleted, fail, getEm, maybeResolveReferenceToId, Reference, setField } from "../index";
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
  extends AbstractRelationImpl<U>
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
    ensureNotDeleted(this.entity, { ignore: "pending" });
    const current = this.current();
    // Resolve the id to an entity
    if (!isEntity(current) && current !== undefined) {
      this.loaded = ((await getEm(this.entity).load(this.otherType, current)) as any) as U;
    }
    this.isLoaded = true;
    return this.returnUndefinedIfDeleted(this.loaded);
  }

  set(other: U | N): void {
    this.setImpl(other);
  }

  isSet(): boolean {
    return this.current() !== undefined;
  }

  get get(): U | N {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    // This should only be callable in the type system if we've already resolved this to an instance
    if (!this.isLoaded) {
      throw new Error(`${this.entity}.${this.fieldName} was not loaded`);
    }
    return this.returnUndefinedIfDeleted(this.loaded);
  }

  get id(): IdOf<U> | undefined {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    return maybeResolveReferenceToId(this.current()) as IdOf<U> | undefined;
  }

  get idOrFail(): IdOf<U> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    return this.id || fail("Reference is unset or assigned to a new entity");
  }

  // private impl

  setFromOpts(other: U): void {
    this.setImpl(other);
  }

  initializeForNewEntity(): void {
    // Our codegen'd Opts type will ensure our field is inititalized if necessary/notNull
    this.isLoaded = true;
  }

  async refreshIfLoaded(): Promise<void> {
    // TODO We should remember what load hints have been applied to this collection and re-apply them.
    if (this.isLoaded) {
      const current = this.current();
      if (typeof current === "string") {
        this.loaded = ((await getEm(this.entity).load(this.otherType, current)) as any) as U;
      } else {
        this.loaded = current;
      }
    }
  }

  /** Some random entity got deleted, it it was in our reference, remove it. */
  onDeleteOfMaybeOtherEntity(maybeOther: Entity): void {
    if (sameEntity(maybeOther, getMetadata(this.otherType), this.current())) {
      // TODO Should we fail this if the field is notNull?
      this.setImpl(undefined as N);
    }
  }

  async onEntityDeletedAndFlushing(): Promise<void> {}

  // Internal method used by OneToManyCollection
  setImpl(other: U | N): void {
    if (this.isLoaded && other === this.loaded) {
      return;
    }

    const previousLoaded = this.loaded;

    ensureNotDeleted(this.entity, { ignore: "pending" });

    // Prefer to keep the id in our data hash, but if this is a new entity w/o an id, use the entity itself
    setField(this.entity, this.fieldName as string, other?.id ?? other);
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
    if (e !== undefined && e.isDeletedEntity && !e.isPendingDelete) {
      if (this.notNull) {
        throw new Error(`Referenced entity ${e} has been marked as deleted`);
      }
      return undefined as N;
    }
    return e;
  }

  public toString(): string {
    return `ManyToOneReference(entity: ${this.entity}, fieldName: ${this.fieldName}, otherType: ${this.otherType.name}, otherFieldName: ${this.otherFieldName}, id: ${this.id})`;
  }
}
