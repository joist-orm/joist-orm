import { EntityManager } from "../src/EntityManager";

export class Book {
  readonly __meta = { type: "Book", data: {} as Record<any, any> };

  constructor(private em: EntityManager) {
    em.register(this);
  }

  get id(): string {
    return this.__meta.data["id"];
  }

  get title(): string {
    return this.__meta.data["title"];
  }

  set title(title: string) {
    this.__meta.data["title"] = title;
    this.em.markDirty(this);
  }
}
