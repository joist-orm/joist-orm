import { type DeepNew, type FactoryOpts, newTestInstance } from "joist-orm";

import { type EntityManager, T5BookReview } from "../entities";

export function newT5BookReview(em: EntityManager, opts: FactoryOpts<T5BookReview> = {}): DeepNew<T5BookReview> {
  return newTestInstance(em, T5BookReview, opts, {});
}
