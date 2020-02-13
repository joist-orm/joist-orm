import { EntityManager } from "../src";
import { BookCodegen } from "./entities";

export class Book extends BookCodegen {
  constructor(em: EntityManager, opts?: Partial<{ title: string }>) {
    super(em);
    if (opts) {
      Object.entries(opts).forEach(([key, value]) => ((this as any)[key] = value));
    }
  }
}
