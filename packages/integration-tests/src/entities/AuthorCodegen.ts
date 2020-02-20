import {
  EntityOrmField,
  EntityManager,
  ManyToOneReference,
  Collection,
  OneToManyCollection,
  Reference,
} from "joist-orm";
import { authorMeta, Author, Book, bookMeta, Publisher } from "./entities";

export interface AuthorOpts {
  firstName: string;
  lastName?: string;
  isPopular?: boolean;
  publisher?: Publisher;
}

export class AuthorCodegen {
  readonly __orm: EntityOrmField;

  readonly books: Collection<Author, Book> = new OneToManyCollection(this, bookMeta, "books", "author", "author_id");

  readonly publisher: Reference<Author, Publisher, undefined> = new ManyToOneReference<Author, Publisher, undefined>(
    this,
    Publisher,
    "publisher",
    "authors",
    false,
  );

  constructor(em: EntityManager, opts: AuthorOpts) {
    this.__orm = { em, metadata: authorMeta, data: {} };
    em.register(this);
    Object.entries(opts).forEach(([key, value]) => {
      if ((this as any)[key] instanceof ManyToOneReference) {
        (this as any)[key].set(value);
      } else {
        (this as any)[key] = value;
      }
    });
  }

  get id(): string | undefined {
    return this.__orm.data["id"];
  }

  get firstName(): string {
    return this.__orm.data["firstName"];
  }

  set firstName(firstName: string) {
    this.ensureNotDeleted();
    this.__orm.data["firstName"] = firstName;
    this.__orm.em.markDirty(this);
  }

  get lastName(): string | undefined {
    return this.__orm.data["lastName"];
  }

  set lastName(lastName: string | undefined) {
    this.ensureNotDeleted();
    this.__orm.data["lastName"] = lastName;
    this.__orm.em.markDirty(this);
  }

  get isPopular(): boolean | undefined {
    return this.__orm.data["isPopular"];
  }

  set isPopular(isPopular: boolean | undefined) {
    this.ensureNotDeleted();
    this.__orm.data["isPopular"] = isPopular;
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

  private ensureNotDeleted() {
    if (this.__orm.deleted) {
      throw new Error(this.toString() + " is marked as deleted");
    }
  }
}
