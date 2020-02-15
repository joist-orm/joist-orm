import { Entity, EntityConstructor, isEntity } from "../EntityManager";
import { Reference } from "../index";
import { OneToManyCollection } from "./OneToManyCollection";

export class ManyToOneReference<T extends Entity, U extends Entity, V extends U | undefined>
  implements Reference<T, V> {
  constructor(
    private entity: T,
    private otherType: EntityConstructor<U>,
    private fieldName: keyof T,
    private otherFieldName: keyof U,
  ) {}

  async load(): Promise<V> {
    // This will be a string id unless we've already loaded it.
    const maybeId = this.entity.__orm.data[this.fieldName];
    if (maybeId && maybeId.id) {
      return maybeId as V;
    }
    if (maybeId === undefined) {
      return undefined as any;
    }
    const other = ((await this.entity.__orm.em.load(this.otherType, maybeId as string)) as any) as V;
    this.entity.__orm.data[this.fieldName] = other;
    return other;
  }

  set(other: V): void {
    this.setImpl(other);
  }

  get get(): V {
    // This should only be callable in the type system if we've already resolved this to an instance
    const current = this.current();
    if (current !== undefined && !isEntity(current)) {
      throw new Error(`${current} should have been an object`);
    }
    return current as V;
  }

  // Internal method used by OneToManyCollection
  setImpl(other: V): void {
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

    if (other !== undefined) {
      const newCollection = ((other as U)[this.otherFieldName] as any) as OneToManyCollection<U, T>;
      newCollection.add(this.entity);
    }
  }

  current(): U | undefined | number {
    return this.entity.__orm.data[this.fieldName];
  }
}
