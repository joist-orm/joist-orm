import { Collection, EntityManager } from "../src";
import { ManyToManyCollection } from "../src/collections/ManyToManyCollection";
import { BookCodegen, Tag } from "./entities";

export class Book extends BookCodegen {
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
