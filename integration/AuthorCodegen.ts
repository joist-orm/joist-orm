import { EntityOrmField, EntityManager, Collection, OneToManyCollection } from "../src";
import { authorMeta, Author, Book, bookMeta } from "./entities";

export class AuthorCodegen {
  readonly __orm: EntityOrmField;

  readonly books: Collection<Author, Book> = new OneToManyCollection(this, bookMeta, "books", "author", "author_id");

  constructor(em: EntityManager) {
    this.__orm = { metadata: authorMeta, data: {} as Record<any, any>, em };
    em.register(this);
    //if (opts) {
    //  Object.entries(opts).forEach(([key, value]) => ((this as any)[key] = value));
    //}
  }

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

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  toString(): string {
    return "Author#" + this.id;
  }
}
