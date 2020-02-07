import { Entity, EntityMetadata } from "../EntityManager";
import { Collection } from "../";

export class OneToManyCollection<T extends Entity, U extends Entity> implements Collection<T, U> {
  private loaded: U[] | undefined;

  constructor(
    // These are public to our internal implementation but not exposed in the Collection API
    public entity: T,
    public otherMeta: EntityMetadata,
    public fieldName: string,
    public otherFieldName: string,
    public otherColumnName: string,
  ) {}

  async load(): Promise<U[]> {
    if (this.loaded === undefined) {
      if (this.entity.id === undefined) {
        this.loaded = [];
      } else {
        this.loaded = await this.entity.__orm.em.loadCollection(this);
      }
    }
    return this.loaded;
  }

  add(other: U): void {
    const { otherFieldName, entity } = this;
    (other as any)[otherFieldName].set(entity);
  }

  get(): U[] {
    if (this.loaded === undefined) {
      if (this.entity.id === undefined) {
        this.loaded = [];
      } else {
        // This should only be callable in the type system if we've already resolved this to an instance
        throw new Error("get() was called when not preloaded");
      }
    }
    return this.loaded;
  }
}
