import { EntityManager } from "joist-core";

/** A very basic context that has `em` as the Joist `EntityManager`. */
export type Context = { em: EntityManager };
