import { Entity, EntityManager } from "../src/EntityManager";
import { Collection } from "../src";
import { ManyToManyCollection } from "../src/collections/ManyToManyCollection";
import { Book, TagCodegen } from "./entities";

export class Tag extends TagCodegen implements Entity {
  readonly books: Collection<Tag, Book> = new ManyToManyCollection(
    "books_to_tags",
    this,
    "books",
    "tag_id",
    Book,
    "tags",
    "book_id",
  );

  constructor(em: EntityManager, opts?: Partial<{ name: string }>) {
    super(em);
    if (opts) {
      Object.entries(opts).forEach(([key, value]) => ((this as any)[key] = value));
    }
  }
}
