import { EntityOrmField, EntityManager, Collection, OneToManyCollection, Reference, ManyToOneReference } from "../src";
import { authorMeta, Author, Book, bookMeta, Publisher } from "./entities";

export interface AuthorOpts {
  firstName: string;
}

export class AuthorCodegen {
  readonly __orm: EntityOrmField;

  readonly books: Collection<Author, Book> = new OneToManyCollection(this, bookMeta, "books", "author", "author_id");

  readonly publisher: Reference<Author, Publisher> = new ManyToOneReference(this, Publisher, "publisher", "authors");

  constructor(em: EntityManager, opts: AuthorOpts) {
    this.__orm = { metadata: authorMeta, data: {}, em };
    em.register(this);
    Object.entries(opts).forEach(([key, value]) => ((this as any)[key] = value));
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
