import { EntityOrmField, EntityManager, Collection, OneToManyCollection } from "../src";
import { publisherMeta, Publisher, Author, authorMeta } from "./entities";

export interface PublisherOpts {
  name: string;
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
    this.__orm = { metadata: publisherMeta, data: {}, em };
    em.register(this);
    Object.entries(opts).forEach(([key, value]) => ((this as any)[key] = value));
  }

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

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  toString(): string {
    return "Publisher#" + this.id;
  }
}
