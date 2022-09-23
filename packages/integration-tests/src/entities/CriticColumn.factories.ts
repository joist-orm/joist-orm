import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { CriticColumn } from "./entities";
import type { EntityManager } from "./entities";

/** @ignore */
export function newCriticColumn(em: EntityManager, opts: FactoryOpts<CriticColumn> = {}): DeepNew<CriticColumn> {
  return newTestInstance(em, CriticColumn, opts);
}
