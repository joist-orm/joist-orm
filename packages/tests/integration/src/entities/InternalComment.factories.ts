import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { InternalComment } from "./entities";
import type { EntityManager } from "./entities";

export function newInternalComment(
  em: EntityManager,
  opts: FactoryOpts<InternalComment> = {},
): DeepNew<InternalComment> {
  return newTestInstance(em, InternalComment, opts, {});
}
