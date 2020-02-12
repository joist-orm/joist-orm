import { Entity, EntityManager } from "../src/EntityManager";
import { Collection, Reference } from "../src";
import { OneToManyCollection } from "../src/collections/OneToManyCollection";
import { ManyToOneReference } from "../src/collections/ManyToOneReference";
import { AuthorCodegen, Book, bookMeta, Publisher } from "./entities";

export class Author extends AuthorCodegen implements Entity {
  readonly books: Collection<Author, Book> = new OneToManyCollection(this, bookMeta, "books", "author", "author_id");
  readonly publisher: Reference<Author, Publisher> = new ManyToOneReference(this, Publisher, "publisher", "authors");

  constructor(em: EntityManager, opts?: Partial<{ firstName: string }>) {
    super(em);
    if (opts) {
      Object.entries(opts).forEach(([key, value]) => ((this as any)[key] = value));
    }
  }
}
