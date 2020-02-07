import { Entity, EntityMetadata } from "../EntityManager";
import { Collection } from "../";
import { remove } from "../utils";
import { ManyToOneReference } from "./ManyToOneReference";

export class OneToManyCollection<T extends Entity, U extends Entity> implements Collection<T, U> {
  private loaded: U[] | undefined;
  private addedBeforeLoaded: U[] = [];

  constructor(
    // These are public to our internal implementation but not exposed in the Collection API
    public entity: T,
    public otherMeta: EntityMetadata<U>,
    public fieldName: keyof T,
    public otherFieldName: keyof U,
    public otherColumnName: string,
  ) {}

  async load(): Promise<U[]> {
    if (this.loaded === undefined) {
      if (this.entity.id === undefined) {
        this.loaded = [];
      } else {
        this.loaded = await this.entity.__orm.em.loadCollection(this);
      }
      this.maybeAppendAddedBeforeLoaded();
    }
    return this.loaded;
  }

  add(other: U): void {
    if (this.loaded === undefined) {
      this.addedBeforeLoaded.push(other);
    } else {
      this.loaded.push(other);
    }
    ((other[this.otherFieldName] as any) as ManyToOneReference<U, T>).set(this.entity);
  }

  // We're not supported remove(other) because that might leave other.otherFieldName as undefined,
  // which we don't know if that's valid or not, i.e. depending on whether the field is nullable.

  get(): U[] {
    if (this.loaded === undefined) {
      if (this.entity.id === undefined) {
        this.loaded = [];
        this.maybeAppendAddedBeforeLoaded();
      } else {
        // This should only be callable in the type system if we've already resolved this to an instance
        throw new Error("get() was called when not preloaded");
      }
    }
    return this.loaded;
  }

  // internal impl

  removeIfLoaded(other: U) {
    if (this.loaded !== undefined) {
      remove(this.loaded, other);
    } else {
      remove(this.addedBeforeLoaded, other);
    }
  }

  private maybeAppendAddedBeforeLoaded(): void {
    if (this.loaded) {
      this.loaded.unshift(...this.addedBeforeLoaded);
      this.addedBeforeLoaded = [];
    }
  }
}
