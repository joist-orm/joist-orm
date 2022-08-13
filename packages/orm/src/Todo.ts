/** The operations for a given entity type, so they can be executed in bulk. */
import { Entity } from "./Entity";
import { EntityMetadata, getMetadata } from "./EntityMetadata";
import { ManyToManyCollection } from "./relations";
import { JoinRow } from "./relations/ManyToManyCollection";

/** A group of insert/update/delete operations for a given entity. */
export class Todo {
  inserts: Entity[] = [];
  updates: Entity[] = [];
  deletes: Entity[] = [];
  validates: Map<Entity, Set<Function>> = new Map();
  asyncFields: Map<Entity, Set<Function>> = new Map();
  constructor(public metadata: EntityMetadata<any>) {}
}

/**
 * Scans `entities` for new/updated entities and arranges them per-type in entity order.
 */
export function createTodos(entities: Entity[], filterUnsavedDeletedEntities: boolean): Record<string, Todo> {
  const todos: Record<string, Todo> = {};
  for (const entity of entities) {
    if (entity.isPendingFlush) {
      const todo = getTodo(todos, entity);
      if (entity.isPendingDelete) {
        if (!entity.isNewEntity || !filterUnsavedDeletedEntities) {
          todo.deletes.push(entity);
        }
      } else if (entity.isNewEntity) {
        todo.inserts.push(entity);
      } else {
        todo.updates.push(entity);
      }
      // Force recalc all async fields if the user called em.touch
      if (entity.__orm.isTouched) {
        const { asyncFields } = todo;
        if (!asyncFields.has(entity)) {
          asyncFields.set(entity, new Set());
        }
        const set = asyncFields.get(entity)!;
        Object.values(getMetadata(entity).config.__data.asyncDerivedFields).forEach(({ fn }) => set.add(fn));
      }
    }
  }
  return todos;
}

/** getOrSets a `Todo` for `entity` in `todos`. */
export function getTodo(todos: Record<string, Todo>, entity: Entity): Todo {
  return (todos[getMetadata(entity).type] ??= new Todo(entity.__orm.metadata));
}

export interface JoinRowTodo {
  // Store the m2m reference (either side of the m2m, it doesn't matter which) to help tag/untag the foreign keys
  m2m: ManyToManyCollection<any, any>;
  newRows: JoinRow[];
  deletedRows: JoinRow[];
}

/** Given a list of `JoinRow`s for a given table, combine them into a single logical `JoinRowTodo`. */
export function combineJoinRows(joinRows: Record<string, JoinRow[]>): Record<string, JoinRowTodo> {
  const todos: Record<string, JoinRowTodo> = {};
  for (const [joinTableName, rows] of Object.entries(joinRows)) {
    const newRows = rows.filter((r) => r.id === undefined && r.deleted !== true);
    const deletedRows = rows.filter((r) => r.id !== undefined && r.deleted === true);
    if (newRows.length > 0 || deletedRows.length > 0) {
      todos[joinTableName] = { newRows, deletedRows, m2m: rows[0].m2m };
    }
  }
  return todos;
}
