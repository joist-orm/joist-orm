import { EntityManager } from "joist-orm";

/** A very basic context that has `em` as the Joist `EntityManager`. */
export type Context = { em: EntityManager };
