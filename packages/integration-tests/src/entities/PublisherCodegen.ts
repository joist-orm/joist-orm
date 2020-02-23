import { EntityOrmField, EntityManager, ManyToOneReference, fail, Collection, OneToManyCollection } from "joist-orm";
import { publisherMeta, PublisherSize, Publisher, Author, authorMeta } from "./entities";

export interface PublisherOpts {
  name: string;
  size?: PublisherSize;
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
    this.__orm = { em, metadata: publisherMeta, data: {}, originalData: {} };
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

  get idOrFail(): string {
    return this.__orm.data["id"] || fail("Entity has no id yet");
  }

  get name(): string {
    return this.__orm.data["name"];
  }

  set name(name: string) {
    this.ensureNotDeleted();
    this.__orm.em.setField(this, "name", name);
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  get size(): PublisherSize | undefined {
    return this.__orm.data["size"];
  }

  set size(size: PublisherSize | undefined) {
    this.ensureNotDeleted();
    this.__orm.em.setField(this, "size", size);
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
