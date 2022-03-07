import { EntityManager, FactoryOpts, New, newTestInstance } from "joist-orm";
import { CriticColumn } from "./entities";

export function newCriticColumn(em: EntityManager, opts: FactoryOpts<CriticColumn> = {}): New<CriticColumn> {
  return newTestInstance(em, CriticColumn, opts);
}
