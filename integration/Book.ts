import { EntityManager } from "../src/EntityManager";
import { ManyToOneReference } from "../src/collections/ManyToOneReference";
import { ManyToManyCollection } from "../src/collections/ManyToManyCollection";
import { Collection, Reference } from "../src";
import { Author, BookCodegen, Tag } from "./entities";

export class Book extends BookCodegen {
  readonly author: Reference<Book, Author> = new ManyToOneReference(this, Author, "author", "books");
  readonly tags: Collection<Book, Tag> = new ManyToManyCollection(
    "books_to_tags",
    this,
    "tags",
    "book_id",
    Tag,
    "books",
    "tag_id",
  );

  constructor(em: EntityManager, opts?: Partial<{ title: string }>) {
    super(em);
    if (opts) {
      Object.entries(opts).forEach(([key, value]) => ((this as any)[key] = value));
    }
  }
}
