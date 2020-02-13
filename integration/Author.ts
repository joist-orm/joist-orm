import { Entity, EntityManager } from "../src";
import { AuthorCodegen } from "./entities";

export class Author extends AuthorCodegen implements Entity {
  constructor(em: EntityManager, opts?: Partial<{ firstName: string }>) {
    super(em);
    if (opts) {
      Object.entries(opts).forEach(([key, value]) => ((this as any)[key] = value));
    }
  }
}
