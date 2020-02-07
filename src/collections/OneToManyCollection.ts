import { Entity, EntityMetadata, Lazy } from "../EntityManager";
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

  private loaded: U[] | undefined;

  constructor(
    entity: T,
    otherMeta: EntityMetadata,
    fieldName: string,
    otherFieldName: string,
    otherColumnName: string,
  ) {
    this.__orm = { entity, otherMeta, fieldName, otherFieldName, otherColumnName };
  }

  async load(): Promise<U[]> {
    if (this.loaded === undefined) {
      if (this.__orm.entity.id === undefined) {
        this.loaded = [];
      } else {
        this.loaded = await this.__orm.entity.__orm.em.loadCollection(this);
      }
    }
    return this.loaded;
  }

  add(other: U): void {
    const { otherFieldName, entity } = this.__orm;
    (other as any)[otherFieldName].set(entity);
  }

  get(): U[] {
    if (this.loaded === undefined) {
      if (this.__orm.entity.id === undefined) {
        this.loaded = [];
      } else {
        // This should only be callable in the type system if we've already resolved this to an instance
        throw new Error("get() was called when not preloaded");
      }
    }
    return this.loaded;
  }
}
