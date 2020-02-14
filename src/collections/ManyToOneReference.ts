import { Entity, EntityConstructor, isEntity } from "../EntityManager";
import { Public, Reference } from "../index";
import { OneToManyCollection } from "./OneToManyCollection";

export class ManyToOneReference<T extends Entity, U extends Entity> implements Reference<T, U> {
  constructor(
    private entity: T,
    private otherType: EntityConstructor<U>,
    private fieldName: keyof T,
    private otherFieldName: keyof U,
  ) {}

  async load(): Promise<Public<U>> {
    // This will be a string id unless we've already loaded it.
    const maybeId = this.entity.__orm.data[this.fieldName];
    if (maybeId.id) {
      return maybeId as U;
    }
    const other = await this.entity.__orm.em.load(this.otherType, maybeId as string);
    this.entity.__orm.data[this.fieldName] = other;
    return other;
  }

  set(other: U): void {
    this.setImpl(other);
  }

  get get(): U {
    // This should only be callable in the type system if we've already resolved this to an instance
    const current = this.current();
    if (!isEntity(current)) {
      throw new Error(`${current} should have been an object`);
    }
    return current;
  }

  // Internal method used by OneToManyCollection
  setImpl(other: U): void {
    // If had an existing value, remove us from its collection
    const current = this.current();
    if (other === current) {
      return;
    }

    if (isEntity(current)) {
      const previousCollection = (current[this.otherFieldName] as any) as OneToManyCollection<U, T>;
      previousCollection.removeIfLoaded(this.entity);
    }

    (this.entity as any).ensureNotDeleted();
    this.entity.__orm.data[this.fieldName] = other;
    this.entity.__orm.dirty = true;

    const newCollection = (other[this.otherFieldName] as any) as OneToManyCollection<U, T>;
    newCollection.add(this.entity);
  }

  current(): undefined | number | U {
    return this.entity.__orm.data[this.fieldName];
  }
}
