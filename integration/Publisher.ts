import { Entity, EntityManager } from "../src";
import { PublisherCodegen } from "./entities";

export class Publisher extends PublisherCodegen implements Entity {
  constructor(em: EntityManager, opts?: Partial<{ name: string }>) {
    super(em);
    if (opts) {
      Object.entries(opts).forEach(([key, value]) => ((this as any)[key] = value));
    }
  }
}
