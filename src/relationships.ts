import { Entity, EntityConstructor } from "./EntityManager";

export class Relation<T extends Entity, U extends Entity> {
  constructor(private entity: T, private otherType: EntityConstructor<U>, private fieldName: string) {
  }

  load(): Promise<U> {
    const id = this.entity.__orm.data[this.fieldName];
    return this.entity.__orm.em.load(this.otherType, id);
  }

  set(other: U): void {
    this.entity.__orm.data[this.fieldName] = other.id || other;
  }
}
