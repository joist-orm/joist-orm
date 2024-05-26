import { newTestInstance } from "joist-orm";
import type { DeepNew, FactoryOpts } from "joist-orm";
import { T5BookReview } from "../entities";
import type { EntityManager } from "../entities";

export function newT5BookReview(em: EntityManager, opts: FactoryOpts<T5BookReview> = {}): DeepNew<T5BookReview> {
  return newTestInstance(em, T5BookReview, opts, {});
}
