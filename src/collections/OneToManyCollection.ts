import { Entity, EntityMetadata } from "../EntityManager";
import { Collection } from "../";
import { getOrSet, remove } from "../utils";
import { ManyToOneReference } from "./ManyToOneReference";
import DataLoader from "dataloader";
import { keyToString } from "../serde";

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
        this.loaded = await loaderForCollection(this).load(this.entity.id);
      }
      this.maybeAppendAddedBeforeLoaded();
    }
    return this.loaded;
  }

  add(other: U): void {
    if (this.loaded === undefined) {
      if (!this.addedBeforeLoaded.includes(other)) {
        this.addedBeforeLoaded.push(other);
      }
    } else {
      if (!this.loaded.includes(other)) {
        this.loaded.push(other);
      }
    }
    // This will no-op and mark other dirty if necessary
    ((other[this.otherFieldName] as any) as ManyToOneReference<U, T>).set(this.entity);
  }

  // We're not supported remove(other) because that might leave other.otherFieldName as undefined,
  // which we don't know if that's valid or not, i.e. depending on whether the field is nullable.

  get(): U[] {
    if (this.loaded === undefined) {
      if (this.entity.id === undefined) {
        return this.addedBeforeLoaded;
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

function loaderForCollection<T extends Entity, U extends Entity>(
  collection: OneToManyCollection<T, U>,
): DataLoader<string, U[]> {
  const { em } = collection.entity.__orm;
  // The metadata for the entity that contains the collection
  const meta = collection.entity.__orm.metadata;
  const loaderName = `${meta.tableName}.${collection.fieldName}`;
  return getOrSet(em.loaders, loaderName, () => {
    return new DataLoader<string, U[]>(async keys => {
      const otherMeta = collection.otherMeta;

      const rows = await em.knex
        .select("*")
        .from(otherMeta.tableName)
        .whereIn(collection.otherColumnName, keys as string[])
        .orderBy("id");

      const rowsById: Record<string, U[]> = {};

      rows.forEach(row => {
        const id = keyToString(row["id"])!;

        // See if this is already in our UoW
        let entity = em.findExistingInstance(otherMeta.type, id) as U;

        // If not create it.
        if (!entity) {
          entity = (new otherMeta.cstr(em) as any) as U;
          otherMeta.columns.forEach(c => c.serde.setOnEntity(entity!.__orm.data, row));
        }

        // TODO If this came from the UoW, it may not be an id? I.e. pre-insert.
        const ownerId = entity.__orm.data[collection.otherFieldName];
        if (ownerId === undefined) {
          throw new Error("Could not find ownerId in other entity");
        }

        getOrSet(rowsById, ownerId, []).push(entity);
      });

      return keys.map(k => rowsById[k] || []);
    });
  });
}
