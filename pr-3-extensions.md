# PR 3: CTEs And Mutation Extensions

## Status and Ownership

This handoff follows [PR1: read compounds](pr-1-union.md) and [PR2: mutations](pr-2-mutation.md).
Implement sequentially after both predecessors merge, using their actual types and contracts.
The [PR2 implementation handoff](pr-2-mutation-handoff.md) records the current symbols, physical metadata, codec/driver boundaries, verification, and remaining gates. PR2 is currently working-copy implementation, not a merged revision.
Track the relevant read-query work in [issue #1989](https://github.com/joist-orm/joist-orm/issues/1989).
That issue is a deferred-feature tracker, not a requirement to implement every listed feature here.

- Approved previous directions are summarized below; preserve them rather than redesigning PR1/PR2.
- The concrete PR3 syntax below is a proposed design default beyond those discussed basics.
- Review `query.cte`, root `with`, `onConflict`, `sql.excluded`, and single-source `from`/`using` with the user before implementation unless the assignment already approves this handoff's proposed API.
- Ask for user API review before adding further shapes outside this handoff, even if PostgreSQL supports them.
- Reconcile any mismatch with merged PR1/PR2 explicitly; examples here do not override their reviewed contracts.
- Reading this document grants no permission to commit, push, or create a PR.

## Required Scope

- Non-recursive read CTEs with explicit declarations and typed POJO columns.
- Non-recursive data-modifying CTEs using PR2 INSERT, UPDATE, and DELETE statements.
- SQL `INSERT ... ON CONFLICT`, separate from entity-aware `em.upsert`.
- `UPDATE ... FROM` and `DELETE ... USING`, initially with one explicit source.
- Runtime validation, type tests, SQL/behavior tests, and documentation for these four features.
- Keep recursion, inheritance writes, polymorphic assignments, and other #1989 features behind separate design gates.

## Approved Prior Contracts

- PR1 has exclusive root `union`, `unionAll`, `intersect`, `intersectAll`, `except`, and `exceptAll` branches.
- Each compound takes at least two named-POJO read operands, not writes, scalar selects, or entity-mode operands. Reject all-scalar, mixed scalar/POJO, reusable scalar, and nested scalar operands statically and at runtime.
- All compound results have named POJO columns; `query(compound)` produces a `Subquery`. Operands have the same keys, normalized to a common column order before SQL generation. Untracked/widened `SetOperand` projections lose known keys, not scalar-versus-POJO identity.
- Compatibility requires both compatible SQL storage types and compatible domain codecs, not just TypeScript assignability.
- Scalar column codec metadata, including enum, custom-type, JSON, Date/Temporal, and scalar-versus-array distinctions, remains necessary inside POJO columns. POJO-only compounds do not remove scalar column support.
- `query()` creates read values only; `em.query` executes reads and returns rows.
- Ordinary `query({ from, select: expr })` remains `Expr<R | null, never>` without a scalar query brand. Inline `em.query({ from, select: expr })` returns scalar arrays, but direct execution of a scalar query value is not public API and has no dedicated overload.
- For compound membership or scalar expressions, select a named column through an ordinary wrapper, i.e. `a.id.in(query({ from: ids, select: ids.id }))` for compatible named ID rows. Apply `.coalesce()` to the outer scalar expression. A scalar context adds SQL NULL for zero rows and errors on multiple rows; IN permits many rows. Preserve enclosing correlations and outer joins referenced in any branch, including non-first branches, without adding implicit LATERAL support.
- Existing plain entity reads are not globally removed; entity set-operation operands remain excluded.
- PR2 roots are `{ insert: alias, values }` or `{ insert: alias, from: rowShapedReadQuery }`, `{ update: alias, set }`, and `{ delete: alias }`.
- INSERT SELECT requires named POJO source columns, including a target-field key for a one-column projection; scalar/entity sources remain excluded.
- `returning` supports POJO or scalar results, never entity hydration; `em.execute` returns `{ rowCount, rows }`. PR1's POJO-only compound restriction does not remove PR2's scalar RETURNING requirements.
- PR2 places statement types, mutation compilation, validation, and execution helpers in `packages/core/src/execute.ts`, with a thin EntityManager wrapper. Preserve that split from `query.ts`.
- `em.execute` also accepts the read inputs supported by `em.query`, including ordinary scalar-select POJOs and POJO compounds, not direct scalar query expressions. PR3 must distinguish those from a SELECT-family root that contains modeled mutations.
- UPDATE/DELETE require an explicit `where` that survives pruning, or `allowAll: true`.
- UPDATE/DELETE default to `softDeletes: "exclude"`; `"include"` opts in to soft-deleted targets. DELETE is physical.
- No automatic flush, entity defaults, hooks, reactions, optimistic locks, identity-map updates, or cache synchronization.
- Database defaults, triggers, constraints, and cascades still run according to PostgreSQL semantics.
- Execution uses the driver's active transaction or autocommit; it does not create an implicit transaction wrapper.
- A RETURNING decoding failure cannot undo a write that has already autocommitted.
- Keep literal-write encoding, SQL-to-SQL transfer compatibility, and final-result decoding distinct.
- Inherited targets, polymorphic assignments, collections, conflict clauses, FROM/USING, and CTEs are initially rejected in PR2.
- PR3 lifts only the explicitly reviewed CTE, conflict, FROM, and USING restrictions.

## Research Baseline

- Current query code is in `packages/core/src/query.ts`, not `packages/orm/src/query.ts`.
- After PR2, mutation and statement execution logic belongs in `packages/core/src/execute.ts`; reuse its actual interfaces rather than moving that logic back into the read compiler.
- `SubqueryHandle` already provides POJO column keys, runtime identity, and access to source expressions.
- `SubqueryColumnExpr` forwards encoding/decoding; build on the merged PR1/PR2 projection description instead of copying it.
- `parseUserQuery` currently separates SQL/bindings/decoding from execution; preserve this boundary.
- `Expr.ts` is deliberately a runtime leaf, and `query.ts` avoids importing EntityManager through its hydrator interface.
- Preserve these module-cycle constraints when adding handles, statement classifications, and exports.
- Current read joins can prune when no expressions reference them; that optimization is unsafe for mutation sources.
- `PolyReferenceAlias` does not extend `BaseExpr`; a polymorphic relation is not a selectable single column.
- `EntityManager.transaction` flushes at callback completion; nested driver transactions reuse the client without savepoints.
- Driver `executeQuery` returns `{ rowCount: number | null, rows: any[] }`; reuse this required execution path, not a second competing path. `em.execute` validates native counts; `em.query` extracts and decodes rows only.
- PostgreSQL documentation confirms the semantics below; confirm the project's minimum supported version before coding.

## Proposed CTE API

`query.cte({ ...readQueryOrMutation, as: "name" })` creates an explicit handle.
Root `with: [cte1, cte2]` attaches declarations to one `em.query` or `em.execute` statement.
This spelling and the root-only attachment rule are proposals for user review.

```ts
const b = alias(Book);
const books = query.cte({
  from: b,
  where: b.author.eq("a:1"),
  select: { id: b.id, title: b.title },
  as: "books_for_author",
});
const rows = await em.query({
  with: [books],
  from: books,
  select: books,
});
```

- Reuse POJO relation-column handles: `books.id` retains BookId and its storage/domain codec.
- Addressable read CTEs require named POJO `select`; addressable mutation CTEs require named POJO `returning`.
- Reject entity CTE projections and bare scalar CTE projections; use `{ value: expr }` for an addressable scalar column.
- A mutation without `returning` may create a with-only handle, but it is not a relation source and has no columns.
- Construction must not execute SQL, flush, load entities, or materialize results; rendering remains execution-time work.
- Referencing a handle never declares it implicitly. No auto-hoisting, implicit WITH, or implicit repeated execution.
- Declaring a CTE makes its relation available, not its columns implicitly in scope. A `cte.id` expression still requires that relation in FROM/JOIN/USING or a legitimate enclosing range scope; keep declarations separate from alias bindings.
- Plain `query(mutation)` stays invalid. Set operands remain named-POJO SELECT-family inputs, even when reading mutation CTE output. Use an ordinary single-expression query over a named CTE/compound column for scalar/IN contexts, not a scalar set operand.
- `em.query` rejects any modeled write in the attached statement tree, including unused mutation declarations.
- `em.execute` accepts a SELECT-family root with writable CTEs and returns PR2's result envelope without entity hydration.
- Inspect declarations and dependencies before pruning; checking only the top-level statement kind is insufficient.
- This is modeled-write detection, not proof that arbitrary `sql` fragments or database functions are side-effect-free.

### Writable CTE Example

Use disjoint Book ids: changing and removing the same Book in one statement is not a sequencing mechanism.
The following concrete syntax is proposed, not already approved or available in the current checkout.

```ts
const b = alias(Book);
const changed = query.cte({
  update: b,
  set: { notes: "reviewed" },
  where: b.id.eq("b:1"),
  returning: { id: b.id },
  as: "changed",
});
const removed = query.cte({
  delete: b,
  where: b.id.eq("b:2"),
  returning: { id: b.id },
  as: "removed",
});
const result = await em.execute({
  with: [changed, removed],
  unionAll: [
    { from: changed, select: changed },
    { from: removed, select: removed },
  ],
});
```

- This emits one SQL statement, not two writes followed by an in-memory union.
- Both branches project compatible Book ids using PR1's column normalization and codec rules.
- Output order is unspecified without an explicit root ordering; declaration order does not establish row order.
- `rowCount` is the top-level command count, here the SELECT result count, not a sum of CTE write counts.
- To obtain individual write counts, explicitly aggregate each CTE's RETURNING relation in the consuming read query.
- A one-row count projection has top-level `rowCount: 1`, regardless of the write counts in its columns.
- Never invent per-CTE driver metadata or infer counts for no-returning CTEs.

### CTE Scope and Execution

- Declare non-recursive dependencies explicitly in dependency order in `with`; do not silently topologically reorder them.
- Reject missing declarations, forward references, self references, and cycles with separate useful diagnostics.
- Initial `with` belongs only to the execution root; reject nested declarations rather than moving them to another scope.
- PostgreSQL specifically requires writable CTEs to attach to the top-level statement, not a nested INSERT source SELECT.
- Nested reads may reference visible root CTEs; a declaration hidden inside a subtree must not leak outward.
- Keep declaration identity separate from SQL names; a different handle with the same text is not the same declaration.
- Quote CTE names and output keys as identifiers; reject duplicate declarations/names in a scope rather than silently deduplicating.
- Cover identifier truncation collisions and aliases that shadow names; never silently rebind an outer handle to an inner source.
- Prevent CTE names from redirecting an entity alias to a different relation. If intended physical tables are not explicitly schema-qualified, reject CTE names that would shadow those table references; do not assume every schema is public.
- One declaration may be referenced from multiple read branches. For two range variables in the same query, use distinct existing query wrappers/source identities rather than treating one handle as two aliases.
- PostgreSQL runs data-modifying CTEs exactly once and to completion, even when unused or consumed with `limit: 0`.
- Never prune a mutation CTE, even if a consumer, branch, condition, or join disappears.
- PR2's `values: []` no-SQL shortcut applies only to standalone inserts without declarations. In PR3, reject an empty-VALUES INSERT used as a CTE body or as a root with a nonempty `with` list, before executing any SQL. This includes unused/no-returning CTEs and roots with only read CTE declarations.
- Do not reinterpret an empty batch as DEFAULT VALUES or return early and skip declarations. Callers can explicitly omit an optional CTE, or use a valid zero-row INSERT SELECT when they need SQL execution and an empty RETURNING relation. Unlike the no-SQL shortcut, that statement can run statement-level database triggers.
- Read CTE evaluation/materialization remains PostgreSQL's choice; do not promise eager materialization or add hint APIs here.
- Sibling writes and the main statement share a snapshot; write order is not declaration order.
- Communicate changed values through RETURNING relations, not by rereading tables and assuming earlier writes are visible.
- Do not modify the same row twice across siblings or the main statement; overlap has unpredictable PostgreSQL behavior.
- Statement errors roll back the whole SQL statement. Explicit transaction rollback covers its writes under the existing driver contract.

## Proposed ON CONFLICT API

Keep this a SQL INSERT extension, not a shortcut through `em.upsert` or the entity unit of work.
Review both the object shape and `sql.excluded` before implementation; its namespace follows existing `sql.ref`.

```ts
const b = alias(Book);
const excluded = sql.excluded(b);
const result = await em.execute({
  insert: b,
  values: { id: "b:1", title: "Revised", author: "a:1", notes: "incoming" },
  onConflict: {
    target: { fields: ["id"] },
    doUpdate: {
      set: { notes: excluded.notes },
      where: b.notes.ne(excluded.notes),
    },
  },
  returning: { id: b.id, notes: b.notes },
});
```

- The Book PK example assumes PR2 permits explicit ids for this INSERT schema; retain its identity/generated-column rules.
- The author `"a:1"` must exist. Supply required Book columns, not entity factory defaults.
- Also support `onConflict: { doNothing: true }`; its target is optional.
- A supplied target uses either the `{ fields: ["id"] }` form or the `{ constraint: "books_pkey" }` form, never both.
- `fields` are domain field names resolved to known physical columns; require a nonempty, nonduplicated field list.
- Require a target for `doUpdate`, a valid nonempty PR2 `set`, and exactly one conflict action.
- Quote constraint names as single identifiers, never raw SQL; PostgreSQL validates arbiter existence and eligibility.
- Basic field inference and named constraints do not promise partial-index predicates or expression-index targets.
- Partial/expression targets, collation, and operator-class syntax require another concrete design review.
- PostgreSQL arbiters have restrictions, including non-deferrability; DO UPDATE does not support exclusion-constraint arbiters.
- `sql.excluded(b)` is a typed special handle for this INSERT target, not an alias, join source, or general query source.
- Its columns are valid only inside that INSERT's conflict expressions, with known table/field identity and compatible codecs.
- Reject use in standalone reads, another target's INSERT, ordinary UPDATE, INSERT values, or direct RETURNING.
- Validate scope per statement, including nested expressions; spelling an alias `excluded` must not bypass special-handle checks.
- EXCLUDED contains database defaults and per-row BEFORE INSERT trigger effects; never replace it with original JS values.
- Transfer EXCLUDED/source expressions as SQL storage values; encode literal assignments once and decode final RETURNING once.
- For a single conflicting input, DO NOTHING or a false conflict WHERE yields `rowCount: 0` and `rows: []`.
- A true conflict WHERE returns actual updated-row metadata and RETURNING; a nonconflicting INSERT still inserts normally.
- Conflict WHERE is optional and separate from UPDATE/DELETE's all-row guard; do not require or invent `allowAll` for INSERT conflicts.
- An undefined/pruned conflict WHERE means no conflict filter, not an automatically guarded update; document this explicitly.
- Do not silently apply UPDATE target soft-delete scoping to conflict arbitration; INSERT conflicts follow actual database uniqueness.
- Preserve PostgreSQL cardinality errors for duplicate proposed keys in one DO UPDATE statement, including INSERT FROM UNION ALL.
- Never deduplicate input rows, retry as entity upserts, or change existing `em.upsert` semantics.

## Proposed Joined DML API

Initially accept one `QuerySource` or row-shaped read `query()` value for each `from`/`using`.
Use existing `query()` joins for more complex sources instead of adding arrays or a second join DSL.

```ts
const [b, a] = aliases(Book, Author);
await em.execute({
  update: b,
  from: a,
  set: { notes: a.firstName },
  where: b.author.eq(a.id),
  returning: { id: b.id, notes: b.notes, authorName: a.firstName },
});
await em.execute({
  delete: b,
  using: a,
  where: b.author.eq(a.id),
  returning: { id: b.id, authorName: a.firstName },
});
```

- These are independent shape examples, not a recommendation to update then delete the same records.
- Validate target/source scope in SET, WHERE, RETURNING, and correlated subqueries; reject unrelated handles at runtime too.
- CTE RETURNING relations are eligible sources when explicitly declared; raw mutations and no-returning handles are not.
- Self-joins require distinct source aliases/identities; never repeat the target handle as an implicit second source.
- Preserve the source even when SET/WHERE/RETURNING do not reference its columns: zero source rows must mean zero affected rows.
- NEVER copy read join-pruning logic onto mutation FROM/USING sources. No hidden existence-changing optimization.
- Read subqueries keep their existing semantics; callers must pin existence-only inner joins there with existing `keep`/`pruneJoins` controls.
- The caller must ensure at most one UPDATE source match per target; PostgreSQL's choice among multiple matches is unspecified.
- Do not add hidden deduplication, a winner ordering, or a preflight uniqueness query that introduces a validation race.
- DELETE affects each matched target once; ambiguous source RETURNING values must not be treated as deterministic.
- RETURNING may reference valid FROM/USING columns on supported PostgreSQL versions, with source codecs preserved.
- Keep PR2's surviving-WHERE/`allowAll` guard; merely having FROM/USING or an injected soft-delete predicate is not explicit consent.
- Preserve target soft-delete defaults. Proposed source policy: a bare entity source uses normal read visibility by default; statement `softDeletes` controls the target, not every source. Use an explicit read subquery with `softDeletes: "include"` when deleted source rows are needed. Keep that subquery's own settings.
- Reject direct mutation `limit` and `orderBy`; use explicit key-selection subqueries for bounded, ordered selection.

## Separate Design Gates

- Recursive READ CTEs need a reviewed seed/self-reference API, fixed output schema, and explicit recursion semantics.
- Research PostgreSQL seed/recursive-term type resolution, unknown literals, casts, typmods, and pairwise UNION resolution first.
- Add termination, cycle, empty-seed, depth, and incompatible-schema tests before claiming recursive support.
- Recursive mutation CTE self-references are forbidden by PostgreSQL; mutations may consume recursive read CTEs once supported.
- STI writes need forced subtype INSERT discriminators and reliable subtype UPDATE/DELETE scopes, including attempts to override them.
- CTI writes need an explicit multi-table write, result/hydration, and atomicity decision; selecting a `tableName` is not an implementation.
- Keep inherited targets rejected unless the user approves those semantics and the precise supported operations first.
- Polymorphic assignment must choose one component and clear all others; assigning null clears every component.
- Resolve STI/base identity and repeated-component ambiguity deliberately, including deliberately inconsistent stored component values.
- The current poly alias is not a selectable Expr; do not fake single-column polymorphic RETURNING or assignment compatibility.
- If inheritance/poly is requested in PR3, first propose concrete semantics and scope, not partial support hidden behind table lookup.
- Direct entity set operations, entity RETURNING, entity results with extra computed columns, and automatic identity-map sync stay out of scope.
- DISTINCT ON, dedicated window APIs, and dedicated aggregate FILTER APIs are separate #1989 work, not PR3 catch-all additions.
- Window/FILTER SQL escape hatches already exist; do not represent dedicated APIs as prerequisites for this PR.

## Sequential Implementation Handoff

1. Read merged PR1/PR2 and get user review of this file's new public shapes; confirm PostgreSQL compatibility and source-filter policy.
2. Extend their shared read/statement/projection/result description with explicit CTE declarations and modeled-write classification, preserving the `query.ts`/`execute.ts` split without runtime import cycles.
3. Implement non-recursive read CTE scope/rendering first; preserve compound column ordering, codecs, and existing query regressions.
4. Add writable CTE attachment/execution without nested WITH or hoisting; retain PR2 guards and top-level result metadata.
5. Add basic conflict targets/actions and the scoped EXCLUDED handle; then add single-source UPDATE FROM and DELETE USING. Keep mutation compilation and validation in `execute.ts`.
6. Add runtime and type failure cases for every rejected shape; document PostgreSQL side effects and ambiguity before verification.
7. Run the agreed verification below, record actual results, and hand off remaining design gates without claiming them complete.

## Likely Files

- `packages/core/src/execute.ts`: statement validation/execution, writable CTE compilation, conflict handling, UPDATE FROM, DELETE USING, and mutation RETURNING.
- `packages/core/src/query.ts`: read-query compilation, CTE relation handles/scopes, and reusable projection/output descriptions; keep mutation-specific logic in `execute.ts`.
- `packages/core/src/EntityManager.ts`: thin executor delegation, EM-private permission checks, and rejection of modeled writes by `em.query`.
- `packages/core/src/Expr.ts` and `packages/core/src/Aliases.ts`: expression/source identity, scope, and EXCLUDED support without module cycles.
- `packages/core/src/serde.ts`: use PR1/PR2 key/domain/storage information; do not infer SQL transfer from decoded JS types alone.
- `packages/core/src/drivers/Driver.ts` and `packages/orm/src/drivers/PostgresDriver.ts`: reuse PR2 counts/transaction contract, no fake CTE count sum.
- `packages/core/src/EntityMetadata.ts`, `configure.ts`, `drivers/EntityWriter.ts`, and `packages/codegen/src/`: only for approved inheritance/index metadata extensions.
- `packages/tests/integration/src/EntityManager.ctes.test.ts` and `EntityManager.ctes.types.test.ts`: proposed new CTE runtime/type suites.
- Mutation-extension runtime/type files or PR2's existing mutation suites: conflicts, EXCLUDED, joined DML, guards, and decoding.
- Existing `EntityManager.rawQueries.test.ts` and `.types.test.ts`, plus PR1 compound suites: read/composition regression coverage.
- `ClassTableInheritance.test.ts`, `SingleTableInheritance.test.ts`, and `relations/PolymorphicReference.test.ts`: only if gated scope is approved.
- `docs/src/content/docs/features/queries-raw.md` and the mutation document chosen by PR2: supported APIs, restrictions, and operational warnings.

## Test Checklist

- Use full BDD Given/And/When/Then comments; after Given, explain each distinct setup condition or mutation with domain-specific And.
- Give each invalid input its own failure test, including how deliberately drifted/invalid data differs from valid state.
- Use `expect-type` for inferred rows, columns, nullability, scope, statement exclusions, and invalid API shapes.
- Use separate assertions for independent behavior, not synthetic objects/arrays created solely to group expectations.
- Prefer `toMatchEntity` where applicable, whole-array `toMatchObject` for DB rows, and `toEqual` for exact values.
- No `arrayContaining`, `objectContaining`, `toContain`, or `toMatch`, including negated/partial SQL assertions.
- Reset query recording and assert complete SQL strings with `toMatchInlineSnapshot`; never search for a convenient SQL fragment.
- CTEs: typed columns, grouping, lexical shadowing, quoted/reserved names, duplicate names, runtime identity, and binding order.
- Distinguish a declared relation from an in-scope range variable; test undeclared sources, columns referenced without FROM, physical-table name collisions, and repeated declarations versus repeated references.
- CTE compounds: reordered POJO keys, compatible codecs preserved, incompatible storage/domain codecs rejected, and correct operator grouping. Retain static/runtime scalar-operand rejection, including reusable and nested cases, and ordinary scalar/IN wrappers over named columns with non-first-branch outer references.
- Execution: one SQL call, no SQL/materialization on construction, repeated handle references, and no implicit declaration or hoisting.
- Writable CTEs: unused writes and consumers with limit zero still finish; no-returning handles execute but fail as relation sources.
- Empty batches: standalone PR2 inserts remain no-SQL; empty INSERT CTEs and empty INSERT roots with declarations reject without running any declared writes. A valid zero-row INSERT SELECT still executes its declarations and can expose an empty RETURNING relation.
- Scope failures: missing/forward/cyclic dependencies, nested writable CTEs, subtree declaration leakage, and entity/scalar CTE projections.
- Read safety: `em.query` rejects modeled mutation CTEs even when unused; direct write union operands and `query(mutation)` remain invalid.
- Counts: top-level rowCount only versus explicitly counting each RETURNING relation, including a one-row aggregate and a zero-row consumer.
- Transactions: explicit rollback, whole-statement failure, shared-snapshot reads versus RETURNING, and no procedural declaration-order assumptions.
- Preserve no automatic flush/hooks/cache sync; test post-autocommit decode failure separately from database errors and transaction rollback.
- Conflicts: optional DO NOTHING target, required DO UPDATE target, exclusive actions/targets, empty/unknown/duplicate fields, and invalid SET.
- Constraints: domain-to-column mapping, quoted injection-shaped names, and PostgreSQL errors for absent/ineligible arbiters.
- EXCLUDED: same-INSERT scope, wrong target, invalid source/RETURNING uses, compatible codecs, database defaults, and BEFORE INSERT triggers.
- Upserts: conflict WHERE true/false/pruned, no INSERT-conflict allowAll requirement, zero rows for DO NOTHING, and real counts/RETURNING.
- Duplicate proposed keys: preserve PostgreSQL cardinality errors for values and INSERT FROM UNION ALL; do not silently dedupe.
- Joined DML: deterministic unique matches, zero source rows, unreferenced sources retained, self-joins, CTE/read-query sources, and scope failures.
- Multiple matches: assert affected ids and counts only, never which source value PostgreSQL chose for UPDATE or RETURNING.
- Guards: pruning all explicit predicates, explicit allowAll, target soft-delete exclude/include, independent source visibility, and sources not replacing mutation consent.
- RETURNING: scalar expressions and supported scalar subqueries, separate direct aggregate/window rejection cases, and valid FROM/USING columns.
- Keep PostgreSQL expression-context restrictions: shared SELECT projection types do not make all SELECT expressions legal in RETURNING.

## Verification Handoff

These commands are instructions for the later implementation, not commands run while authoring this file.
From the workspace root, preserve the non-clean build path:

```bash
yarn tsdown --no-clean --log-level error && yarn typecheck:packages && yarn typecheck:consumers && node scripts/test-module-sync.mjs
```

In `packages/tests/integration`, run focused suites, adapting proposed file names to the merged implementation:

```bash
yarn test-stock --runTestsByPath src/EntityManager.ctes.test.ts src/EntityManager.ctes.types.test.ts src/EntityManager.execute.test.ts src/EntityManager.execute.types.test.ts src/EntityManager.setQueries.test.ts src/EntityManager.setQueries.types.test.ts src/EntityManager.rawQueries.test.ts --verbose=false
yarn test-lazy-preloading --runTestsByPath src/EntityManager.ctes.test.ts src/EntityManager.ctes.types.test.ts src/EntityManager.execute.test.ts src/EntityManager.execute.types.test.ts src/EntityManager.setQueries.test.ts src/EntityManager.setQueries.types.test.ts src/EntityManager.rawQueries.test.ts --verbose=false
yarn test-stock --verbose=false
yarn test-lazy-preloading --verbose=false
```

- Keep all files for one variant in one `jest --runInBand` process; never overlap focused/full runs against the same variant database.
- Different integration variants have separate databases and may run in parallel, subject to available resources.
- If codecs change, run the Temporal workspace tests sequentially from the integration directory with `JOIST_ROW_DATA=0`, then `JOIST_ROW_DATA=1 JOIST_LAZY_BINARY=1`; use the exact commands in PR2. Retain separate native decoding checks because raw SQL returns text.
- Run the relevant identifier workspace tests using PR2's commands; include the slug-ID workspace when its key paths change.
- If site docs change, run `yarn workspace joist-docs build` from the repository root; this root handoff alone does not require a docs build.
- Do not change `EntityManager.transaction`'s final flush or introduce nested savepoints to make a test pass.
- Report commands actually run, failures, skipped coverage, confirmed PostgreSQL versions, and unresolved API decisions.

## PostgreSQL References

- [SELECT](https://www.postgresql.org/docs/14/sql-select.html) and [set operations](https://www.postgresql.org/docs/14/queries-union.html): SELECT-family inputs, grouping, and consumer LIMIT scope.
- [WITH data-modifying statements](https://www.postgresql.org/docs/current/queries-with.html#QUERIES-WITH-MODIFYING): top-level placement, RETURNING relations, counts, shared snapshot, and completion semantics.
- [INSERT ON CONFLICT](https://www.postgresql.org/docs/14/sql-insert.html#SQL-ON-CONFLICT): arbiters, EXCLUDED, trigger effects, conditional updates, and cardinality errors.
- [UPDATE](https://www.postgresql.org/docs/14/sql-update.html) and [DELETE](https://www.postgresql.org/docs/14/sql-delete.html): joined sources, RETURNING visibility, command counts, and match ambiguity.
- [UNION type resolution](https://www.postgresql.org/docs/14/typeconv-union-case.html): per-column and pairwise resolution, unknown inputs, and SQL domain treatment.
- Versioned examples establish older documented behavior, not Joist's minimum version; `current` currently resolves to PostgreSQL 18.
- Do not rely on PostgreSQL 18-only old/new RETURNING syntax unless the minimum supported PostgreSQL version is confirmed and reviewed.
