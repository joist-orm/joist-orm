# PR 1: Native Set Operations

## Purpose And Sequence

Replace the in-memory UNION workaround with native PostgreSQL `UNION`, `INTERSECT`, and `EXCEPT`, including all three `ALL` variants. Keep Joist's existing SQL-shaped POJO API and typed `query()` values.

This is the first handoff in a sequential series. Complete it before [PR 2: Mutations](pr-2-mutation.md); [PR 3: Extensions](pr-3-extensions.md) builds on both. Read the other documents for architectural boundaries, not as permission to implement their features early.

Tracking issue: [#1989](https://github.com/joist-orm/joist-orm/issues/1989). The original POJO-query request is [#647](https://github.com/joist-orm/joist-orm/issues/647).

At exploration time, ordinary `em.query`/`query` support is on `main`; set operations are not implemented. Reinspect the checkout and repository instructions before starting. Use Jujutsu, preserve unrelated work, and do not assume permission to commit, push, or open a PR merely from this handoff.

## API To Add

A compound query is a separate root shape, not an extra clause on an ordinary SELECT:

```ts
const [a, b] = aliases(Author, Book);

const authorNames = {
  from: a,
  select: { name: a.firstName },
};
const bookNames = {
  from: b,
  select: { name: b.title },
};

const rows = await em.query({
  union: [authorNames, bookNames],
  orderBy: [{ name: "ASC" }],
  limit: 50,
});
// { name: string }[]
```

Exactly one operation key is allowed:

| Key            | SQL             |
| -------------- | --------------- |
| `union`        | `UNION`         |
| `unionAll`     | `UNION ALL`     |
| `intersect`    | `INTERSECT`     |
| `intersectAll` | `INTERSECT ALL` |
| `except`       | `EXCEPT`        |
| `exceptAll`    | `EXCEPT ALL`    |

- Accept ordinary read-query POJOs, nested compound POJOs, and compatible `Subquery` values created by `query()` as operands. Every operand and result must have named POJO columns, even for a single column.
- Require at least two operands. Enforce this statically for known tuples and at runtime for every input.
- Support readonly operands. Do not implicitly omit `undefined`, `null`, or `false` operands. Removing the first operand of `EXCEPT` would change its meaning.
- Allow compound `orderBy`, `limit`, and `offset`. Support `as` when constructing a named value through `query()`.
- Reject compound-level `from`, `select`, `join`, `where`, `groupBy`, `having`, `distinct`, and branch-policy options such as `softDeletes`/`pruneJoins`. Put them in operands or an outer ordinary query.
- Keep existing `Query<S, J>` usage working. Add an appropriate `SetQuery` input type rather than changing the meaning of its existing type parameters. Preserve literal inference with `satisfies SetQuery`, as with `satisfies Query`.
- Reject untracked projections, including collections widened to `SetOperand[]`, when their output keys are no longer known. This protects named-column inference and key compatibility, not scalar-versus-POJO classification.

### Reusable Query Values

```ts
const names = query({
  union: [authorNames, bookNames],
  as: "names",
});
// Subquery<{ name: string }, "names">

await em.query(names);
await em.query({
  from: names,
  where: names.name.ne(""),
  select: names,
  orderBy: [{ asc: sql<string>`lower(${names.name})` }],
});
```

Every compound `query()` value is a `Subquery`, never a scalar expression. Its columns should work in ordinary projections, joins, predicates, and outer expressions, including their encoders for comparison values and `coalesce` fallbacks.

### Grouping And Pagination

Each object owns its clauses. Parenthesize operands and preserve explicit nesting:

```ts
await em.query({
  unionAll: [
    { ...authorNames, orderBy: [{ name: "ASC" }], limit: 10 },
    { ...bookNames, orderBy: [{ name: "ASC" }], limit: 10 },
  ],
  orderBy: [{ name: "DESC" }],
  limit: 5,
});

// With compatible q1, q2, and q3:
query({ except: [{ union: [q1, q2] }, q3] });
// (q1 UNION q2) EXCEPT q3
```

Arrays associate left-to-right. Never flatten `except: [q1, { except: [q2, q3] }]` into `except: [q1, q2, q3]`. PostgreSQL gives INTERSECT higher precedence, and type resolution can also depend on grouping; do not rely on implicit SQL precedence or reassociate trees casually.

Direct compound ordering accepts output-key hashes, singly or in an array, including existing directions and undefined-direction pruning. It must not accept branch column references or arbitrary expression sorts. Use an ordinary outer query for expression ordering. Branch ordering alone does not promise final output order.

## Result Contract

### Named Columns, Not Positional Surprises

Require the same POJO key set in every operand. The first operand determines canonical output names/order, and later operands are aligned to that order:

```ts
// Compatible despite differing insertion order:
const authorSelect = { name: a.firstName, detail: a.lastName };
const bookSelect = { detail: b.notes, name: b.title };
```

PostgreSQL matches set columns by position, not aliases. Do not emit the second projection unchanged and silently exchange `name` and `detail`. Reject missing/extra keys, including at runtime for untyped inputs.

Normalize without mutating caller-owned queries. Preserve branch DISTINCT, ordering, and pagination. When reordering an existing query value, a projection wrapper over its output columns may be necessary. Do not re-expand volatile expressions or rewrite branch clauses into a different scope merely to reorder columns.

### Types And Codecs

Use each operand's actual `QueryRow`, including left-join nullability:

- UNION/UNION ALL combine compatible per-column values and nullability across operands.
- INTERSECT/EXCEPT and their ALL variants conservatively retain the left row type. Do not promise sophisticated null narrowing.
- PostgreSQL resolves a common SQL type for every operation, including EXCEPT/INTERSECT. A left-side result type does not eliminate this compatibility requirement.

The first operand chooses names, not an unchecked decoder. Establish compatible logical domains and SQL representations for each output column:

- `a.id` and `b.author` are compatible Author IDs, despite different expression/serde instances.
- `a.id` and `b.id` are not compatible: identical integer storage does not make Author IDs and Book IDs interchangeable. Do not tag Book values as Author IDs or deduplicate those domains as equal integers.
- `a.age` and `a.age.sum()` expose similar TypeScript number types but can produce int4 versus int8 driver values. Blindly selecting the first decoder can return strings or make behavior operand-order dependent.
- Enums, custom types, JSON schemas, arrays, and Temporal values also need meaningful codec compatibility, not just identical `dbType` strings or serde object identity.
- `sql<R>` is an escape-hatch type assertion, not a declared SQL type or domain converter. Do not treat the generic annotation as runtime codec information.
- Encoding matters too: a combined Author-ID column used in `.eq("a:1")` must bind the physical key correctly.

Scalar column codec metadata remains necessary for enum, custom-type, JSON, Date, Temporal, and other values inside named POJO columns, including distinctions from array codecs. Removing scalar set results does not remove support for known scalar column codecs or relax their compatibility rules.

Start with a conservative compatibility policy. Support known compatible cases and reject ambiguous cases clearly; do not add a general public coercion/decoder API without review. If SQL normalization is used, account for its effect on equality and type resolution, not just decoding. Do not introduce hidden branch-discriminator columns to select a decoder: they change UNION/INTERSECT/EXCEPT equality.

### Ordinary Scalar Subqueries

The reviewed API keeps ordinary `select: expr` scalar/IN subqueries but removes scalar set operands and results. Remove the `ScalarQuery` type, brand, and export, and the scalar-query-specific `em.query` execution overload. Restore the ordinary `query({ from, select: expr })` return type to `Expr<R | null, never>`, where `R` is its selected row type. No opaque scalar query identity is required.

Inline `em.query({ from, select: expr })` still returns scalar arrays without the scalar-expression context's extra NULL. Direct `em.query(scalarQueryValue)` execution is not a public API; do not document or add an overload for it, or broaden execution to arbitrary Expr values.

Reject scalar set operands statically and at runtime: all-scalar compounds, mixed scalar/POJO operands in either order, reusable scalar `query()` values, and scalar operands inside nested compounds. Arbitrary Expr operands also reject. A one-key POJO remains a named row, not a scalar result.

For membership, build a named ID compound and select its column through an ordinary scalar/IN subquery:

```ts
const ids = query({
  union: [
    { from: a, select: { id: a.id } },
    { from: b, select: { id: b.author } },
  ],
});
// Subquery<{ id: AuthorId }, "?">

await em.query({
  from: a,
  where: a.id.in(query({ from: ids, select: ids.id })),
  select: a,
});
```

Use the same outer `query({ from: ids, select: ids.id })` in scalar-expression contexts, and apply `.coalesce()` to that expression. The compound contributes zero or many POJO rows normally; an empty branch does not become one NULL row. The outer scalar expression adds SQL NULL for zero rows and errors for multiple rows; `.coalesce()` only handles NULL. IN-list context can consume many rows.

Also inspect `SubqueryExpr.subquerySelect` and `PolyReferenceAlias.in`: the outer scalar query selects `ids.id`, whose codec must preserve the compound's agreed output ID domain. Do not guess from the first operand's owning entity or whether it selected a PK versus an FK. Keep polymorphic read predicates distinct from the polymorphic write assignments deferred to later PRs.

## SQL Semantics And Scope

- Ordinary set operations compare complete projected SQL rows before JS decoding; SQL duplicate elimination treats corresponding NULLs as equal.
- UNION ALL adds multiplicities; INTERSECT ALL takes their minimum; EXCEPT ALL subtracts right counts with a floor of zero.
- Every operand has a local alias scope. Siblings cannot reference one another's aliases, but each may use legitimate enclosing correlations.
- When an ordinary scalar/IN subquery reads a compound, collect outer references from every operand so a correlation in any branch, including a non-first branch, keeps the appropriate outer join alive.
- Reusing an alias, condition, query value, or compound must resolve against the current parse, not cached SQL/alias strings.
- Preserve each operand's existing soft-delete, STI filtering, and join-pruning policy. Do not invent compound-wide overrides.
- Do not implicitly add LATERAL support. Existing correlated scalar/IN queries and inline derived-table sources have different SQL scope rules.

## Initial Scope And Future Boundaries

Support named POJO compounds only. Reject scalar and entity-mode operands, including reusable scalar query expressions and EntityQuery values. CTI projections contain expanded/hidden columns and can differ across a hierarchy; identity-map hydration is not set deduplication.

For entity membership, combine compatible IDs in named POJO columns and filter an ordinary entity query with `a.id.in(query({ from: ids, select: ids.id }))`, as above. This does not preserve ALL multiplicities or compound ordering.

Read-query operands must remain distinct from arbitrary statements. [PR 2](pr-2-mutation.md) will allow INSERT to consume a row-shaped read query, but UPDATE/DELETE/INSERT with RETURNING are not legal inline set operands. Future mutation CTEs expose named relations through explicit declarations; do not implement them or auto-hoist writes in this PR.

Do not add INSERT/UPDATE/DELETE, CTEs, DISTINCT ON, window/FILTER APIs, entity-plus-computed results, or a fluent builder in this PR.

## Why This API

- Root keyword keys match the existing join and condition conventions without six new free functions.
- A compound object has no implicit first SELECT. Spreading a paginated ordinary query cannot accidentally turn its branch limit into a compound limit.
- Nesting expresses grouping visibly and does not depend on JavaScript property order.
- Key alignment matches Joist's named POJO projections instead of exposing a positional SQL hazard.
- Do not add `.union()` methods to returned subquery values: selected keys can themselves be named `union`.
- Namespace helpers such as `query.union(...)` are a fallback only if the POJO form has materially worse inference/diagnostics. Do not ship both construction APIs speculatively.

## Likely Files

| File                                                                    | Work                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/core/src/query.ts`                                            | POJO-only set-query inputs/results, ordinary scalar subqueries, parser dispatch, output columns, scope, SQL, compound ordering, decoding. Revisit SubqueryHandle methods that currently assume `q.select`. |
| `packages/core/src/Expr.ts`                                             | Preserve ordinary scalar expression typing/protocol and expression output-codec information. Preserve its intentional type-only imports/load-order constraints.                                      |
| `packages/core/src/Aliases.ts`                                          | Modeled field/key/codec information if needed; do not undertake an unrelated alias-binding rewrite.                                                                                        |
| `packages/core/src/serde.ts`                                            | Semantic codec information when needed. Reuse `Column.mapFromDb`; do not recreate fake RowData adapters.                                                                                   |
| `packages/core/src/EntityManager.ts`                                    | Set-query execution overloads/inference, preserving existing read restrictions and return conventions.                                                                                     |
| `packages/core/src/index.ts`                                            | Public type exports. `packages/orm/src/index.ts` reexports core; verify rather than duplicate exports.                                                                                     |
| `packages/tests/integration/src/EntityManager.rawQueries.test.ts`       | Replace or complement the existing in-memory Author-ID UNION workaround and retain regressions.                                                                                            |
| `packages/tests/integration/src/EntityManager.setQueries.test.ts`       | Suggested new focused runtime suite.                                                                                                                                                       |
| `packages/tests/integration/src/EntityManager.setQueries.types.test.ts` | Suggested new type suite using expect-type.                                                                                                                                                |
| `docs/src/content/docs/features/queries-raw.md`                         | Describe supported operators, grouping, ordering, compatibility, and remaining limits.                                                                                                     |

Use the existing `Ctx`, `AliasAssigner`, fragment bindings/references, and projection decoder rather than a second SQL compiler. The current Plan has SQL/bindings/outerRefs/decodeRows but no general ordered output schema. Add only the shared output information required for this PR and useful to INSERT SELECT/RETURNING later; do not seed unused mutation infrastructure.

The current `query()` signature deliberately avoids an overload lattice because it hurt errors and compiler time. Check inference/diagnostics before committing to a complicated recursive type design.

## Required Tests

- [ ] All six operators: whole-row equality, duplicates within/across branches, empty results, and NULL equality.
- [ ] Three-or-more operands, left association, nested mixed operators, and right-nested EXCEPT without reassociation.
- [ ] Both inline POJOs and reusable `query()` operands; readonly tuples; invalid arity, undefined operands, and multiple operation keys.
- [ ] `satisfies SetQuery` retains literal keys; untracked projections and widened `SetOperand[]` inputs reject because known output keys are lost.
- [ ] Different POJO key insertion order aligns correctly; missing/extra keys reject even through untyped inputs.
- [ ] Compound and branch-local ordering/limit/offset stay in their own scopes; output aliases are quoted and expression ordering requires an outer query.
- [ ] Compounds return named POJO rows and `query()` produces `Subquery` values; derived sources, joins, column projections, and predicates work.
- [ ] All-scalar, mixed scalar/POJO in either order, reusable scalar, nested scalar, and arbitrary Expr set operands reject statically and at runtime.
- [ ] Ordinary `query({ from, select: expr })` retains `Expr<R | null, never>`; inline `em.query({ from, select: expr })` still returns scalar arrays without an extra NULL type.
- [ ] An ordinary scalar/IN query over a compound's named column supports many rows for IN, zero-row NULL and multiple-row errors in scalar contexts, and `.coalesce()` on the outer scalar expression.
- [ ] UNION nullability includes nullable fields and left joins in any operand; EXCEPT/INTERSECT retain a sound conservative type.
- [ ] Compatible Author PK/FK codecs work in results and subsequent bindings; Author/Book ID mixing rejects.
- [ ] Polymorphic IN predicates use the outer scalar projection's agreed compound ID codec, independent of PK/FK operand order; unsupported domains fail clearly.
- [ ] Numeric promotion/decoder disagreement is handled or rejected explicitly in either operand order; cover representative enums/custom/Temporal values.
- [ ] SQL common-type edge cases such as NULL-only operands do not acquire a falsely precise result type.
- [ ] An outer scalar/IN wrapper preserves correlations in non-first compound branches and retains the referenced outer joins; siblings cannot leak aliases; reused compounds get fresh SQL aliases.
- [ ] Branch soft-delete/STI/pruning behavior survives composition; entity-mode operands and illegal root clauses reject.
- [ ] Complete SQL snapshots and result assertions prove one database query, correct parentheses, and ordered parameter bindings.
- [ ] Original em.query/query inference, `satisfies Query`, invalid-source errors, and existing snapshots do not regress.

Use real Author/Book/Comment fixtures. The existing workaround selects Author IDs through Book and Comment queries and merges them with Set; it is a good end-to-end replacement case.

Every new test should have domain-specific Given/And setup and clear When/Then phases. Give every distinct setup condition or mutation its own And explanation. Separate invalid-input scenarios from happy paths and native-codec unit checks from SQL integration scenarios. Use expect-type, full SQL inline snapshots, and separate assertions instead of synthetic combined objects/arrays. Follow repository matcher rules; do not use partial-match/arrayContaining shortcuts.

## Verification

Jest resolves the built joist-orm package, not just the edited source. From the repository root:

```bash
yarn tsdown --no-clean --log-level error
yarn typecheck:packages
yarn typecheck:consumers
node scripts/test-module-sync.mjs
```

From `packages/tests/integration` (adapt proposed test filenames if necessary):

```bash
yarn test-stock --runTestsByPath src/EntityManager.setQueries.test.ts src/EntityManager.setQueries.types.test.ts src/EntityManager.rawQueries.test.ts src/EntityManager.rawQueries.types.test.ts src/EntityManager.queries.test.ts src/EntityManager.ctiQueries.test.ts --verbose=false
yarn test-lazy-preloading --runTestsByPath src/EntityManager.setQueries.test.ts src/EntityManager.setQueries.types.test.ts src/EntityManager.rawQueries.test.ts src/EntityManager.queries.test.ts src/EntityManager.ctiQueries.test.ts --verbose=false
yarn test-stock --verbose=false
yarn test-lazy-preloading --verbose=false
```

Keep each test variant in one Jest process because its files share a database. Distinct variants have separate databases and may run in parallel. Do not reset shared databases or run concurrent processes for one variant. Prefer the non-clean build above to avoid deleting another agent's artifacts.

Run oxlint/oxfmt on intended TypeScript files, and `yarn workspace joist-docs build` for the documentation. If codecs change, also run relevant Temporal and ID-mode suites as described in PR 2. Do not claim type tests passed from Jest alone: the tsc checks are required.

## Done Criteria

The agreed shapes work end-to-end with sound tested typing and decoding; all six SQL operations and their scope rules are documented; unsupported cases fail clearly; existing reads remain compatible. Summarize any output-column or query-value contracts PR 2 must reuse and update these handoffs if a reviewed API decision changes.

## References

- [PostgreSQL combining queries](https://www.postgresql.org/docs/current/queries-union.html)
- [PostgreSQL ordering restrictions](https://www.postgresql.org/docs/current/queries-order.html)
- [PostgreSQL set-operation type resolution](https://www.postgresql.org/docs/current/typeconv-union-case.html)
- [Drizzle set operations](https://orm.drizzle.team/docs/set-operations): checks keys/order rather than silently matching object keys.
- [Knex union scope warning](https://knexjs.org/guide/query-builder.html#union): demonstrates why branch versus compound clauses need explicit ownership.
