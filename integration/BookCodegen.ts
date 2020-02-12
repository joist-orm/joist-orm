import { EntityOrmField, EntityManager } from "../src";
import { bookMeta } from "./entities";

export class BookCodegen {
  readonly __orm: EntityOrmField;

  constructor(em: EntityManager) {
    this.__orm = { metadata: bookMeta, data: {} as Record<any, any>, em };
    em.register(this);
    //if (opts) {
    //  Object.entries(opts).forEach(([key, value]) => ((this as any)[key] = value));
    //}
  }

  get id(): string | undefined {
    return this.__orm.data["id"];
  }

  get title(): string {
    return this.__orm.data["title"];
  }

  set title(title: string) {
    this.__orm.data["title"] = title;
    this.__orm.em.markDirty(this);
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  toString(): string {
    return "Book#" + this.id;
  }
}
