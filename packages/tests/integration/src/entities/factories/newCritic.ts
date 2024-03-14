import { DeepNew, EntityManager, FactoryOpts, newTestInstance } from "joist-orm";
import { Critic } from "../entities";

// for testing factories
export let lastCriticFactory: any = null;

export function newCritic(em: EntityManager, opts: FactoryOpts<Critic> = {}): DeepNew<Critic> {
  lastCriticFactory = opts;
  return newTestInstance(em, Critic, opts);
}
