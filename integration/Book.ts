import { EntityManager } from "../src/EntityManager";

export class Book {
  constructor(em: EntityManager) {
    em.register(this);
  }

  id!: string;

  title!: string;

  readonly __meta = { type: "Book" };
}
