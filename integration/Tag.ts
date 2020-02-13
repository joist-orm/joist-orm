import { EntityManager } from "../src";
import { TagCodegen } from "./entities";

export class Tag extends TagCodegen {
  constructor(em: EntityManager, opts?: Partial<{ name: string }>) {
    super(em);
    if (opts) {
      Object.entries(opts).forEach(([key, value]) => ((this as any)[key] = value));
    }
  }
}
