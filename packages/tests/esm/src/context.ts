import { EntityManager } from "joist-orm";
import { type Knex } from "knex";

export interface Context {
  knex: Knex;
  em: EntityManager;
}
