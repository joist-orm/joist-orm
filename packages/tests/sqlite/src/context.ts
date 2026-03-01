import type { EntityManager } from "joist-orm";
import type Database from "better-sqlite3";

export interface Context {
  db: Database.Database;
  em: EntityManager;
}
