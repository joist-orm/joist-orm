import { Entity, EntityConstructor } from "../EntityManager";
import { Reference } from "../index";

export class ManyToOneReference<T extends Entity, U extends Entity> implements Reference<T, U> {
  constructor(private entity: T, private otherType: EntityConstructor<U>, private fieldName: string) {}

  async load(): Promise<U> {
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
    this.entity.__orm.data[this.fieldName] = other;
  }

  get(): U {
    // This should only be callable in the type system if we've already resolved this to an instance
    const maybeId = this.entity.__orm.data[this.fieldName];
    if (!("id" in maybeId)) {
      throw new Error(`${maybeId} should have been an object`);
    }
    return maybeId as U;
  }
}
