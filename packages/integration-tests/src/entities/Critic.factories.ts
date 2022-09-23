import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import type { EntityManager } from "./entities";
import { Critic } from "./entities";

// for testing factories
export let lastCriticFactory: any = null;

/** @ignore */
export function newCritic(em: EntityManager, opts: FactoryOpts<Critic> = {}): DeepNew<Critic> {
  lastCriticFactory = opts;
  return newTestInstance(em, Critic, opts);
}
