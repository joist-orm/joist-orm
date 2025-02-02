import { sql, type TransactionSQL } from "bun";
import { Driver, EntityManager, IdAssigner, ParsedFindQuery, SequenceIdAssigner } from "joist-orm";
import { JoinRowTodo, Todo } from "joist-orm/build/Todo";

export class BunPgDriver implements Driver<TransactionSQL> {
  private readonly idAssigner: IdAssigner;

  constructor() {
    this.idAssigner = new SequenceIdAssigner(async (s) => await sql(s));
  }

  executeFind(
    em: EntityManager,
    parsed: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): Promise<any[]> {
    throw new Error("Method not implemented.");
  }

  executeQuery(em: EntityManager, sql: string, bindings: any[]): Promise<any[]> {
    throw new Error("Method not implemented.");
  }

  transaction<T>(em: EntityManager, fn: (txn: TransactionSQL) => Promise<T>): Promise<T> {
    throw new Error("Method not implemented.");
  }

  assignNewIds(em: EntityManager, todos: Record<string, Todo>): Promise<void> {
    throw new Error("Method not implemented.");
  }

  flushEntities(em: EntityManager, todos: Record<string, Todo>): Promise<void> {
    throw new Error("Method not implemented.");
  }

  flushJoinTables(em: EntityManager, joinRows: Record<string, JoinRowTodo>): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
