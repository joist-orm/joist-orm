import { Entity, EntityMetadata } from "./EntityManager";
import Knex from "knex";
import { keyToNumber, keyToString, maybeResolveReferenceToId } from "./serde";
import { JoinRow } from "./collections/ManyToManyCollection";

interface Todo {
  metadata: EntityMetadata<any>;
  inserts: Entity[];
  updates: Entity[];
}

export async function flushEntities(knex: Knex, entities: Entity[]): Promise<void> {
  const todos = sortEntities(entities);
  for await (const todo of todos) {
    if (todo) {
      const meta = todo.metadata;
      if (todo.inserts.length > 0) {
        await batchInsert(knex, meta, todo.inserts);
      }
      if (todo.updates.length > 0) {
        await batchUpdate(knex, meta, todo.updates);
      }
    }
  }
}

async function batchInsert(knex: Knex, meta: EntityMetadata<any>, entities: Entity[]): Promise<void> {
  const rows = entities.map(entity => {
    const row = {};
    meta.columns.forEach(c => c.serde.setOnRow(entity.__orm.data, row));
    return row;
  });
  const ids = await knex.batchInsert(meta.tableName, rows).returning("id");
  for (let i = 0; i < entities.length; i++) {
    entities[i].__orm.data["id"] = keyToString(ids[i]);
    entities[i].__orm.dirty = false;
  }
  console.log("Inserted", ids);
}

// Uses a pg-specific syntax to issue a bulk update
async function batchUpdate(knex: Knex, meta: EntityMetadata<any>, entities: Entity[]): Promise<void> {
  // This currently assumes a 1-to-1 field-to-column mapping.
  const bindings: any[][] = meta.columns.map(() => []);
  for (const entity of entities) {
    meta.columns.forEach((c, i) => {
      bindings[i].push(c.serde.getFromEntity(entity.__orm.data));
    });
  }
  await knex.raw(
    cleanSql(`
      UPDATE ${meta.tableName}
      SET ${meta.columns.map(c => `${c.columnName} = data.${c.columnName}`).join(", ")}
      FROM (select ${meta.columns.map(c => `unnest(?::${c.dbType}[]) as ${c.columnName}`).join(", ")}) as data
      WHERE ${meta.tableName}.id = data.id
   `),
    bindings,
  );
  entities.forEach(entity => (entity.__orm.dirty = false));
}

function cleanSql(sql: string): string {
  return sql
    .trim()
    .replace(/\n/g, "")
    .replace(/  +/g, " ");
}

/**
 * Scans `entities` for new/updated entities and arranges them per-type in entity order.
 *
 * This currently assumes the entity types in the schema can be topographically sorted
 * and have no cycles, i.e. `books` always depend on `authors` (due to the `books.author_id`
 * foreign key), but `authors` never (via a required foreign key) depend on `books`.
 */
function sortEntities(entities: Entity[]): Todo[] {
  const todos: Todo[] = [];
  for (const entity of entities) {
    const order = entity.__orm.metadata.order;
    const isNew = entity.id === undefined;
    const isDirty = !isNew && entity.__orm.dirty;
    if (isNew || isDirty) {
      let todo = todos[order];
      if (!todo) {
        todo = { metadata: entity.__orm.metadata, inserts: [], updates: [] };
        todos[order] = todo;
      }
      if (isNew) {
        todo.inserts.push(entity);
      } else {
        todo.updates.push(entity);
      }
    }
  }
  return todos;
}

export async function flushJoinTables(knex: Knex, joinRows: Record<string, JoinRow[]>): Promise<void> {
  for await (const [joinTableName, rows] of Object.entries(joinRows)) {
    const newRows = rows.filter(r => r.id === undefined);
    const ids = await knex
      .batchInsert(
        joinTableName,
        newRows.map(row => {
          // The rows in EntityManager.joinRows point to entities, change those to ints
          const { id, created_at, ...fkColumns } = row;
          Object.keys(fkColumns).forEach(key => {
            fkColumns[key] = keyToNumber(maybeResolveReferenceToId(fkColumns[key]));
          });
          return fkColumns;
        }),
      )
      .returning("id");
    for (let i = 0; i < ids.length; i++) {
      newRows[i].id = ids[i];
    }
  }
}
