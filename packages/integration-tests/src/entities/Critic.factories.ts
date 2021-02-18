import { EntityManager, FactoryOpts, New, newTestInstance } from "joist-orm";
import { Critic } from "./entities";

export function newCritic(em: EntityManager, opts?: FactoryOpts<Critic>): New<Critic> {
  return newTestInstance(em, Critic, opts);
}
