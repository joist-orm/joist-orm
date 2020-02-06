import { Entity, EntityConstructor, EntityMetadata } from "../EntityManager";

export class Relation<T extends Entity, U extends Entity> {
  constructor(private entity: T, private otherType: EntityConstructor<U>, private fieldName: string) {}

  load(): Promise<U> {
    const id = this.entity.__orm.data[this.fieldName];
    return this.entity.__orm.em.load(this.otherType, id);
  }

  set(other: U): void {
    this.entity.__orm.data[this.fieldName] = other.id || other;
  }
}

export class Collection<T extends Entity, U extends Entity> {
  // Hide our impl details inside of the __orm API convention
  public __orm: {
    entity: T;
    otherMeta: EntityMetadata;
    fieldName: string;
    otherFieldName: string;
    otherColumnName: string;
  };

  constructor(
    entity: T,
    otherMeta: EntityMetadata,
    fieldName: string,
    otherFieldName: string,
    otherColumnName: string,
  ) {
    this.__orm = { entity, otherMeta, fieldName, otherFieldName, otherColumnName };
  }

  load(): Promise<U[]> {
    return this.__orm.entity.__orm.em.loadCollection(this);
  }
}
