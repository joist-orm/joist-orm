import { Entity, EntityManager, Reference } from "../src";
import { ManyToOneReference } from "../src/collections/ManyToOneReference";
import { AuthorCodegen, Publisher } from "./entities";

export class Author extends AuthorCodegen implements Entity {
  readonly publisher: Reference<Author, Publisher> = new ManyToOneReference(this, Publisher, "publisher", "authors");

  constructor(em: EntityManager, opts?: Partial<{ firstName: string }>) {
    super(em);
    if (opts) {
      Object.entries(opts).forEach(([key, value]) => ((this as any)[key] = value));
    }
  }
}
