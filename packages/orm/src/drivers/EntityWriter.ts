import { getOrmField } from "../BaseEntity";
import { Entity } from "../Entity";
import {
  EntityMetadata,
  Field,
  PrimitiveField,
  getBaseAndSelfMetas,
  getBaseSelfAndSubMetas,
  getMetadata,
} from "../EntityMetadata";
import { Todo } from "../Todo";
import { getField, isChangeableField } from "../fields";
import { keyToNumber } from "../keys";
import { hasSerde } from "../serde";

type Column = { columnName: string; dbType: string };
export type InsertOp = { tableName: string; columns: Column[]; rows: any[][] };
export type UpdateOp = { tableName: string; columns: Column[]; rows: any[][]; updatedAt: string | undefined };
export type DeleteOp = { tableName: string; ids: any[] };

type Ops = { inserts: InsertOp[]; updates: UpdateOp[]; deletes: DeleteOp[] };

/**
 * Builds AST-ish `Ops` for the inserts/updates/deletes in `todos`.
 *
 * This helps decouple the database-specific driver/library from the knowledge
 * of turning entities into table operations, i.e. so they can be unaware of
 * complexities like field -> column mapping, oplocks, and class table inheritance.
 *
 * We still assume Postgres b/c we assume all ids have been pre-assigned for INSERTs,
 * and don't do any topological sorting of cross-row FK dependencies.
 *
 * But this should let us experiment with knex vs. raw client/etc.
 */
export function generateOps(todos: Record<string, Todo>): Ops {
  const ops: Ops = { inserts: [], updates: [], deletes: [] };
  for (const todo of Object.values(todos)) {
    addInserts(ops, todo);
    addUpdates(ops, todo);
    addDeletes(ops, todo);
  }
  return ops;
}

function addInserts(ops: Ops, todo: Todo): void {
  if (todo.inserts.length > 0) {
    // If we have subtypes, this todo.metadata will always be the base type
    const meta = todo.metadata;
    if (meta.subTypes.length > 0) {
      if (meta.inheritanceType === "cti") {
        // Insert into each of the CTI tables
        for (const [meta, group] of groupEntitiesByTable(todo.inserts)) {
          ops.inserts.push(newInsertOp(meta, group));
        }
      } else if (meta.inheritanceType === "sti") {
        ops.inserts.push(newStiInsertOp(meta, todo.inserts));
      } else {
        throw new Error(`Found ${meta.tableName} subTypes without a known inheritanceType ${meta.inheritanceType}`);
      }
    } else {
      ops.inserts.push(newInsertOp(meta, todo.inserts));
    }
  }
}

function newInsertOp(meta: EntityMetadata, entities: Entity[]): InsertOp {
  const columns = Object.values(meta.fields)
    .filter(hasSerde)
    .flatMap((f) => f.serde.columns);
  const rows = collectBindings(entities, columns);
  return { tableName: meta.tableName, columns, rows };
}

function newStiInsertOp(root: EntityMetadata, entities: Entity[]): InsertOp {
  // Get the unique set of subtypes
  const subTypes = new Set<EntityMetadata>();
  for (const e of entities) subTypes.add(getMetadata(e));
  // All the root fields (including id)
  const fields: Field[] = Object.values(root.fields);
  // Then the subtype fields that haven't been seen yet (subtypes have the root fields + can share non-root fields)
  for (const st of subTypes) {
    for (const f of Object.values(st.fields)) {
      if (!fields.some((f2) => f2.fieldName === f.fieldName)) {
        fields.push(f);
      }
    }
  }
  const columns = fields.filter(hasSerde).flatMap((f) => f.serde.columns);
  // And then collect the same bindings across each STI
  const rows = collectBindings(entities, columns);
  return { tableName: root.tableName, columns, rows };
}

function addUpdates(ops: Ops, todo: Todo): void {
  if (todo.updates.length > 0) {
    const meta = todo.metadata;
    if (meta.subTypes.length > 0) {
      if (meta.inheritanceType === "cti") {
        for (const [meta, group] of groupEntitiesByTable(todo.updates)) {
          const op = newUpdateOp(meta, group);
          if (op) ops.updates.push(op);
        }
      } else if (meta.inheritanceType === "sti") {
        const op = newUpdateOp(meta, todo.updates);
        if (op) ops.updates.push(op);
      } else {
        throw new Error(`Found ${meta.tableName} subTypes without a known inheritanceType ${meta.inheritanceType}`);
      }
    } else {
      const op = newUpdateOp(meta, todo.updates);
      if (op) ops.updates.push(op);
    }
  }
}

function newUpdateOp(meta: EntityMetadata, entities: Entity[]): UpdateOp | undefined {
  // We only include changed fields in our `UPDATE`--maybe we could change this
  // to always use the same fields, to take advantage of Prepared Statements.
  const changedFields = new Set<string>();
  for (const entity of entities) {
    Object.keys(getOrmField(entity).originalData).forEach((key) => changedFields.add(key));
  }
  // Sometimes with derived fields, an instance will be marked as an update, but if the derived field hasn't
  // actually changed, it'll be a noop, so just short-circuit if it looks like that happened. Unless touched.
  if (changedFields.size === 0 && !entities.some((e) => getOrmField(e).isTouched)) {
    return undefined;
  }

  // We may have loaded a1 and a2, and changed a1.firstName, and a2.lastName, but either one
  // might be missing the other's changed fields in it's lazy-initialized data field...
  // (Use `?` because subtypes won't have the updatedAt, and it will be handled by the base type
  // `newUpdateUp`--except STI where we're doing it all in one go, probably needs checked here.)
  const updatedAt = meta.timestampFields?.updatedAt;
  changedFields.add("id");
  if (updatedAt) changedFields.add(updatedAt);
  for (const entity of entities) {
    const { data } = getOrmField(entity);
    for (const key of changedFields) {
      // Check isChangeableField because we might be updating the base `publishers` table
      // and `originalData` might have fields from a subclass `large_publishers` table.
      if (!(key in data) && isChangeableField(entity, key)) {
        getField(entity, key);
      }
    }
  }

  const columns: Array<Column & BindingColumn> = (
    meta.inheritanceType === "sti"
      ? // Hack this one handling of STI into here...
        getBaseSelfAndSubMetas(meta).flatMap((meta) =>
          meta.stiDiscriminatorField
            ? Object.values(meta.fields)
            : Object.values(meta.fields).filter((f) => f.fieldName !== "id"),
        )
      : Object.values(meta.fields)
  )
    .filter((f) => changedFields.has(f.fieldName))
    .filter(hasSerde)
    .flatMap((f) => f.serde.columns);

  // If we're using class table inheritance, base/child tables may not have any columns to update
  if (columns.length === 1) {
    return undefined;
  }

  // We already have the bumped updated_at column, but also include the original updated_at for the data CTE
  if (updatedAt) {
    columns.push({
      columnName: "__original_updated_at",
      dbType: "timestamptz",
      dbValue: (_, originalData) => originalData[updatedAt],
    });
  }

  const rows = collectBindings(entities, columns);
  const updatedAtColumn = updatedAt
    ? (meta.fields[updatedAt] as PrimitiveField).serde.columns[0].columnName
    : undefined;
  return { tableName: meta.tableName, columns, updatedAt: updatedAtColumn, rows };
}

function addDeletes(ops: Ops, todo: Todo): void {
  if (todo.deletes.length > 0) {
    const meta = todo.metadata;
    const ids = todo.deletes.map((e) => keyToNumber(meta, e.idTagged!).toString());
    if (meta.subTypes.length > 0) {
      getBaseSelfAndSubMetas(meta).forEach((meta) => {
        ops.deletes.push({ tableName: meta.tableName, ids });
      });
    } else {
      ops.deletes.push({ tableName: meta.tableName, ids });
    }
  }
}

function groupEntitiesByTable(entities: Entity[]): Array<[EntityMetadata, Entity[]]> {
  const entitiesByType: Map<EntityMetadata, Entity[]> = new Map();
  for (const e of entities) {
    for (const m of getBaseAndSelfMetas(getMetadata(e))) {
      let list = entitiesByType.get(m);
      if (!list) {
        list = [];
        entitiesByType.set(m, list);
      }
      list.push(e);
    }
  }
  return [...entitiesByType.entries()];
}

// This structurally matches our serde column but adds an originalData
// param so that the updatedAt psuedo-column can get its original value.
interface BindingColumn {
  dbValue(data: any, originalData?: any): any;
}

function collectBindings(entities: Entity[], columns: BindingColumn[]): any[][] {
  const rows = [];
  for (const entity of entities) {
    const { data, originalData } = getOrmField(entity);
    const bindings = [];
    for (const column of columns) {
      bindings.push(column.dbValue(data, originalData) ?? null);
    }
    rows.push(bindings);
  }
  return rows;
}
