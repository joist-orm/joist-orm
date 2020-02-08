import { Entity, EntityManager, EntityMetadata, EntityOrmField } from "../src/EntityManager";
import { PrimaryKeySerde, SimpleSerde } from "../src/serde";
import { Collection } from "../src";
import { ManyToManyCollection } from "../src/collections/ManyToManyCollection";
import { Book } from "./Book";

export class Tag implements Entity {
  readonly __orm: EntityOrmField;
  readonly books: Collection<Tag, Book> = new ManyToManyCollection(
    "books_to_tags",
    this,
    "books",
    "tag_id",
    Book,
    "tags",
    "book_id",
  );

  constructor(em: EntityManager, opts?: Partial<{ name: string }>) {
    this.__orm = { metadata: tagMeta, data: {} as Record<any, any>, em };
    em.register(this);
    if (opts) {
      Object.entries(opts).forEach(([key, value]) => ((this as any)[key] = value));
    }
  }

  // TODO Codegen
  get id(): string {
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
    return `Tag#${this.id}`;
  }
}

// TODO Codegen
const tagMeta: EntityMetadata<Tag> = {
  cstr: Tag,
  type: "Tag",
  tableName: "tags",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde("id", "id") },
    {
      fieldName: "name",
      columnName: "name",
      dbType: "varchar",
      serde: new SimpleSerde("name", "name"),
    },
  ],
  order: 3,
};

(Tag as any).metadata = tagMeta;
