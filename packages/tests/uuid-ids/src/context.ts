import { EntityManager } from "joist-orm";
import { Knex } from "knex";

export interface Context {
  knex: Knex;
  em: EntityManager;
}
