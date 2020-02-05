import { EntityManager } from "../src/EntityManager";

export class Author {
  readonly __meta = { type: "Author", data: {} as Record<any, any> };

  constructor(private em: EntityManager) {
    em.register(this);
  }

  get id(): string {
    return this.__meta.data["id"];
  }

  get firstName(): string {
    return this.__meta.data["firstName"];
  }

  set firstName(firstName: string) {
    this.__meta.data["firstName"] = firstName;
    this.em.markDirty(this);
  }
}
