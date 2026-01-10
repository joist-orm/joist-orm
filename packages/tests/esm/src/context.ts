import { EntityManager } from "joist-orm";
import { type Sql } from "postgres";

export interface Context {
  sql: Sql;
  em: EntityManager;
}
