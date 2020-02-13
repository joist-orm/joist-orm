import { EntityOrmField, EntityManager, Collection, ManyToManyCollection } from "../src";
import { tagMeta, Tag, Book } from "./entities";

export class TagCodegen {
  readonly __orm: EntityOrmField;

  readonly books: Collection<Tag, Book> = new ManyToManyCollection(
    "books_to_tags",
    this,
    "books",
    "tag_id",
    Book,
    "tags",
    "book_id",
  );

  constructor(em: EntityManager) {
    this.__orm = { metadata: tagMeta, data: {} as Record<any, any>, em };
    em.register(this);
    //if (opts) {
    //  Object.entries(opts).forEach(([key, value]) => ((this as any)[key] = value));
    //}
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
    return "Tag#" + this.id;
  }
}
