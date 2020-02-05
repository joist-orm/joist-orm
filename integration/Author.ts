import { EntityManager } from "../src/EntityManager";

export class Author {
  constructor(em: EntityManager) {
    em.register(this);
  }

  id!: string;

  firstName!: string;

  readonly __meta = { type: "Author" };
}
