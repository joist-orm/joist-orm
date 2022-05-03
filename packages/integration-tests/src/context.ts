import { Knex } from "knex";
import { EntityManager } from "src/entities";

export interface Context {
  knex: Knex;
  makeApiCall(request: string): Promise<void>;
  em: EntityManager;
}
