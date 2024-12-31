import { Knex } from "knex";
import { EntityManager } from "../EntityManager";
import { ParsedFindQuery } from "../QueryParser";
import { JoinRowTodo, Todo } from "../Todo";

/** Isolates all SQL calls that joist needs to make to fetch/save data. */
export interface Driver {
  /** Executes a low-level `ParsedFindQuery` against the database and returns the rows. */
  executeFind(
    em: EntityManager,
    parsed: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): Promise<any[]>;

  /** Executes a raw SQL query with bindings. */
  executeQuery(em: EntityManager, sql: string, bindings: readonly any[]): Promise<any[]>;

  transaction<T>(em: EntityManager, fn: (txn: Knex.Transaction) => Promise<T>): Promise<T>;

  assignNewIds(em: EntityManager, todos: Record<string, Todo>): Promise<void>;

  flushEntities(em: EntityManager, todos: Record<string, Todo>): Promise<void>;

  flushJoinTables(em: EntityManager, joinRows: Record<string, JoinRowTodo>): Promise<void>;
}
