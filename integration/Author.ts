import { Entity, EntityManager, EntityMetadata, EntityOrmField } from "../src/EntityManager";
import { Book, bookMeta } from "./Book";
import { ForeignKeySerde, PrimaryKeySerde, SimpleSerde } from "../src/serde";
import { Collection, Reference } from "../src";
import { OneToManyCollection } from "../src/collections/OneToManyCollection";
import { ManyToOneReference } from "../src/collections/ManyToOneReference";
import { Publisher, publisherMeta } from "./Publisher";

export class Author implements Entity {
  readonly __orm: EntityOrmField;
  readonly books: Collection<Author, Book> = new OneToManyCollection(this, bookMeta, "books", "author", "author_id");
  readonly publisher: Reference<Author, Publisher> = new ManyToOneReference(this, Publisher, "publisher", "authors");

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
    {
      fieldName: "publisher",
      columnName: "publisher_id",
      dbType: "int",
      serde: new ForeignKeySerde("publisher", "publisher_id", () => publisherMeta),
    },
  ],
  order: 1,
};

(Author as any).metadata = authorMeta;
