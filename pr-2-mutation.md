# PR 2: SQL-Shaped Mutations

## Handoff And Dependency

- Issue: https://github.com/joist-orm/joist-orm/issues/1989.
- Implement only after [PR1: Compound Reads](./pr-1-union.md) is merged; hand off next to [PR3: Extensions](./pr-3-extensions.md).
- PR1 establishes root `{ union | unionAll | intersect | intersectAll | except | exceptAll: [read1, read2, ...] }`, with at least two named-POJO read operands, keyed-output `orderBy`, `limit`, and `offset`. Every compound returns POJO rows; `query(compound)` produces a `Subquery`.
- PR1 rejects scalar set operands/results statically and at runtime, including all-scalar, mixed scalar/POJO, reusable scalar, and nested scalar operands. Untracked/widened `SetOperand` projections lose known output keys, not scalar-versus-POJO identity.
- `query(...)` creates reusable read values, and `em.query(...)` returns read rows. Preserve these contracts except for the explicitly approved table cutover below.
- Ordinary `query({ from, select: expr })` remains `Expr<R | null, never>` for scalar/IN contexts, without a `ScalarQuery` brand or scalar-value execution overload. Inline `em.query({ from, select: expr })` still returns scalar arrays; direct execution of a scalar query value is not public API.
- Recheck the merged implementation before editing. The source observations below describe the pre-PR1 baseline, not guaranteed final symbol names.
- This handoff does not authorize commits or PR creation. Preserve unrelated work, including `.idea/vcs.xml`. Coordinate handoff updates when a reviewed decision affects later PRs.

## Table Cutover Contract

This reviewed decision supersedes the original **DOMAIN field-name assignment requirement**. SQL-shaped `em.query`, `query`, and `em.execute` use `table`/`tables` and `Table<T>`, with physical column keys such as `first_name` and `author_id`. VALUES, UPDATE SET, and INSERT SELECT target keys use those physical names, not `firstName` or `author`. Values still use domain codecs and public ID types. Ordinary read/RETURNING output keys remain freely chosen, i.e. `{ firstName: a.first_name }` or `{ authorId: b.author_id }`.

`alias`/`aliases` and `Alias<T>` now belong only to `em.find` domain filters. `Tables.ts` owns SQL column expressions and joins, while `Aliases.ts` retains find predicates. Keep `b.author.as(a)`, `a.books.as(b)`, and polymorphic `c.parent.eq/ne/in` sugar. An owning relation name is a join factory, not a selectable FK expression or assignment key. Selecting a root table still hydrates entities; mutation RETURNING does not.

Codegen emits physical `AuthorColumns`/`BookColumns` interfaces, linked through `TypeMap.columnsType` and `ColumnsOf<T>`, separately from domain `Fields` interfaces. These column types carry value/nullability and insert/update policies. Runtime `EntityMetadata.columns` maps physical names to owning `fieldName` entries, so SQL expressions and writes reuse existing serde columns and physical facts. Do not derive mutation keys from domain `Fields` or `OptsOf<T>`. Earlier source observations are historical. This cutover adds no PR3 features and does not relax excluded mutation targets or polymorphic assignments.

## Goals

- Add typed, immediate SQL INSERT, UPDATE, and DELETE statements without entering the entity unit of work.
- Support bulk VALUES, database-side INSERT SELECT, and typed POJO or scalar RETURNING results.
- Make affected counts, mutation guards, physical schema constraints, and transaction behavior explicit.
- Share PR1's SQL output descriptions and decoders rather than creating a second read compiler or entity hydration path.
- Put most new `em.execute` implementation in `packages/core/src/execute.ts`, following the separation between `EntityManager.query` and `query.ts`.

## API And Rationale

Root forms below are API shapes, not declarations of new helper types:

```text
{ insert: b, values: oneRowOrArray, returning? }
{ insert: b, from: rowShapedReadQueryOrQueryValue, returning? }
{ update: b, set, where?, allowAll?, softDeletes?, returning? }
{ delete: b, where?, allowAll?, softDeletes?, returning? }

em.execute(statement): Promise<{ rowCount: number; rows: R[] }>
```

- Exactly one root operation is allowed; INSERT `values` and `from` are mutually exclusive, including at runtime.
- Statements remain reusable POJOs. Export suitable statement types for annotations and `satisfies`, without a mutation builder or wrapper.
- Reject `query(mutation)` and `em.query(mutation)` statically and at runtime; mutations are not read values or compound operands.
- `em.execute` also accepts the read inputs supported by `em.query`, returning their rows in the metadata envelope. Preserve their existing decoding and read restrictions: ordinary scalar-select POJOs are executable inputs, but scalar `query()` expressions are not public execution inputs. Do not introduce a scalar query brand or turn every Expr into an executable statement. The no-entity-hydration rule below applies to mutation RETURNING, not existing ordinary entity reads.
- RETURNING accepts named expression POJOs or one scalar expression. Never accept a table handle or an entity-shaped read value.
- Infer `R` from RETURNING. Without RETURNING, use `rows: never[]` in the public type and return `[]` at runtime.
- Always return the stable envelope. `rowCount` is the driver's top-level command count: affected rows for mutations and selected rows for reads. Never manufacture it from `rows.length`; no RETURNING does not mean zero affected rows.
- A scalar RETURNING produces scalar array elements, not `{ value: ... }` objects. Preserve existing expression/column decode semantics and nullability.
- PR1's POJO-only restriction is for read compounds, not mutation result modes. Scalar RETURNING remains required.
- UPDATE SET, mutation predicates, and mutation RETURNING have the target table in scope; reuse supported read subqueries without silently adding mutation joins.
- To consume a compound in scalar/IN contexts, use a named column through an ordinary wrapper, i.e. `a.id.in(query({ from: ids, select: ids.id }))` for a compatible `{ id: AuthorId }` compound. Apply `.coalesce()` to that outer scalar expression. A scalar context adds SQL NULL for zero rows and errors on multiple rows; IN can consume many rows. Retain enclosing correlations and outer joins referenced by any branch, including non-first branches.
- INSERT VALUES has no existing target row to read. Reject direct target-column references in its value expressions; scalar subqueries retain their own lexical sources. INSERT SELECT's source scope is independent from the target RETURNING scope.

## Examples

Assume `em` exists and Author `a:1` is already persisted. These are independent examples, not a sequential setup script. Book `author_id` and `notes` need explicit inputs despite their ORM configuration defaults; its timestamp columns are supplied by the existing database trigger, not entity defaults.

```ts
const b = table(Book);
const insert = {
  insert: b,
  values: { title: "Imported Book", author_id: "a:1", notes: "Imported without hooks" },
  returning: { id: b.id, title: b.title },
} as const;
const inserted = await em.execute(insert);

const updated = await em.execute({
  update: b,
  set: { order: sql<number>`${b.order} + ${1}` },
  where: b.id.eq("b:1"),
  returning: b.order,
});

const deleted = await em.execute({
  delete: b,
  where: b.id.eq("b:1"),
});
// deleted.rows is []; deleted.rowCount is the database's affected count.
```

INSERT SELECT accepts either the read POJO directly or its `query(...)` value. This example independently assumes a live Book `b:1` exists:

```ts
const source = table(Book);
const copiedBooks = query({
  unionAll: [
    {
      from: source,
      where: source.id.eq("b:1"),
      select: { title: source.title, author_id: source.author_id, notes: source.notes },
    },
    {
      from: source,
      where: source.id.eq("b:1"),
      select: { notes: source.notes, title: source.title, author_id: source.author_id },
    },
  ],
});
await em.execute({ insert: b, from: copiedBooks, returning: { id: b.id } });
// Both source rows are inserted; unionAll does not deduplicate.
```

## Assignments And Defaults

- Use target physical column names, such as `author_id` and `first_name`. The former requirement to use DOMAIN field names is obsolete and must not be restored.
- Accept compatible domain values and existing typed SQL expressions. Bind domain values through actual write encoding; expressions stay SQL.
- Accept ordinary owning references as the correct entity ID type or a persisted entity. Use metadata-aware ID encoding, not string surgery.
- Reject new/unflushed reference entities even when they have preassigned IDs. An ID on an entity is not proof that the row has been inserted.
- Do not create referenced entities, cascade, accept nested creation options, or perform FK fixups. An ID-only reference still relies on database FK validation.
- Missing or `undefined` VALUES fields mean omission/SQL DEFAULT for that row, not SQL NULL. Build a common column list and emit DEFAULT in missing cells.
- UPDATE fields with `undefined` are pruned; they do not reset the column. Missing fields leave their columns unchanged.
- Explicit `null` means SQL NULL before any codec runs. Enforce physical nullability; do not turn it into JSON `null`, enum `[]`, or a config default.
- For JSON `null` as a stored JSON value, use a suitable existing SQL expression, such as `` sql`'null'::jsonb` ``. Test it separately from SQL NULL.
- Support explicit SQL DEFAULT through the existing `sql` template, for example `` sql<string>`DEFAULT` `` in a string assignment. Do not add a helper.
- Choose this empty-input policy: `values: []` returns `{ rowCount: 0, rows: [] }` without SQL. Check statement validity and write permissions before this shortcut.
- This no-SQL shortcut is only for a standalone statement without attached CTE declarations. PR3 must not carry it into a CTE body or a root with declarations and thereby skip required writes; see its explicit empty-INSERT boundary.
- Reject `{}` and any VALUES row whose fields all prune away. PR2 does not infer `DEFAULT VALUES`; test this separately from an empty row array.
- Allow explicit writes to ordinary persisted ORM-derived columns for backfills/imports. ORM-derived does not mean database-generated or immutable by schema.
- Reject UPDATE primary-key assignments, even if unchanged. Permit explicit INSERT primary keys only where the actual schema permits them.
- Reject generated/immutable-by-schema assignments that PostgreSQL disallows; do not invent identity override syntax. Omit generated columns when appropriate.

## Mutation Safety

- UPDATE and DELETE require a user `where` that survives existing condition pruning, unless `allowAll: true` is explicit.
- Validate the USER condition before injecting metadata filters. Soft-delete predicates cannot make an otherwise unguarded statement safe.
- Cover absent `where`, `undefined` conditions, and nested expressions that prune to nothing; fail before issuing SQL.
- This guard is not general tautology detection. An explicit `` sql<boolean>`true` `` predicate is not promised to be rejected.
- `allowAll: true` permits a missing guard but does not remove an existing predicate or disable soft-delete filtering.
- Reject a post-pruning empty UPDATE `set`, including when `allowAll: true` is present.
- UPDATE and DELETE default to `softDeletes: "exclude"`; allow `"include"`. Reuse the read-side metadata convention.
- DELETE is physical deletion, not setting `deleted_at`. Database constraints, triggers, and database-defined cascades still apply.
- Reject unknown roots, clauses, fields, malformed projections, and excluded shapes at runtime as well as through TypeScript.

## Schema And Type Prerequisites

- Do not derive SQL insert requiredness from `OptsOf<T>`, setters, or factories. Their optional fields can depend on hooks/defaults that execute bypasses.
- Book `author_id` and `notes` have configuration defaults but no SQL defaults. Omission must not silently trigger ORM defaults.
- Author `number_of_books` is derived but database NOT NULL without a default. Direct author inserts may need this and other explicit persisted columns.
- Require known SQL-required values in each VALUES row and in INSERT SELECT's output keys, while accounting for genuine server-side providers. Let PostgreSQL validate supplied SQL expressions/defaults.
- Resolve the server-supplied-field policy before locking insert requiredness. `createEntityTable` creates NOT NULL `created_at`/`updated_at` without column defaults; `trigger_maybe_set_created_at` fills them on INSERT. A blanket NOT NULL/no-DEFAULT rule would incorrectly reject the Book examples above.
- Carry explicit, reviewed knowledge of server-provided values where needed. Do not infer arbitrary trigger behavior from ORM-derived flags or field names, invoke JS defaults to fill the gap, or pretend to statically analyze every trigger. Review any new configuration override before exposing it publicly.
- Inspect physical schema facts in codegen and carry distinct SQL nullability, SQL-default availability, and generated/identity writability into runtime and generated types.
- Existing metadata `default: "schema" | "config"` collapses the case where both exist; it is not a complete SQL-default fact.
- `generateMetadataFile.ts` currently emits `required: !derived && p.notNull` for primitives, losing physical NOT NULL on derived fields.
- Preserve existing metadata/API meanings. Add the minimum separate physical facts needed; regenerate affected metadata/type fixtures through the existing workflow.
- `SettableFields` maps disallowed values to `never` without removing keys. Do not use `keyof SettableFields<...>` as a writable-key whitelist.
- Build mutation field sets with actual key filtering, include allowed persisted derived fields, and exclude relations or fields without supported physical storage.
- Static input/source compatibility must preserve branded IDs, native codecs, nullable fields, array types, and schema-required keys; runtime validation remains necessary.

## Module Ownership

- Add `packages/core/src/execute.ts` as the main statement implementation module. It owns statement input/result types, classification, normalization, mutation-specific validation and guards, SQL compilation, RETURNING planning, and result-decoding helpers.
- Keep `EntityManager.execute` thin, like `EntityManager.query`: public signatures, necessary EM-private permission checks, delegation, driver invocation, and error-stack context. Do not put SQL-building branches or large statement type definitions in EntityManager.
- Keep `query.ts` focused on read queries and read-query values. `execute.ts` delegates readable statements and INSERT sources to that compiler and reuses its output/projection machinery.
- Export the minimum internal helpers needed for reuse. Extract a small shared module only when there is genuinely shared logic; do not duplicate the read compiler or add a new framework just to connect the modules.
- Avoid runtime cycles between `execute.ts`, `query.ts`, and EntityManager. Use type-only dependencies or narrow structural capabilities where appropriate, preserving the existing module-loading and declaration-build constraints.
- Put public types/entry points before private helpers, following repository conventions. The file name does not imply a new public free-function API; the user-facing executor remains `em.execute`.
- Keep database-specific transport and command metadata in the driver, and reusable field codecs in `serde.ts`, rather than moving those implementations into `execute.ts`.

## Compiler And Codec Work

- `packages/core/src/query.ts` currently builds a single read `Plan` with `decodeRows`. PR1 should expose ordered SQL output/codec descriptions.
- Reuse the actual abstraction and symbol names merged in PR1. If a necessary output fact is absent, extend that abstraction rather than inventing a duplicate projection registry.
- Compile INSERT, UPDATE, and DELETE in `execute.ts` with existing identifier quoting, expression scopes, placeholder handling, and condition pruning.
- For INSERT SELECT, accept named POJO columns only, for both ordinary reads and PR1 compounds. Even a one-column source needs a physical target-column key, i.e. `select: { author_id: a.id }`, not `select: a.id`; a one-key source is valid only when the target's other columns may be omitted under the schema/server-provider rules. Reject scalar/entity projections, unknown target keys, missing required keys, and incompatible column representations.
- Match output keys to target physical columns, then normalize target/source column order explicitly. Object insertion order must not swap assignments.
- Keep source SQL, bindings, branch grouping, ordering, pagination, and compound semantics intact. A SQL projection wrapper may reorder outputs without materializing them.
- Never call `em.query(source)`, decode rows, then re-encode INSERT values. No JavaScript round trip between SQL stages; preserve UNION ALL duplicates.
- Validate source/target storage compatibility as well as domain types; an INSERT SELECT must not assume two custom codecs with the same TypeScript type share a SQL representation.
- `Column.mapToDb` is filter-oriented. `CustomSerdeAdapter.dbValue` maps arrays element-by-element, while `mapToDb` passes the whole value to its mapper.
- Extract/share an entity-independent write-value encoding path where necessary. Preserve filter behavior and existing ordinary entity write behavior.
- Do not construct fake entities, `__orm.data` objects, or `dbValue` wrapper hashes to reuse entity writes. Classify undefined/null/expression/value before encoding.
- Reuse `Column.mapFromDb` and the read compiler's ordinary scalar-select and POJO decoders for RETURNING; PR1 compounds themselves only use POJO results. Preserve scalar column codec metadata for enums, custom types, JSON, dates/Temporal, and its distinction from array codecs regardless of result mode. Do not hydrate entities or register returned IDs in the identity map.
- `EntityWriter.ts` documents field ownership, reference handling, CTI, and FK fixups. Consult it for storage facts, but do not invoke its flush pipeline.

## Driver And Execution Contract

- Approved breaking change: `packages/core/src/drivers/Driver.ts` exposes required `executeQuery(...): Promise<DriverQueryResult>` with `{ rowCount: number | null, rows: any[] }`.
- Update all driver implementations and callers to the envelope without a compatibility alias or fallback. `em.query` and `executeFind` extract `.rows` to preserve their public contracts.
- `packages/orm/src/drivers/PostgresDriver.ts` retains the native count, including null for DDL. Only `em.execute` validates that the count is a nonnegative finite integer.
- Validate that a supported mutation has a real numeric command count; never fall back to returned-row length or manufacture a success count.
- Route through the existing client selection using `em.txn`, otherwise the normal pool/autocommit path. Preserve SQL conversion, bindings, logging, and errors.
- `packages/drivers/bun-pg/src/BunPgDriver.ts` has an incomplete `executeQuery`. Leave mutation support explicitly unsupported unless implementing and testing real count/transaction semantics.
- Incomplete drivers must fail clearly before SQL. Do not synthesize counts from returned rows.
- Metadata-bearing reads and mutations through `em.execute` use the same required driver method; ordinary `em.query` returns decoded rows only.
- Mutation execution must honor write/read-only and existing flush-lock restrictions. Explicitly reject mutations in `in-memory-writes` until its semantics are supported. Read statements retain the read-query restrictions instead; this entry point must not bypass validation-rule guards.
- Mutation execution adds no automatic flush, entity hooks, config defaults, validation rules, reactions, optimistic locking, timestamps, or cache repair.
- Use the active transaction when present; otherwise use ordinary statement autocommit. Add no hidden transaction, savepoint, or retry behavior.
- `em.transaction` ALREADY flushes at callback end. Keep that behavior; distinguish it from execute, which does not flush pending entities.
- A RETURNING serde/Zod failure can occur after an autocommitted write. A rejected execute promise is not a universal rollback guarantee.
- Inside an explicit transaction, propagate the decode error out of its callback to roll back. Catching it inside the callback does not promise rollback.
- Entity hooks are bypassed, but database triggers/constraints still run and may update `updated_at`; avoid claiming timestamps can never change.
- Existing entities, loaded collections, and query caches may be stale. A fresh EM isolates caches but does not repair persisted denormalized fields.
- Document explicit `refresh`/`recalc` choices and their limits. Pending dirty entities or transaction-end flushes can overwrite bulk-written values; no automatic synchronization is promised.

## Files To Inspect Or Change

- `packages/core/src/execute.ts` (new): primary home for statement types, validation, mutation compilation, RETURNING, and execution/result helpers.
- `packages/core/src/query.ts`, `Expr.ts`, `Tables.ts`, and `QueryParser.pruning.ts`: reuse read compilation, output descriptions, expression identity, and pruning; expose only the shared helpers needed by `execute.ts`. Keep `Aliases.ts` focused on `em.find` domain predicates.
- `packages/core/src/EntityManager.ts` and `FlushLock.ts`: thin execution entry point, error context, and EM-private permission checks; inspect existing transaction, refresh, and recalc semantics without moving mutation compilation here.
- `packages/core/src/drivers/Driver.ts`, `packages/orm/src/drivers/PostgresDriver.ts`, and `packages/drivers/bun-pg/src/BunPgDriver.ts`: required result envelope and unsupported behavior.
- `packages/core/src/serde.ts` and `drivers/EntityWriter.ts`: write encoding versus filter/decode behavior; the latter is a reference, not a mutation execution path.
- `packages/core/src/EntityMetadata.ts`, `typeMap.ts`, and `EntityFields.ts`: physical field facts and public mutation input inference.
- `packages/codegen/src/generateMetadataFile.ts` and `generateEntityCodegenFile.ts`: physical defaults/nullability/generated facts and corresponding generated fixtures.
- `packages/core/src/index.ts` and existing ORM export surfaces: expose only necessary public types and preserve module-sync/public API behavior.
- `packages/tests/integration/src/EntityManager.execute.test.ts` and `EntityManager.execute.types.test.ts`: recommended new runtime/type coverage.
- `packages/tests/integration/src/EntityManager.txns.test.ts`, `EntityManager.modes.test.ts`, `createKnex.test.ts`, and `drivers/PostgresDriver.cte.test.ts`: nearby transaction, permission, driver, and write-encoding precedents.
- Existing temporal/ID workspace fixtures and native-codec tests: reuse real supported fields rather than inventing entities for convenience.
- `docs/src/content/docs/features/queries-raw.md`: document the new API, guards, defaults, counts, and bypass/transaction caveats; cross-link existing refresh/recalc guidance.

## Implementation Sequence

1. Read merged PR1 and identify its ordered output descriptors, source compatibility checks, and decoder reuse points.
2. Establish the `execute.ts` module boundary and its minimal integration with the read compiler and EntityManager.
3. Establish physical-schema metadata and write-value encoding; prove custom-array/null handling without regressing entity writes or filters.
4. Define root unions, inferred mutation inputs/results, guards, and unsupported-shape errors in `execute.ts`.
5. Compile VALUES, guarded UPDATE/DELETE, RETURNING, and SQL-only INSERT SELECT there, preserving PR1 compound behavior.
6. Update the driver contract and thin `EntityManager.execute` wrapper, retaining existing transaction, mode, and public `em.query` rows-only contracts.
7. Add focused runtime/type/codec tests, document operational caveats, then run the verification matrix and hand off to PR3.

## Tests: Successful Statements

- Separate INSERT, UPDATE, DELETE, source-query, and RETURNING cases. Cover one row, bulk rows, zero matches, scalar results, and keyed POJO results.
- Assert nonzero driver counts with no RETURNING and `rows: []`; cover all three operations and zero-row results independently.
- Cover read execution through `em.execute`, including ordinary scalar-select POJOs, POJO compounds, selected-row counts after pagination, and existing read restrictions/decoding. Do not establish direct scalar-query-value execution as a public API.
- Test reusable statement POJOs without mutation during compilation, compatible persisted references/IDs, allowed explicit PKs, and persisted derived-field backfills.
- Cover mixed VALUES keys, undefined omission, per-row DEFAULT, explicit SQL DEFAULT, nullable SQL NULL, and the empty-array no-SQL envelope.
- Exercise guarded filters, arithmetic `` sql<number>`${b.order} + ${1}` ``, `allowAll`, and both soft-delete policies; verify DELETE physically removes rows.
- INSERT SELECT: read POJO and read value, named one-key projections where target requiredness permits, reordered keys, source parameters/pagination, target SQL naming, and UNION ALL duplicates with a full SQL snapshot.
- Prove INSERT SELECT does not call source decoders or target write codecs; include a real custom-codec case that would expose a JavaScript round trip.
- Verify no implicit flush/hooks/defaults/rules/reactions/oplocks/cache repair; keep a loaded entity stale and read physical results through an isolated EM.
- Verify real database triggers/constraints still apply, including timestamp behavior where existing fixtures provide a trigger.

## Tests: Invalid Inputs And Execution

- Separate absent/pruned user guards from soft-delete injection, permitted explicit predicates, `allowAll`, empty sets, empty rows, and malformed root combinations.
- Reject missing SQL-required Book inputs and Author derived inputs; keep successful fixtures fully populated instead of relying on ORM/factory optionality.
- Reject new references with and without assigned IDs, disallowed fields, UPDATE PK changes, illegal generated-column writes, and every excluded target/relationship form.
- Reject INSERT SELECT scalar/entity sources, missing/extra keys, incompatible IDs/nullability/codecs, and mixed `values`/`from`.
- Reject direct target references in INSERT VALUES while permitting valid scalar subqueries with their own sources; verify UPDATE SET and RETURNING use their intended row contexts.
- Verify read-only, in-memory-writes, and flush-lock rejection before SQL; retain invalid-count, null DDL count, and public rows-only query regression coverage.
- Assert active-transaction client routing, normal autocommit without hidden BEGIN/SAVEPOINT, rollback on propagated errors, and existing transaction-end flush behavior.
- Use a real RETURNING decoder/Zod failure: autocommit leaves the written row committed; an explicit transaction with the error propagated rolls it back.
- Confirm state from a separate connection/EM after transaction completion; do not infer commit or rollback from promise rejection or identity-map contents.

## Tests: Types And Native Codecs

- Use `expect-type` for inferred envelopes, scalar/POJO rows, reusable statements, nullable inputs, IDs, required fields, and all static rejection cases.
- Include nonliteral POJOs and unknown-input runtime tests; excess-property checks on fresh literals alone do not secure the API.
- Keep native-codec/unit scenarios distinct from successful SQL and invalid-input scenarios: custom arrays, enums/enum arrays, JSON, Zod, dates/Temporal, bigint/decimal, and ID variants.
- Test SQL NULL, JSON `null`, and enum `[]` separately; assert that null bypasses codecs and custom-array writes encode each element once. Distinguish SQL NULL from JSON null with database assertions, not just their possibly identical JS return values.
- All new tests use Given/And/When/Then comments. Add a domain-specific `// And ...` before each distinct additional setup condition or mutation, including deliberately invalid data.
- Use actual fixtures; author setup may need explicit derived columns. Use tagged IDs for `em.load`/`em.loadAll` where that workspace uses tagged IDs.
- Use `toMatchEntity` only for managed entities; use `toEqual`/`toMatchObject` for returned values and whole DB-row arrays. Do not synthesize objects/arrays merely to group assertions.
- No `arrayContaining`, `objectContaining`, `toContain`, or `toMatch`. For SQL, reset query capture and assert full ordered strings with `toMatchInlineSnapshot`, not filtered fragments.

## Exclusions And PR3 Boundary

- Reject CTI/STI mutation targets, including inherited table families; do not inherit read-side subtype joins as write support. Supported inherited reads remain PR1's responsibility.
- Reject polymorphic assignments, collections, inverse relations, nested creation, cascades in the ORM, and FK fixups.
- No conflict/upsert clauses, UPDATE FROM, DELETE USING, or CTE declarations, including data-modifying CTEs.
- No entity RETURNING, mutation query values, automatic identity-map synchronization, automatic denormalized-field repair, or unit-of-work integration.
- [PR3](./pr-3-extensions.md) owns extension implementation or explicit gating. Keep unsupported syntax rejected until semantics and tests exist; do not speculate on compatibility layers.

## Verification Commands

Commands below are for the implementing agent, not work performed by this handoff. Use existing local database configuration; do not add credentials.
Run from the repository root unless a working directory is specified. Adapt test filenames only if the implementation chooses different names.

```sh
yarn tsdown --no-clean --log-level error && yarn typecheck:packages && yarn typecheck:consumers && node scripts/test-module-sync.mjs
```

Working directory `packages/tests/integration`; focused cases first, then driver regressions:

```sh
yarn test-stock --runTestsByPath src/EntityManager.execute.test.ts src/EntityManager.execute.types.test.ts src/EntityManager.rawQueries.test.ts src/EntityManager.txns.test.ts src/EntityManager.modes.test.ts --verbose=false
yarn test-stock --runTestsByPath src/createKnex.test.ts src/drivers/PostgresDriver.cte.test.ts --verbose=false
```

Final integration coverage, in the same working directory:

```sh
yarn test-stock --verbose=false
yarn test-lazy-preloading --verbose=false
```

Each variant must use one `--runInBand` Jest process because its files share a database. These scripts already set that flag.
Wait for focused stock runs before full stock. Distinct variants have separate databases and may run in parallel.

Working directory `packages/tests/integration`, Temporal modes SEQUENTIALLY because they share one database:

```sh
JOIST_ROW_DATA=0 yarn workspace joist-tests-temporal test --verbose=false
JOIST_ROW_DATA=1 JOIST_LAZY_BINARY=1 yarn workspace joist-tests-temporal test --verbose=false
```

In the same integration working directory, identifier regressions:

```sh
yarn workspace joist-tests-number-ids test --verbose=false
yarn workspace joist-tests-untagged-ids test --verbose=false
yarn workspace joist-tests-uuid-ids test --verbose=false
```

In the same integration working directory, invoke codegen's workspace test binary; include other changed generator tests as needed:

```sh
NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--experimental-vm-modules" yarn workspace joist-codegen exec jest --runInBand --runTestsByPath src/generateEntityCodegenFile.test.ts --verbose=false
```

Root, lint/format checks scoped to intended TypeScript files; extend this exact list for other changed TS files:

```sh
yarn oxlint packages/core/src/execute.ts packages/core/src/query.ts packages/core/src/EntityManager.ts packages/core/src/serde.ts packages/tests/integration/src/EntityManager.execute.test.ts packages/tests/integration/src/EntityManager.execute.types.test.ts
yarn oxfmt --check packages/core/src/execute.ts packages/core/src/query.ts packages/core/src/EntityManager.ts packages/core/src/serde.ts packages/tests/integration/src/EntityManager.execute.test.ts packages/tests/integration/src/EntityManager.execute.types.test.ts
yarn workspace joist-docs build
```

Run the docs build if site docs change. Avoid root clean/reset scripts and indiscriminate database resets.
If Temporal reports missing `book.deleted_at`, inspect migration state; existing `packages/tests/temporal/migrations/1788221483195_book_soft_delete.js` can be applied with `yarn workspace joist-tests-temporal migrate` from root.
Record blocked checks and their actual errors; do not mask schema drift by weakening assertions or silently skipping a variant.

## Done Criteria And Next Handoff

- Most statement logic lives in `execute.ts`; EntityManager remains a thin wrapper and read compilation is reused rather than duplicated.
- All four statement forms work with inferred stable envelopes, real driver counts, schema-aware inputs, guarded writes, and the stated empty-input policy.
- INSERT SELECT stays entirely in SQL and preserves ordered physical-column-key mapping, storage compatibility, source behavior, and duplicate rows.
- Value writes use real write encoding; RETURNING shares PR1 decoders without entity hydration; existing read/filter/entity-write APIs remain intact.
- Permission, transaction, autocommit decode-failure, soft-delete, and cache-staleness behavior is tested and documented without rollback or repair overpromises.
- Runtime/type rejection covers excluded forms; generated physical-schema facts and fixture changes are reviewed for unrelated churn.
- Required focused/full checks pass, or specific environmental blockers are recorded; no unrelated files are changed, and reviewed decisions are communicated to later handoffs.
- Give the PR3 agent the merged revision, actual public/internal symbols, physical metadata facts, required driver contract, test results, and remaining gates. Do not begin PR3 in this change.
