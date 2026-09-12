---
title: SQL Mutations
description: Documentation for immediate SQL mutations with em.execute
sidebar:
  order: 3.3
---

`em.execute` runs immediate SQL `INSERT`, `UPDATE`, and `DELETE` statements, outside the entity [unit of work](/advanced/unit-of-work/). Statements are reusable POJOs with exactly one operation key:

```ts
const b = table(Book);

const insert = {
  insert: b,
  values: { title: "Imported Book", author_id: "a:1", notes: "Imported without hooks" },
  returning: { id: b.id, title: b.title },
} satisfies InsertStatement<Book>;
const inserted = await em.execute(insert);
// inserted.rows: { id: BookId; title: string }[]

const updated = await em.execute({
  update: b,
  set: { order: sql<number>`${b.order} + ${1}` },
  where: b.id.eq("b:1"),
  returning: b.order,
});
// updated.rows: number[]

const deleted = await em.execute({ delete: b, where: b.id.eq("b:1") });
// deleted.rows: never[] (always []); deleted.rowCount is the affected count
```

These are independent examples, assuming Author `a:1` and Book `b:1` are already persisted. Use `satisfies` to retain literal result types; exported types include `InsertStatement<T>`, `UpdateStatement<T>`, `DeleteStatement<T>`, their union `MutationStatement<T>`, `InsertValues<T>`, `UpdateValues<T>`, and `ExecuteResult<R>`.

## Results and driver support

Every call returns `{ rowCount: number; rows: R[] }`. `rowCount` is the database's top-level command count, **not `rows.length`**: affected rows for mutations, selected rows for reads. Without `returning`, `rows` is empty even when rows were changed.

`returning` accepts a named POJO of expressions or one scalar expression. It reuses read decoding, including the configured public ID type (tagged, untagged, or numeric), enums, custom serdes, JSON/Zod, dates, Temporal values, and nullability. It never hydrates entities or registers returned IDs in the identity map; `returning: b` is not supported.

`em.execute` also accepts the same read inputs as [`em.query`](/features/queries-raw/), with the same decoding and restrictions, but wraps the rows in `ExecuteResult<R>`. Ordinary entity reads still hydrate entities. An inline scalar read such as `em.execute({ from: b, select: b.id })` is supported; a scalar `query({ from: b, select: b.id })` value is an expression, not an executable statement.

`PostgresDriver` supplies native PostgreSQL counts and uses the active transaction or the pool without starting a hidden transaction. The incomplete `BunPgDriver.executeQuery` throws before SQL; both `em.query` and nonempty `em.execute` are unsupported by that driver.

## Values and insert sources

`values` accepts one column POJO or an array. Use physical column names (`author_id`, not `author`; `first_name`, not `firstName`) in both `values` and UPDATE `set`. Values remain domain values encoded by the existing write codecs, or typed SQL expressions. Owning FK columns accept the correct ID type or a persisted entity, not nested creation options or new/unflushed entities, even with preassigned IDs. ID-only references rely on database FK checks. Use `table`/`tables` for all SQL statements; `alias`/`aliases` are only for `em.find`.

- Missing or `undefined` INSERT fields use SQL defaults, including per-row `DEFAULT` cells in bulk inserts. Missing/`undefined` UPDATE fields leave columns unchanged.
- Explicit `null` means SQL `NULL`, checked against physical nullability before codecs run. For a stored JSON `null`, use a suitably typed expression such as `` sql<object>`'null'::jsonb` `` instead.
- Explicit SQL defaults use expressions such as `` sql<string>`DEFAULT` ``. PostgreSQL validates supplied expressions/defaults; Joist does not apply entity configuration defaults.
- A standalone `values: []` checks statement validity and write permissions, then returns `{ rowCount: 0, rows: [] }` without SQL or requiring driver count support. This shortcut is only for standalone execution, not CTE composition. `values: {}`, any row with no defined fields, and an empty/pruned UPDATE `set` fail; none means `DEFAULT VALUES`.

Required columns must appear in every VALUES row or INSERT source projection. In this schema, Book requires `title`, `author_id`, and `notes`, despite ORM defaults for the latter two; Author requires `first_name` and the derived `number_of_books`.

Generated `BookColumns`/`AuthorColumns` and `ColumnsOf<T>` supply physical keys, value types, nullability, and insert/update policies for SQL inputs. They are separate from domain `BookFields`/`AuthorFields` and `OptsOf<T>`: entity defaults and setters do not define SQL requiredness. `TypeMap.columnsType` connects these types to the entity, and runtime `EntityMetadata.columns` maps physical keys to their owning domain fields and existing serde columns. See [Tables and generated columns](/features/queries-raw/#tables-and-generated-columns) for the read-side split, relationship sugar, and entity hydration.

Run codegen before using mutations. Each entry in the existing `FieldSerde.columns` array carries physical `sqlNullable`, `hasDefault`, and `isGenerated` facts. Generated metadata passes these facts as the final serde constructor argument. Built-in single-column serdes initialize the properties on their existing column (`this`), without replacing column objects or codecs. Mutation checks do not infer these facts from entity requirements or codec defaults. Older custom columns remain valid for reads, but mutations fail clearly when physical facts are missing.

The examples omit timestamps according to Joist's existing `createdAt`/`updatedAt` configuration and column-name convention. Codegen does not inspect trigger bodies or certify that a trigger will supply them, and there is no new public provider override. If your database has no timestamp default or trigger, supply those values explicitly; PostgreSQL enforces its actual constraints. Conventional numeric primary keys are optional on INSERT; UUID/text primary keys without a SQL default remain required. Joist does not infer `ALWAYS` versus `BY DEFAULT` identity policy, so PostgreSQL also enforces restrictions on explicit IDs. Ordinary persisted derived fields are writable for imports/backfills. Database-generated expression columns are omit-only, even for explicit `DEFAULT`; UPDATE primary keys are forbidden.

For `INSERT SELECT`, use `from` **instead of** `values`, with a named-POJO read or its `query()` value:

```ts
const source = table(Book);
await em.execute({
  insert: b,
  from: {
    from: source,
    where: source.id.eq("b:1"),
    select: { title: source.title, author_id: source.author_id, notes: source.notes },
  },
  returning: { id: b.id },
});
```

INSERT SELECT output keys must match target physical column names regardless of object key order; they must include required columns and have compatible storage codecs, domains, IDs, and nullability. Ordinary read and RETURNING output keys remain freely chosen, i.e. `returning: { authorId: b.author_id }`; only an INSERT source must name its target columns. Scalar/entity sources and unknown target keys are rejected. Compatible [compound reads](/features/queries-raw/#set-operations) work too, preserving `unionAll` duplicates, ordering, and pagination. The source stays entirely in SQL, with no JavaScript decode/re-encode round trip.

INSERT SELECT sources can copy compatible custom-mapped arrays and Temporal arrays directly in SQL, with the same [codec compatibility requirements as compound reads](/features/queries-raw/#output-compatibility-and-codecs). Physical enum-table arrays and custom numeric arrays are unsupported INSERT SELECT outputs; bound VALUES and UPDATE assignments remain supported. For explicit annotations of joined or compound sources, use `InsertStatement<T, Returning, typeof source>` to retain the source's concrete output and join types.

## CTEs

`with` hoists `query(...)` values into a `WITH` before the statement, the same clause [`em.query`](/features/queries-raw/#ctes-with) takes. The CTE is in scope for the whole statement: an `UPDATE`/`DELETE` `where`, an `INSERT`'s `SELECT` source, a `VALUES` cell, and `returning`.

```ts
const bookAuthors = query({ from: b, select: { authorId: b.author_id }, as: "book_authors" });

await em.execute({
  update: a,
  with: bookAuthors,
  set: { first_name: "writer" },
  where: a.id.in(query({ from: bookAuthors, select: bookAuthors.authorId })),
});
```

```sql
WITH book_authors AS (SELECT b.author_id AS "authorId" FROM books AS b WHERE b.deleted_at IS NULL)
UPDATE authors AS a SET first_name = $1
WHERE (a.id IN (SELECT book_authors."authorId" AS value FROM book_authors))
```

A CTE the statement never reads is pruned, as on a read query. The CTE scope deliberately sits *above* the target, so a `VALUES` cell or an `INSERT ... SELECT` source can read the CTEs without also seeing the row being written.


## Guards and expressions

UPDATE and DELETE require a user `where` that survives [condition pruning](/features/queries-raw/#condition--join-pruning), unless `allowAll: true` is explicit. An absent or fully pruned guard fails before SQL; injected soft-delete filters do not count as consent. This is not general tautology detection. `allowAll` neither removes an existing predicate nor disables soft-delete filtering.

Both default to `softDeletes: "exclude"`; use `"include"` to reach soft-deleted rows. **DELETE physically deletes rows**, rather than setting `deleted_at`. Database constraints, triggers, and database-defined cascades still apply.

The target table is in scope for UPDATE `set`, mutation predicates, and `returning`. Existing read subqueries work in expressions, without adding mutation joins. INSERT VALUES cannot directly read target columns because no existing row exists; its scalar subqueries have their own sources. An INSERT SELECT source has an independent scope from target `returning`.

## Transactions and entity state

:::caution[Immediate SQL is not an entity write]

Mutations do not run entity hooks, validation rules, configuration defaults, reactions, ORM timestamp maintenance, or [optimistic locking](/advanced/optimistic-locking/). They do not flush pending entities or repair entities, loaded collections, query caches, or persisted derived fields. Database triggers still run and may change timestamps. Write/read-only and flush-lock restrictions still apply; `in-memory-writes` mutations are unsupported, and reads retain validation-rule query restrictions.

:::

`em.execute` uses the active transaction, otherwise normal statement autocommit, without a hidden transaction, savepoint, or retry. A RETURNING decoder/Zod error can reject **after an autocommitted write has committed**. To roll back on a decode failure, use an explicit `em.transaction` and let the error propagate out of its callback; catching it inside does not promise rollback.

`em.transaction` still automatically calls `em.flush()` at callback end, even though `em.execute` itself never flushes. Pending dirty entities can overwrite bulk-written values on a later flush, or fail optimistic locking if a database trigger changed the timestamp. Decide how to handle pending changes before mixing the two write paths.

- Use a fresh EM to avoid stale caches, but not to repair persisted denormalized data.
- Explicitly [refresh](/testing/test-utils/#run-helper-method) affected loaded entities/collections to read current database state. Refresh is a reload, not a merge of pending changes or a recalculation of stored derived fields.
- For derived-field drift, identify affected entities, load/refresh their dependencies, call [`em.recalc`](/modeling/reactive-fields/), and `em.flush()` to persist repairs. Recalc does not discover every row affected by the raw write or replay skipped hooks.

Mutation targets must be supported, non-inherited entities; CTI/STI families are excluded. Polymorphic assignments, collections, inverse relations, nested creation, ORM cascades/FK fixups, upserts, UPDATE FROM, DELETE USING, and CTE declarations are unsupported. Mutations cannot be passed to `query()`/`em.query` or composed as read operands, even with RETURNING.

Codegen also disables mutation targets with unsupported physical storage mappings: native PostgreSQL enum arrays, SQL JSON/schema arrays, Date-mode date/timestamp arrays, and declared multidimensional arrays. JSON values that contain JavaScript arrays are not SQL arrays. Numeric/bigint arrays, supported primitive arrays, Temporal arrays, and configured custom element-mapper arrays have separate array-aware write paths. External column codecs need the optional `mapToDbValue` capability for bound value writes; existing entity writes and reads do not require it.
