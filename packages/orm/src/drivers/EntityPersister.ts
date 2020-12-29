import DataLoader from "dataloader";
import Knex from "knex";
import { JoinRow, ManyToManyCollection } from "../collections/ManyToManyCollection";
import {
  afterTransaction,
  beforeTransaction,
  deTagIds,
  Entity,
  EntityConstructor,
  EntityManager,
  EntityMetadata,
  FilterOf,
  getMetadata,
  keyToNumber,
  keyToString,
  maybeResolveReferenceToId,
  OneToManyCollection,
  OneToOneReference,
  OrderOf,
} from "../index";
import { partition } from "../utils";
import { Driver } from "./driver";
import { findDataLoader } from "../dataloaders/findDataLoader";
import { manyToManyDataLoader } from "../dataloaders/manyToManyDataLoader";
import { loadDataLoader } from "../dataloaders/loadDataLoader";
import { oneToManyDataLoader } from "../dataloaders/oneToManyDataLoader";
import { oneToOneDataLoader } from "../dataloaders/oneToOneDataLoader";

/** The operations for a given entity type, so they can be executed in bulk. */
export interface Todo {
  metadata: EntityMetadata<any>;
  inserts: Entity[];
  updates: Entity[];
  deletes: Entity[];
  validates: Entity[];
}

export type LoaderCache = Record<string, DataLoader<any, any>>;

export class EntityPersister implements Driver {
  private loadLoaders: LoaderCache = {};
  private findLoaders: LoaderCache = {};

  constructor(private knex: Knex) {}

  resetDataLoaderCache() {
    this.loadLoaders = {};
    this.findLoaders = {};
  }

  load<T extends Entity>(em: EntityManager, meta: EntityMetadata<T>, id: string): Promise<T | undefined> {
    return loadDataLoader(em, this.knex, this.loadLoaders, meta).load(id);
  }

  loadManyToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: ManyToManyCollection<T, U>,
  ): Promise<U[]> {
    const { columnName, entity } = collection;
    const key = `${columnName}=${entity.id}`;
    return manyToManyDataLoader(this.knex, this.loadLoaders, collection).load(key);
  }

  loadOneToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: OneToManyCollection<T, U>,
  ): Promise<U[]> {
    return oneToManyDataLoader(this.knex, this.loadLoaders, collection).load(collection.entity.id!);
  }

  async loadOneToOne<T extends Entity, U extends Entity>(
    em: EntityManager,
    reference: OneToOneReference<T, U>,
  ): Promise<U | undefined> {
    return (await oneToOneDataLoader(this.knex, this.loadLoaders, reference).load(reference.entity.idOrFail))[0];
  }

  find<T extends Entity>(
    em: EntityManager,
    type: EntityConstructor<T>,
    where: FilterOf<T>,
    options?: { orderBy?: OrderOf<T>; limit?: number; offset?: number },
  ): Promise<unknown[]> {
    return findDataLoader(this.knex, this.findLoaders, type).load({ where, ...options });
  }

  async transaction<T>(
    em: EntityManager,
    fn: (txn: Knex.Transaction) => Promise<T>,
    isolationLevel?: "serializable",
  ): Promise<T> {
    const alreadyInTxn = "commit" in this.knex;
    if (alreadyInTxn) {
      return fn(this.knex as Knex.Transaction);
    }
    const originalKnex = this.knex;
    const txn = await this.knex.transaction();
    this.knex = txn;
    try {
      if (isolationLevel) {
        await txn.raw("set transaction isolation level serializable;");
      }
      await beforeTransaction(em, txn);
      const result = await fn(txn);
      await txn.commit();
      await afterTransaction(em, txn);
      return result;
    } finally {
      if (!txn.isCompleted()) {
        txn.rollback().catch((e) => {
          console.error(e, "Error rolling back");
        });
      }
      this.knex = originalKnex;
    }
  }

  async flushEntities(todos: Record<string, Todo>): Promise<void> {
    const { knex } = this;
    const updatedAt = new Date();
    await assignNewIds(knex, todos);
    for await (const todo of Object.values(todos)) {
      if (todo) {
        const meta = todo.metadata;
        if (todo.inserts.length > 0) {
          await batchInsert(knex, meta, todo.inserts);
        }
        if (todo.updates.length > 0) {
          todo.updates.forEach((e) => (e.__orm.data["updatedAt"] = updatedAt));
          await batchUpdate(knex, meta, todo.updates);
        }
        if (todo.deletes.length > 0) {
          await batchDelete(knex, meta, todo.deletes);
        }
      }
    }
  }

  async flushJoinTables(joinRows: Record<string, JoinRowTodo>): Promise<void> {
    const { knex } = this;
    for await (const [joinTableName, { m2m, newRows, deletedRows }] of Object.entries(joinRows)) {
      if (newRows.length > 0) {
        const ids = await knex
          .batchInsert(
            joinTableName,
            newRows.map((row) => {
              // The rows in EntityManager.joinRows point to entities, change those to ints
              const { id, created_at, m2m, ...fkColumns } = row;
              Object.keys(fkColumns).forEach((key) => {
                const meta = key == m2m.columnName ? getMetadata(m2m.entity) : m2m.otherMeta;
                fkColumns[key] = keyToNumber(meta, maybeResolveReferenceToId(fkColumns[key]));
              });
              return fkColumns;
            }),
          )
          .returning("id");
        for (let i = 0; i < ids.length; i++) {
          newRows[i].id = ids[i];
        }
      }
      if (deletedRows.length > 0) {
        // `remove`s that were done against unloaded ManyToManyCollections will not have row ids
        const [haveIds, noIds] = partition(deletedRows, (r) => r.id !== -1);

        if (haveIds.length > 0) {
          await knex(joinTableName)
            .del()
            .whereIn(
              "id",
              haveIds.map((e) => e.id!),
            );
        }

        if (noIds.length > 0) {
          const data = noIds.map(
            (e) =>
              [
                deTagIds(m2m.meta, [maybeResolveReferenceToId(e[m2m.columnName])!])[0],
                deTagIds(m2m.otherMeta, [maybeResolveReferenceToId(e[m2m.otherColumnName])!])[0],
              ] as any,
          );
          await knex(joinTableName).del().whereIn([m2m.columnName, m2m.otherColumnName], data);
        }
      }
    }
  }
}

/**
 * Assigns all new entities an id directly from their corresponding sequence generator, instead of via INSERTs.
 *
 * This lets us avoid cyclic issues with some INSERTs having foreign keys to other rows that themselves
 * need to first be INSERTed.
 */
async function assignNewIds(knex: Knex, todos: Record<string, Todo>): Promise<void> {
  const seqStatements: string[] = [];
  Object.values(todos).forEach((todo) => {
    if (todo.inserts.length > 0) {
      const meta = todo.inserts[0].__orm.metadata;
      const sequenceName = `${meta.tableName}_id_seq`;
      const sql = `select nextval('${sequenceName}') from generate_series(1, ${todo.inserts.length})`;
      seqStatements.push(sql);
    }
  });
  if (seqStatements.length > 0) {
    // There will be 1 per table; 1 single insert should be fine but we might need to batch for super-large schemas?
    const sql = seqStatements.join(" UNION ALL ");
    const result = await knex.raw(sql);
    let i = 0;
    Object.values(todos).forEach((todo) => {
      for (const insert of todo.inserts) {
        insert.__orm.data["id"] = keyToString(todo.metadata, result.rows![i++]["nextval"]);
      }
    });
  }
}

async function batchInsert(knex: Knex, meta: EntityMetadata<any>, entities: Entity[]): Promise<void> {
  const rows = entities.map((entity) => {
    const row = {};
    meta.columns.forEach((c) => c.serde.setOnRow(entity.__orm.data, row));
    return row;
  });
  // We don't use the ids that come back from batchInsert b/c we pre-assign ids for both inserts and updates.
  // We also use `.transacting` b/c even when `knex` is already a Transaction object,
  // `batchInsert` w/o the `transacting` adds savepoints that we don't want/need.
  await knex.batchInsert(meta.tableName, rows).transacting(knex as any);
  for (let i = 0; i < entities.length; i++) {
    entities[i].__orm.originalData = {};
  }
}

// Uses a pg-specific syntax to issue a bulk update
async function batchUpdate(knex: Knex, meta: EntityMetadata<any>, entities: Entity[]): Promise<void> {
  // Get the unique set of fields that are changed across all of the entities (of this type) we want to bulk update
  const changedFields = new Set<string>();
  // Id doesn't change, but we need it for our WHERE clause
  changedFields.add("id");
  entities.forEach((entity) => {
    Object.keys(entity.__orm.originalData).forEach((key) => changedFields.add(key));
  });

  // Sometimes with derived fields, an instance will be marked as an update, but if the derived field hasn't changed,
  // it'll be a noop, so just short-circuit if it looks like that happened, i.e. we have no changed fields.
  if (changedFields.size === 1) {
    return;
  }

  // This currently assumes a 1-to-1 field-to-column mapping.
  const columns = meta.columns.filter((c) => changedFields.has(c.fieldName));
  const bindings: any[][] = columns.map(() => []);
  for (const entity of entities) {
    columns.forEach((c, i) => {
      bindings[i].push(c.serde.getFromEntity(entity.__orm.data) ?? null);
    });
  }
  await knex.raw(
    cleanSql(`
      UPDATE ${meta.tableName}
      SET ${columns
        .filter((c) => c.columnName !== "id")
        .map((c) => `"${c.columnName}" = data."${c.columnName}"`)
        .join(", ")}
      FROM (select ${columns.map((c) => `unnest(?::${c.dbType}[]) as "${c.columnName}"`).join(", ")}) as data
      WHERE ${meta.tableName}.id = data.id
   `),
    bindings,
  );
  entities.forEach((entity) => (entity.__orm.originalData = {}));
}

async function batchDelete(knex: Knex, meta: EntityMetadata<any>, entities: Entity[]): Promise<void> {
  await knex(meta.tableName)
    .del()
    .whereIn(
      "id",
      entities.map((e) => keyToNumber(meta, e.id!).toString()),
    );
  entities.forEach((entity) => (entity.__orm.deleted = "deleted"));
}

function cleanSql(sql: string): string {
  return sql.trim().replace(/\n/g, "").replace(/  +/g, " ");
}

/**
 * Scans `entities` for new/updated entities and arranges them per-type in entity order.
 *
 * This currently assumes the entity types in the schema can be topographically sorted
 * and have no cycles, i.e. `books` always depend on `authors` (due to the `books.author_id`
 * foreign key), but `authors` never (via a required foreign key) depend on `books`.
 */
export function sortEntities(entities: Entity[]): Record<string, Todo> {
  const todos: Record<string, Todo> = {};
  for (const entity of entities) {
    if (entity.isPendingFlush) {
      const todo = getTodo(todos, entity);
      if (entity.isPendingDelete) {
        todo.deletes.push(entity);
      } else if (entity.isNewEntity) {
        todo.inserts.push(entity);
      } else {
        todo.updates.push(entity);
      }
    }
  }
  return todos;
}

/** getOrSets a `Todo` for `entity` in `todos`. */
export function getTodo(todos: Record<string, Todo>, entity: Entity): Todo {
  const meta = getMetadata(entity);
  let todo = todos[meta.type];
  if (!todo) {
    todo = { metadata: entity.__orm.metadata, inserts: [], updates: [], deletes: [], validates: [] };
    todos[meta.type] = todo;
  }
  return todo;
}

export interface JoinRowTodo {
  // Store the m2m reference (either side of the m2m, it doesn't matter which) to help tag/untag the foreign keys
  m2m: ManyToManyCollection<any, any>;
  newRows: JoinRow[];
  deletedRows: JoinRow[];
}

export function sortJoinRows(joinRows: Record<string, JoinRow[]>): Record<string, JoinRowTodo> {
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
