/** The operations for a given entity type, so they can be executed in bulk. */
import { getInstanceData } from "./BaseEntity";
import { Entity } from "./Entity";
import { EntityMetadata, getMetadata } from "./EntityMetadata";
import { JoinRow, JoinRows } from "./JoinRows";
import { ManyToManyCollection } from "./relations";
import { groupBy } from "./utils";

/** A group of insert/update/delete operations for a given entity. */
export class Todo {
  static groupByType(todos: Record<string, Todo>): Map<EntityMetadata, Entity[]> {
    return new Map(
      Object.values(todos).flatMap((todo) => {
        return todo.metadata.inheritanceType
          ? [...groupBy(todo.inserts, (e) => getMetadata(e)).entries()]
          : ([[todo.metadata, todo.inserts]] as const);
      }),
    );
  }

  inserts: Entity[] = [];
  updates: Entity[] = [];
  deletes: Entity[] = [];

  constructor(
    /** The metadata for entities in this todo; it will be the base metadata for any subtypes. */
    public metadata: EntityMetadata,
  ) {}
}

/**
 * Scans `entities` for new/updated entities and groups them by type (by base type if applicable).
 */
export function createTodos(entities: readonly Entity[]): Record<string, Todo> {
  const todos: Record<string, Todo> = {};
  for (const entity of entities) {
    const op = getInstanceData(entity).pendingOperation;
    if (op !== "none") {
      const todo = getTodo(todos, entity);
      switch (op) {
        case "insert":
          todo.inserts.push(entity);
          break;
        case "update":
          todo.updates.push(entity);
          break;
        case "delete":
          todo.deletes.push(entity);
          break;
      }
    }
  }
  return todos;
}

/** getOrSets a `Todo` for `entity` in `todos`. */
export function getTodo(todos: Record<string, Todo>, entity: Entity): Todo {
  const meta = getMetadata(entity);
  // Always create todos around the base table, so that we get the best batching against it
  const maybeBase = meta.baseTypes[0] || meta;
  return (todos[maybeBase.type] ??= new Todo(maybeBase));
}

export interface JoinRowTodo {
  // Store the m2m reference (either side of the m2m, it doesn't matter which) to help tag/untag the foreign keys
  m2m: ManyToManyCollection<any, any>;
  newRows: JoinRow[];
  deletedRows: JoinRow[];
  resetAfterFlushed: () => void;
}

/** Given a list of `JoinRow`s for a given table, combine them into a single logical `JoinRowTodo`. */
export function combineJoinRows(joinRows: Record<string, JoinRows>): Record<string, JoinRowTodo> {
  const todos: Record<string, JoinRowTodo> = {};
  for (const [joinTableName, rows] of Object.entries(joinRows)) {
    const todo = rows.toTodo();
    if (todo) todos[joinTableName] = todo;
  }
  return todos;
}
