import { EntityOrmField, EntityManager, ManyToOneReference, Public, Collection, OneToManyCollection } from "../src";
import { publisherMeta, PublisherSize, Publisher, Author, authorMeta } from "./entities";

export interface PublisherOpts {
  name: string;
  size?: Public<PublisherSize>;
}

export class PublisherCodegen {
  readonly __orm: EntityOrmField;

  readonly authors: Collection<Publisher, Author> = new OneToManyCollection(
    this,
    authorMeta,
    "authors",
    "publisher",
    "publisher_id",
  );

  constructor(em: EntityManager, opts: PublisherOpts) {
    this.__orm = { em, metadata: publisherMeta, data: {} };
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

  get name(): string {
    return this.__orm.data["name"];
  }

  set name(name: string) {
    this.ensureNotDeleted();
    this.__orm.data["name"] = name;
    this.__orm.em.markDirty(this);
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  get size(): PublisherSize {
    return this.__orm.data["size"];
  }

  set size(size: PublisherSize) {
    this.ensureNotDeleted();
    this.__orm.data["size"] = size;
    this.__orm.em.markDirty(this);
  }

  toString(): string {
    return "Publisher#" + this.id;
  }

  private ensureNotDeleted() {
    if (this.__orm.deleted) {
      throw new Error(this.toString() + " is marked as deleted");
    }
  }
}
