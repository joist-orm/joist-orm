import Knex, { QueryBuilder } from "knex";
import { JoinRow, ManyToManyCollection } from "../collections/ManyToManyCollection";
import {
  afterTransaction,
  beforeTransaction,
  buildQuery,
  deTagIds,
  Entity,
  EntityConstructor,
  entityLimit,
  EntityManager,
  EntityMetadata,
  FilterAndSettings,
  getMetadata,
  keyToNumber,
  keyToString,
  maybeResolveReferenceToId,
  OneToManyCollection,
  OneToOneReference,
} from "../index";
import { getOrSet, partition } from "../utils";
import { Driver } from "./driver";
import { whereFilterHash } from "../dataloaders/findDataLoader";
import { JoinRowTodo, Todo } from "../Todo";

export class PostgresDriver implements Driver {
  constructor(private knex: Knex) {}

  load<T extends Entity>(meta: EntityMetadata<T>, keys: readonly string[]): Promise<unknown[]> {
    return this.knex.select("*").from(meta.tableName).whereIn("id", keys);
  }

  loadManyToMany<T extends Entity, U extends Entity>(
    collection: ManyToManyCollection<T, U>,
    keys: readonly string[],
  ): Promise<JoinRow[]> {
    // Break out `column_id=string` keys out
    const columns: Record<string, string[]> = {};
    keys.forEach((key) => {
      const [columnId, id] = key.split("=");
      getOrSet(columns, columnId, []).push(id);
    });

    // Or together `where tag_id in (...)` and `book_id in (...)`
    let query = this.knex.select("*").from(collection.joinTableName);
    Object.entries(columns).forEach(([columnId, values]) => {
      // Pick the right meta i.e. tag_id --> TagMeta or book_id --> BookMeta
      const meta = collection.columnName == columnId ? getMetadata(collection.entity) : collection.otherMeta;
      query = query.orWhereIn(
        columnId,
        values.map((id) => keyToNumber(meta, id)!),
      );
    });

    return query.orderBy("id");
  }

  loadOneToMany<T extends Entity, U extends Entity>(
    collection: OneToManyCollection<T, U>,
    keys: readonly string[],
  ): Promise<U[]> {
    return this.knex
      .select("*")
      .from(collection.otherMeta.tableName)
      .whereIn(collection.otherColumnName, keys)
      .orderBy("id");
  }

  loadOneToOne<T extends Entity, U extends Entity>(
    reference: OneToOneReference<T, U>,
    keys: readonly string[],
  ): Promise<unknown[]> {
    return this.knex
      .select("*")
      .from(reference.otherMeta.tableName)
      .whereIn(reference.otherColumnName, keys)
      .orderBy("id");
  }

  async find<T extends Entity>(type: EntityConstructor<T>, queries: FilterAndSettings<T>[]): Promise<unknown[][]> {
    const { knex } = this;

    // If there is only 1 query, we can skip the tagging step.
    if (queries.length === 1) {
      return [ensureUnderLimit(await buildQuery(knex, type, queries[0]))];
    }

    // Map each incoming query[i] to itself or a previous dup
    const uniqueQueries: FilterAndSettings<T>[] = [];
    const queryToUnique: Record<number, number> = {};
    queries.forEach((q, i) => {
      let j = uniqueQueries.findIndex((uq) => whereFilterHash(uq) === whereFilterHash(q));
      if (j === -1) {
        uniqueQueries.push(q);
        j = uniqueQueries.length - 1;
      }
      queryToUnique[i] = j;
    });

    // There are duplicate queries, but only one unique query, so we can execute just it w/o tagging.
    if (uniqueQueries.length === 1) {
      const rows = ensureUnderLimit(await buildQuery(knex, type, queries[0]));
      // Reuse this same result for however many callers asked for it.
      return queries.map(() => rows);
    }

    // TODO: Instead of this tagged approach, we could probably check if the each
    // where cause: a) has the same structure for joins, and b) has conditions that
    // we can evaluate client-side, and then combine it into a query like:
    //
    // SELECT entity.*, t1.foo as condition1, t2.bar as condition2 FROM ...
    // WHERE t1.foo (union of each queries condition)
    //
    // And then use the `condition1` and `condition2` to tease the combined result set
    // back apart into each condition's result list.

    // For each query, add an additional `__tag` column that will identify that query's
    // corresponding rows in the combined/UNION ALL'd result set.
    //
    // We also add a `__row` column with that queries order, so that after we `UNION ALL`,
    // we can order by `__tag` + `__row` and ensure we're getting back the combined rows
    // exactly as they would be in done individually (i.e. per the docs `UNION ALL` does
    // not guarantee order).
    const tagged = uniqueQueries.map((queryAndSettings, i) => {
      const query = buildQuery(knex, type, queryAndSettings) as QueryBuilder;
      return query.select(knex.raw(`${i} as __tag`), knex.raw("row_number() over () as __row"));
    });

    const meta = getMetadata(type);

    // Kind of dumb, but make a dummy row to start our query with
    let query = knex
      .select("*", knex.raw("-1 as __tag"), knex.raw("-1 as __row"))
      .from(meta.tableName)
      .orderBy("__tag", "__row")
      .where({ id: -1 });

    // Use the dummy query as a base, then `UNION ALL` in all the rest
    tagged.forEach((add) => {
      query = query.unionAll(add, true);
    });

    // Issue a single SQL statement for all of them
    const rows = ensureUnderLimit(await query);

    const resultForUniques: any[][] = [];
    uniqueQueries.forEach((q, i) => {
      resultForUniques[i] = [];
    });
    rows.forEach((row: any) => {
      resultForUniques[row["__tag"]].push(row);
    });

    // We return an array-of-arrays, where result[i] is the rows for queries[i]
    const result: any[][] = [];
    queries.forEach((q, i) => {
      result[i] = resultForUniques[queryToUnique[i]];
    });
    return result;
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
              // The rows in EntityManager.joinRows point to entities, change those to integers
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

function ensureUnderLimit(rows: unknown[]): unknown[] {
  if (rows.length >= entityLimit) {
    throw new Error(`Query returned more than ${entityLimit} rows`);
  }
  return rows;
}
