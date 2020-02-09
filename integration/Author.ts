import { Entity, EntityManager, EntityMetadata, EntityOrmField } from "../src/EntityManager";
import { Book, bookMeta } from "./Book";
import { PrimaryKeySerde, SimpleSerde } from "../src/serde";
import { Collection } from "../src";
import { OneToManyCollection } from "../src/collections/OneToManyCollection";

export class Author implements Entity {
  readonly __orm: EntityOrmField;
  readonly books: Collection<Author, Book> = new OneToManyCollection(this, bookMeta, "books", "author", "author_id");

  constructor(em: EntityManager, opts?: Partial<{ firstName: string }>) {
    this.__orm = { metadata: authorMeta, data: {} as Record<any, any>, em };
    em.register(this);
    if (opts) {
      Object.entries(opts).forEach(([key, value]) => ((this as any)[key] = value));
    }
  }

  // TODO Codegen
  get id(): string | undefined {
    return this.__orm.data["id"];
  }

  get firstName(): string {
    return this.__orm.data["firstName"];
  }

  set firstName(firstName: string) {
    this.__orm.data["firstName"] = firstName;
    this.__orm.em.markDirty(this);
  }

  toString(): string {
    return `Author#${this.id}`;
  }
}

// TODO Codegen
export const authorMeta: EntityMetadata<Author> = {
  cstr: Author,
  type: "Author",
  tableName: "authors",
  columns: [
    { fieldName: "id", columnName: "id", dbType: "int", serde: new PrimaryKeySerde("id", "id") },
    {
      fieldName: "firstName",
      columnName: "first_name",
      dbType: "varchar",
      serde: new SimpleSerde("firstName", "first_name"),
    },
  ],
  order: 1,
};

(Author as any).metadata = authorMeta;
