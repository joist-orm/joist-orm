import { EntityManager } from "joist-orm";
import { Sql } from "postgres";

export interface Context {
  sql: Sql;
  em: EntityManager;
}
