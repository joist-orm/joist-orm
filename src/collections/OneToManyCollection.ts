import { Entity, EntityMetadata } from "../EntityManager";
import { Collection } from "../";

export class OneToManyCollection<T extends Entity, U extends Entity> implements Collection<T, U> {
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
