import { Knex } from "knex";
import { whereFilterHash } from "../dataloaders/findDataLoader";
import {
  afterTransaction,
  beforeTransaction,
  buildQuery,
  deTagId,
  Entity,
  EntityConstructor,
  entityLimit,
  EntityManager,
  EntityMetadata,
  FilterAndSettings,
  getMetadata,
  hasSerde,
  keyToNumber,
  maybeResolveReferenceToId,
  OneToManyCollection,
  PrimitiveField,
  tagIds,
} from "../index";
import { ManyToManyCollection, OneToOneReferenceImpl } from "../relations";
import { JoinRow } from "../relations/ManyToManyCollection";
import { JoinRowTodo, Todo } from "../Todo";
import { getOrSet, partition, zeroTo } from "../utils";
import { Driver } from "./driver";
import { IdAssigner, SequenceIdAssigner } from "./IdAssigner";

export interface PostgresDriverOpts {
  idAssigner?: IdAssigner;
}

/**
 * Implements the `Driver` interface for Postgres.
 *
 * This is the canonical driver implementation and leverages several aspects of
 * Postgres for the best performance, i.e.:
 *
 * - Deferred foreign key constraints are used to allow bulk inserting/updating
 * all entities without any topographic sorting/ordering issues.
 *
 * - Sequences are used to bulk-assign + then bulk-insert all entities, to again
 * avoid issues with ordering issues (cannot bulk insert A w/o knowing the id of B).
 *
 * - We use a pg-specific bulk update syntax.
 */
export class PostgresDriver implements Driver {
  private readonly idAssigner: IdAssigner;

  constructor(private readonly knex: Knex, opts?: PostgresDriverOpts) {
    this.idAssigner = opts?.idAssigner ?? new SequenceIdAssigner();
  }

  load<T extends Entity>(
    em: EntityManager,
    meta: EntityMetadata<T>,
    untaggedIds: readonly string[],
  ): Promise<unknown[]> {
    const knex = this.getMaybeInTxnKnex(em);
    return knex.select("*").from(meta.tableName).whereIn("id", untaggedIds);
  }

  loadManyToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: ManyToManyCollection<T, U>,
    keys: readonly string[],
  ): Promise<JoinRow[]> {
    const knex = this.getMaybeInTxnKnex(em);

    // Break out `column_id=string` keys out
    const columns: Record<string, string[]> = {};
    keys.forEach((key) => {
      const [columnId, id] = key.split("=");
      getOrSet(columns, columnId, []).push(id);
    });

    // Or together `where tag_id in (...)` or `book_id in (...)`
    let query = knex.select("*").from(collection.joinTableName);
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

  findManyToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: ManyToManyCollection<T, U>,
    keys: readonly string[],
  ): Promise<JoinRow[]> {
    const knex = this.getMaybeInTxnKnex(em);

    // Or together `where (tag_id = X and book_id = Y)` or `(book_id = B and tag_id = A)`
    let query = knex.select("*").from(collection.joinTableName);
    keys.forEach((key) => {
      const [one, two] = key.split(",");
      const [columnOne, idOne] = one.split("=");
      const [columnTwo, idTwo] = two.split("=");
      const [meta1, meta2] =
        collection.columnName === columnOne
          ? [collection.meta, collection.otherMeta]
          : [collection.otherMeta, collection.meta];
      // Pick the right meta i.e. tag_id --> TagMeta or book_id --> BookMeta
      query = query.orWhere((q) => {
        q.where(columnOne, keyToNumber(meta1, idOne)).andWhere(columnTwo, keyToNumber(meta2, idTwo));
      });
    });

    return query.orderBy("id");
  }

  loadOneToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: OneToManyCollection<T, U>,
    untaggedIds: readonly string[],
  ): Promise<U[]> {
    const knex = this.getMaybeInTxnKnex(em);
    return knex
      .select("*")
      .from(collection.otherMeta.tableName)
      .whereIn(collection.otherColumnName, untaggedIds)
      .orderBy("id");
  }

  findOneToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: OneToManyCollection<T, U>,
    keys: readonly string[],
  ): Promise<U[]> {
    const knex = this.getMaybeInTxnKnex(em);
    let query = knex.select("*").from(collection.otherMeta.tableName);
    // Or together `where (id = X and book_id = Y)`
    keys.forEach((key) => {
      const [one, two] = key.split(",");
      // columnOne is the `id=`, so is really the "other" side of the o2m
      const [columnOne, idOne] = one.split("=");
      const [columnTwo, idTwo] = two.split("=");
      const [meta1, meta2] = [collection.otherMeta, collection.meta];
      // Pick the right meta i.e. tag_id --> TagMeta or book_id --> BookMeta
      query = query.orWhere((q) => {
        q.where(columnOne, keyToNumber(meta1, idOne)).andWhere(columnTwo, keyToNumber(meta2, idTwo));
      });
    });
    return query.orderBy("id");
  }

  loadOneToOne<T extends Entity, U extends Entity>(
    em: EntityManager,
    reference: OneToOneReferenceImpl<T, U>,
    untaggedIds: readonly string[],
  ): Promise<unknown[]> {
    const knex = this.getMaybeInTxnKnex(em);
    return knex
      .select("*")
      .from(reference.otherMeta.tableName)
      .whereIn(reference.otherColumnName, untaggedIds)
      .orderBy("id");
  }

  async find<T extends Entity>(
    em: EntityManager,
    type: EntityConstructor<T>,
    queries: FilterAndSettings<T>[],
  ): Promise<unknown[][]> {
    const knex = this.getMaybeInTxnKnex(em);

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
      const query = buildQuery(knex, type, queryAndSettings) as Knex.QueryBuilder;
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
    const knex = this.getMaybeInTxnKnex(em);
    const alreadyInTxn = "commit" in knex;
    if (alreadyInTxn) {
      return fn(knex as Knex.Transaction);
    }
    return await knex.transaction(async (txn) => {
      em.currentTxnKnex = txn;
      try {
        if (isolationLevel) {
          await txn.raw("set transaction isolation level serializable;");
        }
        await beforeTransaction(em, txn);
        const result = await fn(txn);
        await afterTransaction(em, txn);
        return result;
      } finally {
        em.currentTxnKnex = undefined;
      }
    });
  }

  async flushEntities(em: EntityManager, todos: Record<string, Todo>): Promise<void> {
    const knex = this.getMaybeInTxnKnex(em);
    const now = new Date();
    await this.idAssigner.assignNewIds(knex, todos);
    for await (const todo of Object.values(todos)) {
      if (todo) {
        const meta = todo.metadata;
        if (todo.inserts.length > 0) {
          await batchInsert(knex, meta, todo.inserts);
        }
        if (todo.updates.length > 0) {
          const { updatedAt } = todo.metadata.timestampFields;
          if (updatedAt) {
            todo.updates.forEach((e) => {
              // Should we just go through a setter?
              e.__orm.originalData[updatedAt] = e.__orm.data[updatedAt];
              e.__orm.data[updatedAt] = now;
            });
            await batchUpdate(knex, meta, todo.updates);
          } else {
            await batchUpdateWithoutUpdatedAt(knex, meta, todo.updates);
          }
        }
        if (todo.deletes.length > 0) {
          await batchDelete(knex, meta, todo.deletes);
        }
      }
    }
  }

  async flushJoinTables(em: EntityManager, joinRows: Record<string, JoinRowTodo>): Promise<void> {
    const knex = this.getMaybeInTxnKnex(em);
    for await (const [joinTableName, { m2m, newRows, deletedRows }] of Object.entries(joinRows)) {
      if (newRows.length > 0) {
        const sql = cleanSql(`
          INSERT INTO ${joinTableName} (${m2m.columnName}, ${m2m.otherColumnName})
          VALUES ${zeroTo(newRows.length)
            .map(() => "(?, ?) ")
            .join(", ")}
          ON CONFLICT (${m2m.columnName}, ${m2m.otherColumnName}) DO UPDATE SET id = ${joinTableName}.id
          RETURNING id;
        `);
        const meta1 = getMetadata(m2m.entity);
        const meta2 = m2m.otherMeta;
        const bindings = newRows.flatMap((row) => {
          return [
            keyToNumber(meta1, maybeResolveReferenceToId(row[m2m.columnName]))!,
            keyToNumber(meta2, maybeResolveReferenceToId(row[m2m.otherColumnName]))!,
          ];
        });
        const { rows } = await knex.raw(sql, bindings);
        for (let i = 0; i < rows.length; i++) {
          newRows[i].id = rows[i].id;
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
                deTagId(m2m.meta, maybeResolveReferenceToId(e[m2m.columnName])!),
                deTagId(m2m.otherMeta, maybeResolveReferenceToId(e[m2m.otherColumnName])!),
              ] as any,
          );
          await knex(joinTableName).del().whereIn([m2m.columnName, m2m.otherColumnName], data);
        }
      }
    }
  }

  private getMaybeInTxnKnex(em: EntityManager): Knex {
    return em.currentTxnKnex || this.knex;
  }
}

async function batchInsert(knex: Knex, meta: EntityMetadata<any>, entities: Entity[]): Promise<void> {
  // We don't use the ids that come back from batchInsert b/c we pre-assign ids for both inserts and updates.
  // We also use `.transacting` b/c even when `knex` is already a Transaction object,
  // `batchInsert` w/o the `transacting` adds savepoints that we don't want/need.
  const fields = Object.values(meta.fields).filter(hasSerde);
  const columns = fields.flatMap((f) => f.serde.columns);

  // Issue 1 UPDATE statement with N `VALUES (..., ...), (..., ...), ...` clauses
  // and bindings is each individual value.
  const bindings = entities.flatMap((entity) => columns.map((c) => c.dbValue(entity.__orm.data) ?? null));
  const sql = `
    INSERT INTO "${meta.tableName}" (${columns.map((c) => `"${c.columnName}"`).join(", ")})
    VALUES ${entities.map(() => `(${columns.map(() => `?`).join(", ")})`).join(",")}
  `;

  await knex.raw(cleanSql(sql), bindings);
}

// Uses a pg-specific syntax to issue a bulk update
async function batchUpdate(knex: Knex, meta: EntityMetadata<any>, entities: Entity[]): Promise<void> {
  const { updatedAt } = meta.timestampFields;
  if (!updatedAt) throw new Error("This batchUpdate expects updatedAt");
  // Get the unique set of fields that are changed across all the entities (of this type) we want to bulk update
  const changedFields = new Set<string>(["id", updatedAt]);
  entities.forEach((entity) => {
    Object.keys(entity.__orm.originalData).forEach((key) => changedFields.add(key));
  });

  // Sometimes with derived fields, an instance will be marked as an update, but if the derived field hasn't changed,
  // it'll be a noop, so just short-circuit if it looks like that happened, i.e. we have no changed fields.
  // (unless one of the entities was `EntityManager.touch`-d, which seems force the save / updatedAt tick.)
  if (changedFields.size === 2 && !entities.some((e) => e.__orm.isTouched)) {
    return;
  }

  const fields = Object.values(meta.fields)
    .filter((f) => changedFields.has(f.fieldName))
    .filter(hasSerde);
  const columns = fields.flatMap((f) => f.serde.columns);
  const updatedAtField = (meta.fields[updatedAt] as PrimitiveField).serde.columns[0].columnName;

  // Issue 1 UPDATE statement with N `VALUES (..., ...), (..., ...), ...` clauses
  // and bindings is each individual value.
  const bindings = entities.flatMap((entity) => [
    ...columns.map((c) => c.dbValue(entity.__orm.data) ?? null),
    entity.__orm.originalData[updatedAt],
  ]);

  const sql = `
      UPDATE "${meta.tableName}"
      SET ${columns
        .filter((c) => c.columnName !== "id")
        .map((c) => `"${c.columnName}" = data."${c.columnName}"`)
        .join(", ")}
      FROM (
        VALUES ${entities.map(() => `(${columns.map((c) => `?::${c.dbType}`).join(", ")}, ?::timestamptz)`).join(",")}
      ) AS data (${columns.map((c) => `"${c.columnName}"`).join(", ")}, original_updated_at)
      WHERE
        "${meta.tableName}".id = data.id
        AND date_trunc('milliseconds', "${meta.tableName}".${updatedAtField}) = data.original_updated_at
      RETURNING "${meta.tableName}".id
   `;

  const result = await knex.raw(cleanSql(sql), bindings);
  if (result.rows.length !== entities.length) {
    const updated = new Set(result.rows.map((r: any) => r.id));
    const missing = entities.map((e) => e.idOrFail).filter((id) => !updated.has(id));
    throw new Error(`Oplock failure for ${tagIds(meta, missing).join(", ")}`);
  }
}

async function batchUpdateWithoutUpdatedAt(knex: Knex, meta: EntityMetadata<any>, entities: Entity[]): Promise<void> {
  // Get the unique set of fields that are changed across all of the entities (of this type) we want to bulk update
  const changedFields = new Set<string>(["id"]);
  entities.forEach((entity) => {
    Object.keys(entity.__orm.originalData).forEach((key) => changedFields.add(key));
  });

  // Sometimes with derived fields, an instance will be marked as an update, but if the derived field hasn't changed,
  // it'll be a noop, so just short-circuit if it looks like that happened, i.e. we have no changed fields.
  // (unless one of the entities was `EntityManager.touch`-d, which seems force the save / updatedAt tick.)
  if (changedFields.size === 1 && !entities.some((e) => e.__orm.isTouched)) {
    return;
  }

  const fields = Object.values(meta.fields)
    .filter((f) => changedFields.has(f.fieldName))
    .filter(hasSerde);
  const columns = fields.flatMap((f) => f.serde.columns);

  // Issue 1 UPDATE statement with N `VALUES (..., ...), (..., ...), ...` clauses
  // and bindings is each individual value.
  const bindings = entities.flatMap((entity) => columns.map((c) => c.dbValue(entity.__orm.data) ?? null));
  const sql = `
    UPDATE "${meta.tableName}"
    SET ${columns
      .filter((c) => c.columnName !== "id")
      .map((c) => `"${c.columnName}" = data."${c.columnName}"`)
      .join(", ")}
    FROM (
        VALUES ${entities.map(() => `(${columns.map((c) => `?::${c.dbType}`).join(", ")})`).join(", ")}
        ) AS data (${columns.map((c) => `"${c.columnName}"`).join(", ")})
    WHERE
        "${meta.tableName}".id = data.id
        RETURNING "${meta.tableName}".id
  `;
  await knex.raw(cleanSql(sql), bindings);
}

async function batchDelete(knex: Knex, meta: EntityMetadata<any>, entities: Entity[]): Promise<void> {
  await knex(meta.tableName)
    .del()
    .whereIn(
      "id",
      entities.map((e) => keyToNumber(meta, e.idTagged!).toString()),
    );
  entities.forEach((entity) => (entity.__orm.deleted = "deleted"));
}

/** Strips new lines/indentation from our `UPDATE` string; doesn't do any actual SQL param escaping/etc. */
function cleanSql(sql: string): string {
  return sql.trim().replace(/\n/g, "").replace(/  +/g, " ");
}

function ensureUnderLimit(rows: unknown[]): unknown[] {
  if (rows.length >= entityLimit) {
    throw new Error(`Query returned more than ${entityLimit} rows`);
  }
  return rows;
}
