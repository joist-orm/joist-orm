import { Entity, EntityManager } from "../src/EntityManager";
import { Collection } from "../src";
import { OneToManyCollection } from "../src/collections/OneToManyCollection";
import { Author, authorMeta, PublisherCodegen } from "./entities";

export class Publisher extends PublisherCodegen implements Entity {
  readonly authors: Collection<Publisher, Author> = new OneToManyCollection(
    this,
    authorMeta,
    "authors",
    "publisher",
    "publisher_id",
  );

  constructor(em: EntityManager, opts?: Partial<{ name: string }>) {
    super(em);
    if (opts) {
      Object.entries(opts).forEach(([key, value]) => ((this as any)[key] = value));
    }
  }
}
