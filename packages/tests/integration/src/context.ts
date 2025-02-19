import { Sql } from "postgres";
import { EntityManager } from "src/entities";

export interface Context {
  sql: Sql;
  makeApiCall(request: string): Promise<void>;
  em: EntityManager;
}
