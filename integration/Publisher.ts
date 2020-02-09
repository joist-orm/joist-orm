import { Entity, EntityManager, EntityMetadata, EntityOrmField } from "../src/EntityManager";
import { PrimaryKeySerde, SimpleSerde } from "../src/serde";
import { Collection } from "../src";
import { OneToManyCollection } from "../src/collections/OneToManyCollection";
import { Author, authorMeta } from "./Author";

export class Publisher implements Entity {
  readonly __orm: EntityOrmField;
  readonly authors: Collection<Publisher, Author> = new OneToManyCollection(
    this,
    authorMeta,
    "authors",
    "publisher",
    "publisher_id",
  );

  constructor(em: EntityManager, opts?: Partial<{ name: string }>) {
    this.__orm = { metadata: publisherMeta, data: {} as Record<any, any>, em };
    em.register(this);
    if (opts) {
      Object.entries(opts).forEach(([key, value]) => ((this as any)[key] = value));
    }
  }

  // TODO Codegen
  get id(): string | undefined {
    return this.__orm.data["id"];
  }

  get name(): string {
    return this.__orm.data["name"];
  }

  set name(name: string) {
    this.__orm.data["name"] = name;
    this.__orm.em.markDirty(this);
  }

  toString(): string {
    return `Publisher#${this.id}`;
  }
}

// TODO Codegen
export const publisherMeta: EntityMetadata<Publisher> = {
  cstr: Publisher,
  type: "Publisher",
  tableName: "publishers",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde("id", "id") },
    {
      fieldName: "name",
      columnName: "name",
      dbType: "varchar",
      serde: new SimpleSerde("name", "name"),
    },
  ],
  order: 1,
};

(Publisher as any).metadata = publisherMeta;
