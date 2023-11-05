import { DeepNew, EntityManager, FactoryOpts, newTestInstance } from "joist-orm";
import { CriticColumn } from "./entities";

export function newCriticColumn(em: EntityManager, opts: FactoryOpts<CriticColumn> = {}): DeepNew<CriticColumn> {
  return newTestInstance(em, CriticColumn, opts);
}
