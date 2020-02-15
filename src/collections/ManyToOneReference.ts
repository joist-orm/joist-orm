import { Entity, EntityConstructor, isEntity } from "../EntityManager";
import { Reference } from "../index";
import { OneToManyCollection } from "./OneToManyCollection";

export class ManyToOneReference<T extends Entity, U extends Entity, N extends never | undefined>
  implements Reference<T, U, N> {
  constructor(
    private entity: T,
    public otherType: EntityConstructor<U>,
    private fieldName: keyof T,
    public otherFieldName: keyof U,
  ) {}

  async load(): Promise<U | N> {
    // This will be a string id unless we've already loaded it.
    const maybeId = this.entity.__orm.data[this.fieldName];
    if (maybeId && maybeId.id) {
      return maybeId as U;
    }
    if (maybeId === undefined) {
      return undefined as N;
    }
    const other = ((await this.entity.__orm.em.load(this.otherType, maybeId as string)) as any) as U;
    this.entity.__orm.data[this.fieldName] = other;
    return other;
  }

  set(other: U | N): void {
    this.setImpl(other);
  }

  get get(): U | N {
    // This should only be callable in the type system if we've already resolved this to an instance
    const current = this.current();
    if (current !== undefined && !isEntity(current)) {
      throw new Error(`${current} should have been an object`);
    }
    return current as U | N;
  }

  // Internal method used by OneToManyCollection
  setImpl(other: U | N): void {
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
