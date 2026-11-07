import type Database from "better-sqlite3";
import type { EntityManager } from "joist-orm";

export interface Context {
  db: Database.Database;
  em: EntityManager;
}
