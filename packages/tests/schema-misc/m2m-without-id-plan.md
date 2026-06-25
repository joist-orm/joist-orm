# Plan: support id-less m2m join tables (FK pair only)

> **Status: implemented & tested.** See `src/entities/manyToManyNoId.test.ts`. All decisions below
> resolved as noted; schema-misc + full integration suites (stock & join-preloading) green.

## Goal

Today every m2m join table must have a surrogate `id` PK. Support join tables whose PK is
just the composite `(col1, col2)` of the two FKs — i.e. `(authorId, tagId)` with no `id`.
Optional `created_at` still allowed.

`id` currently does double duty: (a) surrogate key for fast `DELETE WHERE id = ANY`, and
(b) the in-memory proxy for "does this row exist in the DB yet" (`id === undefined` ⇒ new).
The plan splits those two roles so id-less tables work.

## Core idea

1. New metadata flag `hasJoinTableId: boolean` (default `true`) on the m2m field + `ManyToManyLike`.
2. New `JoinRow.persisted` flag replaces `id`-as-existence-proxy. Then `toTodo`/`addRemove`/`addedFor`
   stop reading `id` to decide new-vs-existing — works for both kinds, no per-call branching.
3. `id` keeps meaning (a) only: still set/used for id-ful deletes; always `undefined` for id-less.
4. The few places that truly need the surrogate (driver INSERT/DELETE SQL, loader/preloader
   `ORDER BY id`, getOthers sort) branch on `hasJoinTableId` — ideally via separate codepaths,
   not inline `if`s.

## Codegen (packages/codegen)

- `utils.ts:59` `isJoinTable`: generalize. Keep `hasTwoFks`. Accept PK that is either a single
  non-FK `id` column (id-ful, existing) **or** the composite of the two FK columns (id-less).
  Non-key columns allowed: at most one `created_at`/`createdAt`. New shapes: 2 cols (FK+FK),
  3 cols (FK+FK+created_at). Preserve existing 3/4-col id-ful behavior exactly.
- `EntityDbMetadata.ts:688` `newManyToManyField`: compute `hasJoinTableId` from `r.joinTable`
  columns (single non-FK `id` PK present?) and add to `ManyToManyField`.
- `EntityDbMetadata.ts:217` `ManyToManyField` type: add `hasJoinTableId: boolean`.
- `generateMetadataFile.ts:244`: emit `hasJoinTableId: ${...}` into generated metadata.
- Risk: any codegen path doing `t.columns.get("id")` on a join table will throw. `isSubClassTable`
  (`utils.ts:45`) is only called for entity tables, so should be safe — verify no other blind
  `.get("id")` runs over join tables.
- Verify: pg-structure surfaces a pure 2-FK composite-PK table in `table.m2mRelations` (canonical
  junction shape — expected yes, but confirm against the new test table).

## Runtime metadata (packages/core)

- `EntityMetadata.ts:186` `ManyToManyField`: add `hasJoinTableId: boolean`.
- `JoinRows.ts:15` `ManyToManyLike`: add `hasJoinTableId: boolean` (sourced from field metadata where
  `ManyToManyLike`s are constructed — m2m collection getters + reactive m2m).

## JoinRows.ts — decouple existence from `id`

- `JoinRow` interface (`:237`): add `persisted?: boolean`. Semantics: row exists (or is assumed to
  exist) in DB. `id` becomes "surrogate key if id-ful, else undefined".
- `addNew` (`:42`): new row → `persisted: false`.
- `loadRows` (`:144`) + `addPreloadedRow` (`:128`): loaded rows → `persisted: true`. For id-less,
  `id` stays `undefined`; drop the `row.id = dbRow.id` assignment when `!hasJoinTableId`.
  `addPreloadedRow` no longer needs the `id` arg meaningfully for id-less (pass `undefined`).
- `addRemove` (`:72`): replace `if (!existing.id)` with `if (!existing.persisted)` (drop the
  never-persisted in-memory row) `else` mark `deleted`. The `id: -1` sentinel for the
  remove-against-unloaded case becomes `{ id: undefined, persisted: true, deleted: true }`.
- `toTodo` (`:201`): newRows = `!persisted && !deleted && op==="pending"`;
  deletedRows = `persisted && deleted && op==="pending"`. (Replaces the `id === undefined` /
  `id !== undefined` tests; correct for both kinds.)
- `addedFor` (`:115`): replace `r.id === undefined && pending` with `!r.persisted && pending`.
- `ManyToManyIndex.getOthers` (`:285`) sort: id-ful keeps `id ?? Infinity`. id-less sorts by the
  other entity's numeric id (`?? Infinity` so unsaved/new sort last). Branch on `hasJoinTableId`.

## PostgresDriver.ts

- `m2mBatchInsert` (`:251`): id-less variant — `INSERT INTO t (col1,col2) SELECT * FROM data
  ON CONFLICT (col1,col2) DO NOTHING` with **no** `RETURNING id`; set `op = Flushed` only (no id
  assign). `created_at` continues to rely on DB default. Prefer a separate function over inline ifs.
- `m2mBatchDelete` (`:279`): id-less always uses the composite-key delete
  (`DELETE ... WHERE (col1,col2) IN (...)`); skip the `id = ANY` branch. The existing `id === -1`
  partition goes away (sentinel rows now have `id===undefined` + `persisted`).

## Loaders + preloader (ORDER BY id)

- `manyToManyBatchLoader.ts` and `manyToManyFindDataLoader.ts`: `orderBys: [{column:"id"}]` →
  for id-less, order by `[col1, col2]` (deterministic; within a parent group reduces to other-id).
  `selects: ["alias.*"]` is fine.
- `JsonAggregatePreloader.ts` (`:176`, `:218`, `:233`, `:262`): for id-less, do **not**
  `selects.unshift(m2m.id)`, set `m2mOffset = 0`, `ORDER BY` the other-entity/`col2` instead of
  `m2mAlias.id`, and call `addPreloadedRow` with `undefined` id.

## Test schema (this package)

Add to `migrations/1580658856631_author.js` an id-less join table between `Book` and `Tag`:

```js
b.sql(`
  CREATE TABLE book_to_tags (
    "bookId" int NOT NULL REFERENCES book (id),
    "tagId" int NOT NULL REFERENCES tags (id),
    PRIMARY KEY ("bookId", "tagId")
  );
`);
```

Gives `Book.tags` / `Tag.books` with no surrogate id. (Optionally a second id-less table with a
`createdAt timestamptz DEFAULT now()` to cover the 3-col id-less shape — see questions.)
Then `make db` (migrate + codegen) and confirm generated metadata has `hasJoinTableId: false`
for these and `true` for `author_to_tags`.

## Tests (Book.test.ts / Tag.test.ts)

Mirror existing `author_to_tags` coverage against the id-less table:
- add/remove/set, flush → assert DB rows via `toMatchObject` on the whole array.
- remove against an unloaded collection (sentinel path) → composite-key DELETE.
- load/preload ordering is stable (PLUGINS= to also test the lazy loader).
- `em.clone`, cascade behavior, `find`/`includes`.
- regression: `author_to_tags` (id-ful) still behaves identically.

## Rollout order

1. Test schema + migration, regen → expect codegen to currently drop/ignore the table.
2. Codegen `isJoinTable` + metadata flag → regen, inspect generated output.
3. JoinRows `persisted` refactor (id-ful must stay green the whole time).
4. Driver INSERT/DELETE id-less paths.
5. Loaders + preloader ORDER BY.
6. Tests; run id-ful suite for regressions.

## Resolved decisions

1. Single `hasJoinTableId` boolean is enough.
2. id-less ordering: order by FK ids (`[col1, col2]`). Accepted (no true insertion order exists).
3. Include both an id-less FK-pair table AND an id-less + `created_at` variant.
4. `INSERT ... ON CONFLICT DO NOTHING` for id-less is fine (matches id-ful idempotency).
5. Fully cut over to `persisted`, retiring the `id: -1` sentinel for id-ful tables too. With this,
   `m2mBatchDelete` partitions purely on `id !== undefined` (by-id) vs else (composite) — id-less
   naturally always takes the composite path; no `hasJoinTableId` gate needed in delete.
6. Non-int (uuid) FK keys on id-less tables are out of scope (m2m insert/delete already hardcode
   `::int[]`).
