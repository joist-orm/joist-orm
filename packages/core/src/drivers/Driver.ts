import { EntityManager } from "../EntityManager";
import { ParsedFindQuery } from "../QueryParser";
import { RowData } from "../RowData";
import { JoinRowTodo, Todo } from "../Todo";
import { PreloadPlugin } from "../plugins/PreloadPlugin";

/**
 * Isolates all SQL calls that Joist needs to make to fetch/save data.
 *
 * @typeParam TX - the connection library-specific `Transaction` type, i.e. `Knex.Transaction`
 */
export interface Driver<TX = unknown> {
  /** Executes a low-level `ParsedFindQuery` against the database and returns the rows. */
  executeFind(
    em: EntityManager,
    parsed: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): Promise<any[]>;

  /** Executes a raw SQL query with bindings. */
  executeQuery(em: EntityManager, sql: string, bindings: any[]): Promise<any[]>;

  /**
   * Like `executeFind`, but returns a lazy {@link RowData} instead of materialized POJO rows.
   *
   * This method's *presence* is the capability signal: drivers define it only when lazy rows
   * are supported + enabled (i.e. `PostgresDriver` with `lazyRows: true`), and entity-hydrating
   * loaders fall back to classic rows wrapped in a `PojoRowData` when it is undefined.
   */
  executeFindRowData?(
    em: EntityManager,
    parsed: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): Promise<RowData>;

  transaction<T>(em: EntityManager, fn: (txn: TX) => Promise<T>): Promise<T>;

  assignNewIds(em: EntityManager, todos: Record<string, Todo>): Promise<void>;

  flush(em: EntityManager, todos: Record<string, Todo>, joinRows: Record<string, JoinRowTodo>): Promise<void>;

  /** Allows the driver to opt `EntityManager`s into plugins it has enabled/supported by default. */
  defaultPlugins: { preloadPlugin?: PreloadPlugin };
}
