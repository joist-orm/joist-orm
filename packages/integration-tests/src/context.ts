import { EntityManager } from "joist-orm";
import Knex from "knex";

export interface Context {
  knex: Knex;
  makeApiCall(request: string): Promise<void>;
  em: EntityManager;
}
