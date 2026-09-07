# PR2 Implementation Handoff

## Table Cutover Update

This section supersedes earlier API and metadata descriptions below; verification sections remain historical and do not certify the current cutover.

- SQL-shaped `em.query`, `query`, and `em.execute` now use `table`/`tables` and `Table<T>`. `alias`/`aliases` and `Alias<T>` are only for `em.find` domain filters. `Tables.ts` owns SQL expressions/joins; `Aliases.ts` retains find predicates.
- Physical column references use `a.first_name` and `b.author_id`. VALUES, UPDATE SET, and INSERT SELECT output keys also use physical names. **The old PR2 DOMAIN assignment requirement is explicitly obsolete:** do not accept or restore `author`/`firstName` assignment keys as compatibility aliases. Values retain existing domain codecs and public IDs.
- Ordinary read and RETURNING output keys remain arbitrary, i.e. `{ firstName: a.first_name, authorId: b.author_id }`. Derived sources expose those chosen keys. An INSERT source must instead project target physical keys.
- Preserve relationship `.author.as(...)`/`.books.as(...)` join sugar and polymorphic `.parent.eq/ne/in` predicate sugar. Relation names are not selectable FK expressions or supported assignment keys. `select: a` still hydrates root-table entities through the identity map; table/entity RETURNING remains excluded.
- Generated `AuthorColumns`/`BookColumns` and `ColumnsOf<T>`, connected through `TypeMap.columnsType`, describe physical keys and value types with direct boolean `nullable`, `insert: "required" | "optional" | "never"`, and boolean `update` properties. Neither `Columns` nor domain `Fields` descriptors have a nested `columns` tuple. `Fields` have no SQL policies and retain domain `nullable: undefined | never`. Runtime `EntityMetadata.columns` maps each physical key to its owning `fieldName`; table expressions and mutations reuse existing serde columns, physical facts, and codecs. The earlier description of mutation inference from domain field tuples through `Aliases.ts` is superseded by this split.
- This is the table cutover only. CTI/STI mutation targets, polymorphic assignments, entity RETURNING, CTEs, upserts, UPDATE FROM, and DELETE USING remain excluded. No PR3 features are introduced.
- Documentation checks: `yarn workspace joist-docs build` passed with the existing non-fatal missing `404` content-entry warning; scoped `git diff --check` passed. These checks validate documentation output/whitespace, not TypeScript snippets or runtime cutover behavior. No runtime or typecheck result is claimed by this docs-only update.

## Revision And Scope

- The current Jujutsu working copy is `kzqmwtpm`, on parent `rrlyyoxn` (`fa6b4310`). The user's checkpoint and uncommitted default-policy simplification are preserved.
- No commit or history operation was performed for the simplification. Replace this working-copy reference with the reviewed merge revision before starting PR3.
- No commits, pushes, PR creation, database resets, or PR3 features were performed. The latest request authorized additive test-model migrations, described below. Earlier verification sections are historical, not the current test inventory.

## Public API

- `EntityManager.execute` accepts INSERT VALUES, INSERT SELECT, UPDATE, DELETE, and existing executable read inputs. Every result is `ExecuteResult<R>`, with native `rowCount` and decoded `rows`.
- Public types: `InsertStatement<T, Returning, Source>`, `UpdateStatement<T, Returning>`, `DeleteStatement<T, Returning>`, `MutationStatement<T, Returning>`, `InsertValues<T>`, `UpdateValues<T>`, `MutationReturning`, and `ExecuteResult<R>`.
- Default INSERT annotations support VALUES and ordinary named sources. Use a concrete third `Source` type for joined/compound source annotations; inline execution infers these sources without explicit type arguments.
- No RETURNING means `never[]`; scalar RETURNING returns scalar elements. Entity/table-shaped RETURNING is excluded.
- `query` and `em.query` reject mutation inputs. Scalar `query()` values remain expressions, not public executable statements; inline scalar-select POJOs remain executable reads.

## Implementation Boundaries

- `packages/core/src/execute.ts` owns inference checks, classification, validation, compilation, and result handling. Internal entry points are `isMutation`, `parseStatement`, and `decodeStatementResult`.
- `EntityManager.execute` applies private permissions, delegates compilation, invokes the driver, and attaches error context. It never flushes or repairs caches.
- Shared read internals are `Plan`, `QueryOutput`, `Ctx`, `projectionToSql`, `conditionToSql`, `injectedConditions`, `parseUserQuery`, `isReadQueryValue`, and `CheckReadQuery`. These are not new public free-function APIs.
- `QueryOutput.columns` remains an ordered array of `[key, BaseExpr]`. Expression `sqlNullable` describes known physical output nullability, including LEFT joins and compound branches. `sqlSource` identifies direct column sources for that analysis.
- `BaseExpr.outputType` describes shared read/filter and SQL transfer compatibility. INSERT SELECT compares its SQL type, domain, and ID metadata. Supported custom/Temporal arrays use elementwise filter encoding; physical enum-table arrays remain unknown because their null-element conversion differs from scalar enum aggregates.
- Read roots now reject unsupported clauses, malformed predicates, and invalid option values recursively, including in scalar subqueries. Deferred condition resolution returns copies, so frozen reusable predicates no longer mutate during compilation.
- Alias decoding converts internal tagged keys to configured public IDs. Value writes normalize public IDs with metadata-aware helpers; untagged TEXT IDs retain embedded delimiters and tag-like prefixes.

## Physical Metadata And Codecs

- Runtime `Column` carries optional `sqlNullable`, `hasDefault`, and `isGenerated` facts. Codegen passes these as the final serde constructor argument using existing `notNull`, `columnDefault`, and `columnGenerated`. Nullability is `!notNull`; default availability is `columnDefault != null && !columnGenerated`. Built-in single-column serdes initialize their own column properties explicitly; their `columns = [this]` identity and codecs remain unchanged. The optional argument uses an inline Pick of the existing Column properties; omitted facts remain unknown. No supplemental catalogs, metadata abstraction, or registration layer is used. Polymorphic mutation support is unchanged.
- Generated physical column descriptors carry direct nullability and write policies from `columnNotNull`, independent of strengthened STI domain nullability. `execute.ts` and `Tables.ts` read these direct properties; domain `Fields` carry no SQL policies. STI and CTI mutations remain excluded. Runtime mutation checks still read `field.serde.columns[0]`, with timestamp omission from `EntityMetadata.timestampFields`; codegen uses `meta.createdAt`/`meta.updatedAt`.
- Old metadata remains valid for existing APIs. Immediate mutations require regenerated, supported physical metadata rather than guessing from `OptsOf`, `required`, config defaults, or derived flags.
- `supportsEmExecute` on codegen metadata, runtime metadata, and generated `TypeMap` entries gates mutation targets only, not read execution through `em.execute`. The flag has no compatibility alias.
- Timestamp omission follows the existing `getTimestampConfig`/metadata mapping for `createdAt` and `updatedAt`, without inspecting trigger bodies, catalog attachments, or enablement. There is no new public trigger/provider override. PostgreSQL enforces actual constraints when a fixture or application has no default/trigger.
- Generated expression fields are omit-only, including explicit DEFAULT. Conventional numeric primary keys are optional on INSERT; UUID/text keys without SQL defaults remain required. There is no generic ALWAYS/BY DEFAULT identity policy; PostgreSQL enforces explicit-ID restrictions. UPDATE primary keys are forbidden. Ordinary persisted derived columns remain writable, and Book.author/notes and Author.numberOfBooks retain physical requiredness.
- `Column.mapToDbValue?` is the optional entity-independent write capability. Existing built-in serdes implement it and share it with entity writes. External columns remain compatible with reads/entity writes; bound mutation values require this capability. SQL expressions and SQL NULL are classified before encoding.
- Custom element-mapper arrays are generated with their domain element type, physical array type, and array/nullability flags. Numeric and bigint arrays have elementwise codecs. Unknown codec representations are not assumed compatible.
- Unsupported target storage remains gated: native PostgreSQL enum arrays, SQL JSON/schema arrays, Date-mode date/timestamp arrays, and declared multidimensional arrays. JSON-stored JavaScript arrays are distinct from SQL arrays.
- Fixtures were regenerated through the existing codegen workflows. A ReactionLogging snapshot changed only because the generated AuthorCodegen rule line moved.

## Driver And Transaction Contract

- Breaking driver contract: required `Driver.executeQuery` returns `DriverQueryResult`, `{ rowCount: number | null, rows: any[] }`, with no compatibility alias or fallback. `em.query` and `executeFind` extract rows and retain their public rows-only contracts.
- PostgreSQL preserves the native command count, including null for DDL, with unchanged SQL conversion, logging, and `em.txn`/pool routing. `em.execute` alone validates nonnegative finite integer counts during result decoding, never using `rows.length`. Bun's incomplete raw-query method throws before SQL for both reads and mutations.
- UPDATE/DELETE validate the user guard before adding soft-delete filters. `allowAll: true` is explicit consent, not a filter override. DELETE is physical.
- A validated standalone `values: []` produces no plan and returns zero without SQL. **PR3 must not reuse this shortcut for a CTE body or a root with declarations.** Unknown declarations are currently rejected before this shortcut.
- Mutations enforce write mode and flush-lock checks and reject `in-memory-writes`. Read execution retains validation-rule read guards.
- No implicit transaction, savepoint, retry, hooks, defaults, validation, reactions, optimistic locking, or identity-map synchronization is added. Database triggers still run.
- Autocommit RETURNING decode failure can leave the write committed. Propagating the error out of `em.transaction` rolls it back. Successful transaction callbacks still trigger the existing transaction-end flush.

## Breaking Driver Contract Verification

- Non-clean `yarn tsdown --no-clean`, all package and consumer typechecks (including Bun), and `node scripts/test-module-sync.mjs` pass. Final typechecks and module-sync were repeated after formatting.
- Full `test-stock`: 171 suites, 2,400 tests, 164 snapshots pass; 7 suites and 23 tests remain skipped. Full `test-lazy` (not lazy-preloading): 171 suites, 2,401 tests, 164 snapshots pass; 7 suites and 22 tests remain skipped. Each database ran in band. Preloading variants were not run, and no schema migrations or database resets were performed.
- Core: 9 suites, 177 tests, 13 snapshots pass. Codegen: 13 suites, 87 tests, 2 snapshots pass with `NODE_OPTIONS=--experimental-vm-modules`.
- Temporal classic and lazy modes ran sequentially: 6 suites, 80 tests, 13 snapshots pass per mode. Number IDs (13), untagged IDs (24), UUID IDs (19), slug IDs (7), immediate foreign keys (8), schema-misc (12), ESM (8), Vitest (11), and Bun smoke tests (2) pass.
- The incomplete Bun SQL suite remains intentionally skipped. A direct Bun runtime assertion confirms `BunPgDriver.executeQuery` throws its explicit unsupported error without submitting SQL.
- Scoped lint and formatting checks pass. Repository source, benchmark, documentation, and handoff searches found no remaining references to the removed method. No fixture metadata regeneration, schema changes, commits, or resets were needed.
- Initial stock/lazy runs exceeded the tool's 120-second limit; longer full reruns passed. The first stock run also reported a foreign-key setup failure in `EntityManager.setQueryCodecs.test.ts` that did not reproduce on the full rerun. The first codegen invocation lacked the VM-modules flag; rerunning with the flag passed. No tests were changed or skipped to work around these failures.

## Original Implementation Verification

- Non-clean tsdown build, package typechecks, consumer typechecks, and module-sync verification pass.
- Focused stock mutations/types/execution boundaries/read/transaction/mode/driver regressions: 264 tests and 80 snapshots pass.
- Full stock: 171 suites, 2,404 tests, and 167 snapshots pass (23 existing skipped tests). Full lazy-preloading: 171 suites, 2,405 tests, and 167 snapshots pass (22 existing skipped tests).
- Core: 177 tests and 13 snapshots passed. Codegen originally had 139 tests and 26 snapshots; the simplification removes identity and trigger-certification tests, retains generated/default coverage through pg-structure, and moves the real numeric-array codec round trip into integration mutation coverage.
- Temporal classic and lazy-binary modes, run sequentially: 80 tests and 13 snapshots pass per mode.
- Number IDs: 13 tests pass. Untagged IDs: 24 tests pass. UUID IDs: 19 tests pass. Slug-ID and immediate-FK regressions also passed during implementation.
- Scoped lint/format checks pass. Docs build passes with a non-fatal missing `404` content-entry warning.
- Initial failures were resolved, not skipped: the explicit-ID test marks its sequence for fixture cleanup; projection validation retains one enumeration; generated line-number snapshots were updated; Temporal inline snapshots were captured once before exercising both reusable forms.
- Existing fixtures have a TEXT primary key but no FK targeting a TEXT key. Real TEXT PK and UUID FK round trips are covered; a real TEXT-FK fixture was not invented for this task.

## Simplification Verification

- Regenerated all fixture workspaces with root `yarn codegen` (`yarn workspaces foreach --all run codegen`), including the existing integration/ESM GraphQL workflow. Ran it again after applying numeric-ID convention policy. Both runs exited successfully. The immediate-FK fixture emitted its existing nine non-deferred-FK warnings and T3/T4 required-FK cycle diagnostics; no migration or database reset was run.
- Final root `yarn build` passed: clean, tsdown, `typecheck:packages`, `typecheck:consumers`, and `node scripts/test-module-sync.mjs`. The clean build also removes obsolete compiled loader artifacts.
- From `packages/tests/integration`, `NODE_OPTIONS=--experimental-vm-modules yarn jest --config ../../codegen/jest.config.cjs --runInBand`: 13 suites, 124 tests, 25 snapshots passed. Real generated expressions/falsy defaults are tested through pg-structure; timestamp tests cover snake-case, camel-case, and configured names without triggers.
- From the same directory, `yarn jest --config ../../core/jest.config.cjs --runInBand`: 9 suites, 177 tests, 13 snapshots passed.
- `yarn test-stock EntityManager.execute EntityManager.rawQueries EntityManager.transaction EntityManager.mode PostgresDriver`: 8 matched suites, 252 tests, 80 snapshots passed. `yarn test-lazy-preloading EntityManager.execute`: 3 suites, 133 tests, 42 snapshots passed. Transaction behavior is covered by the execute execution tests; there is no separate file matching the transaction argument.
- Fixture tests were invoked from integration using `yarn --cwd ../<fixture> test`: number-ids 13 tests, uuid-ids 19, untagged-ids 24, slug-ids 7, and immediate-foreign-keys 8 passed (2 existing skipped tests; 5 snapshots passed).
- Temporal ran sequentially with `JOIST_ROW_DATA=0 yarn --cwd ../temporal test` and `JOIST_ROW_DATA=1 yarn --cwd ../temporal test`: 6 suites, 80 tests, 13 snapshots passed per mode.
- Scoped `oxlint` and `oxfmt --check` passed for all manually changed TypeScript files. `yarn workspace joist-docs build` passed, with the existing non-fatal missing `404` content-entry warning.
- Initial verification failures were resolved: codegen Jest needs the VM-modules flag for Prettier; consumer checking caught the test's pg-structure import and a Knex binding type mismatch (the relocated codec test now uses the native pg pool); scoped lint caught duplicate/unsorted imports. Directly passing sibling Jest configs from integration loaded integration's `.env`, causing wrong-schema ID/Temporal failures; the corrected workspace-script invocations above all passed. No schema changes were made to work around those failures.
- Remaining tool warnings are non-fatal: TypeScript 7's experimental build API and pg-structure's concurrent queries on one pg Client (deprecated for pg 9). Full stock/all-variant suites were not repeated for this simplification; their earlier results above are historical.
- No open policy decision or new public configuration remains. The PR2/PR3 design documents were left unchanged; this handoff and the raw-query user documentation describe the approved implementation policy.

## Column Refactor Verification

- Physical metadata lives on the existing serde columns. The current constructor initialization supersedes the earlier post-construction initialization. Public aliases, `em.query`, and `em.execute` retain their APIs.
- Root `yarn codegen` regenerated every fixture workspace. The existing immediate-FK diagnostics remain; no migrations, clean/reset scripts, or commits were run.
- `yarn tsdown --no-clean`, `yarn typecheck:packages`, `yarn typecheck:consumers`, and `node scripts/test-module-sync.mjs` passed. Scoped lint and formatting passed for the manually edited TypeScript files.
- Full core: 177 tests, 13 snapshots. Full codegen with `NODE_OPTIONS=--experimental-vm-modules`: 124 tests, 25 snapshots. Snapshot changes are inline only.
- Stock execute/execution/types and set-query codecs: 141 tests, 42 snapshots. Stock raw/set/ordinary queries and the execute driver: 517 tests, 71 snapshots. Lazy-preloading execute/raw/set queries and codecs: 422 tests, 109 snapshots.
- Temporal classic and lazy-binary modes: 80 tests, 13 snapshots per mode. Number IDs: 13 tests. Untagged IDs: 24 tests. UUID IDs: 19 tests. Use `yarn --cwd ../<fixture> jest --runInBand` from integration: sibling configs alone load integration's `.env`, and their global setup overwrites even an explicitly supplied `DATABASE_URL`.
- Added missing-fact coverage for each optional physical Column property: INSERT/UPDATE fail before SQL, while both read APIs remain usable. Temporal's deliberately mismatched replacement codec preserves the original physical facts so the test still checks codec compatibility.
- No unresolved implementation failures. Full integration/all-variant suites and the docs build were not repeated for this refactor; earlier results above are historical.

## Columns Initializer Correction

- Historical verification below covers the earlier post-construction initializer, now removed along with its symbol and isolated tests. Constructors now initialize the existing optional Column properties directly, without a runtime helper or wrapper.
- Root `yarn codegen` regenerated all fixture workspaces through the existing workflow. The existing immediate-FK warnings and cycle diagnostics remain. No clean scripts, migrations, database resets, commits, or history changes were run.
- `yarn tsdown --no-clean`, package and consumer typechecks, and module-sync passed. Scoped lint and formatting passed.
- Full core: 180 tests, 13 snapshots. Full codegen: 124 tests, 25 snapshots (also rerun without snapshot updates). Focused stock execute/execution/types and raw-query/types: 229 tests, 76 snapshots. Temporal classic and lazy-binary, sequentially: 80 tests, 13 snapshots per mode. Number IDs: 13 tests. UUID IDs: 19 tests. Untagged IDs: 24 tests. Full integration/all-variant suites and docs build were not repeated for this correction.

## Real-Column Test Simplification

- Removed all 30 newly added cases from `EntityDbMetadata.test.ts`: custom serde parameter cases, the entire physical SQL facts block (including its ad-hoc PostgreSQL table), and `sqlTable`. Removed 18 inline snapshots and 543 lines. The 21 original naming/conflict/canonicalization cases, their comments, and `fakeMeta`/`asDb` are unchanged.
- Replaced the integration test that manually constructed numeric codecs with a real `AuthorStat` INSERT VALUES / INSERT SELECT / UPDATE regression. Added one custom password-history regression and one generated-search/falsy-default regression, for a net increase of two integration tests. No new test constructs codecs, patches runtime metadata, or mocks a schema.
- Added only three nullable columns in `1788652800000_native_arrays.ts`: `users.password_history` (`text[]`, configured with the existing PasswordValue element mapper), `author_stats.decimal_samples` (`numeric[]`), and `author_stats.bigint_samples` (`bigint[]`). Existing factories need no new inputs. `User` already owns passwords; `AuthorStat` already exercises native numeric storage. No new entity was invented.
- Password history is written through the generated entity setter and normal flush, then decoded by `em.execute` through scalar/named mutation RETURNING subqueries. User's CTI family remains an excluded mutation target. Numeric arrays exercise direct mutation binding, SQL-only copying, and RETURNING. Both regressions distinguish nonempty arrays, empty arrays, and SQL NULL; bigint values exceed Number's exact range. Expect-type checks cover generated getters, custom assignment element types, mutation results, and invalid numeric/custom element inputs.
- Coverage audit retained existing Book SQL defaults versus configuration-only author/notes defaults, required derived Author counts, nullable derived storage, enum/native/JSON arrays, scalar custom passwords, and the Temporal fixture's real temporal arrays/defaults. Existing PostgreSQL falsy defaults are Author.isFunny=false, Publisher.numberOfBookReviews=0, and User.bio=''. The new Author execute regression explicitly asserts false and nullable bookComments, plus PostgreSQL recomputation of the existing generated `authors.ts_search` column. The User regression also checks stored empty bio.
- No mapped generated field was added: normal entity flush does not skip mapped generated columns. The existing ignored generated tsvector remains the real fixture, with existing assignment rejection plus new INSERT/UPDATE recomputation coverage. This does not claim mapped-generated-field unit-of-work support or replace every removed theoretical exclusion with a new fixture.
- Applied the additive migration using `yarn migrate` from integration for the configured `joist` codegen database, then `DATABASE_URL=postgres://joist:local@localhost:5435/joist_stock yarn tsx ../../migration-utils` and `DATABASE_URL=postgres://joist:local@localhost:5435/joist_lazy yarn tsx ../../migration-utils`. Each applied only the new migration; no reset, clone, clean, or history operation ran.
- Integration `yarn codegen` ran the normal ORM and GraphQL workflow twice with stable output. Only UserCodegen, AuthorStatCodegen, and their runtime metadata changed; GraphQL outputs had no diff. Other fixture schemas and Temporal were unchanged and did not need regeneration or full-variant reruns.
- Root `yarn tsdown --no-clean`, `yarn typecheck:packages`, `yarn typecheck:consumers`, and `node scripts/test-module-sync.mjs` passed. Scoped `yarn oxlint` and `yarn oxfmt --check` passed for the manually edited TypeScript/config files.
- From integration, `NODE_OPTIONS=--experimental-vm-modules yarn jest --config ../../codegen/jest.config.cjs --runInBand`: 13 suites, 94 tests, 7 snapshots passed. `yarn jest --config ../../core/jest.config.cjs --runInBand`: 9 suites, 180 tests, 13 snapshots passed.
- Final focused `yarn test-stock EntityManager.execute`: 3 suites, 138 tests, 42 snapshots passed. Consumer typechecking was repeated after the final generated-search test and passed.
- Full `yarn test-stock`: 171 suites, 2,410 tests, 167 snapshots passed; 7 suites/23 tests retain existing skips. Full `yarn test-lazy`: 171 suites, 2,411 tests, 167 snapshots passed; 7 suites/22 tests retain existing skips. Stock/lazy ran concurrently on their distinct databases, each in one in-band Jest process. No snapshot updates were needed.
- The first full stock/lazy invocations hit the tool's 120-second timeout with no reported test failures. Complete reruns with a 360-second limit passed in 136/139 seconds. Build warnings about TypeScript 7's experimental API and plugin timing, and Jest's VM-modules warning, were non-fatal. No unresolved test/build failure remains.

## Descriptor Nullability Simplification

- Codegen uses existing `notNull` for tuple policy, runtime `sqlNullable`, and custom/numeric/bigint array serde flags. No duplicate nullability or default property, original-column fallback, or physical inheritance machinery remains. Runtime `Column` and serde column arrays are unchanged; physical facts now initialize in constructors.
- Generator fixtures now use consistent `notNull` values instead of artificial physical/domain drift. No removed `EntityDbMetadata` tests were restored, and no read type tests were weakened or removed.
- Non-clean `yarn tsdown --no-clean --log-level error` preceded root `yarn codegen`. All fixture workspaces regenerated successfully through their normal scripts, including GraphQL. Only integration's LargePublisherCodegen, SmallPublisherCodegen, TaskNewCodegen, TaskOldCodegen, and metadata changed. LargePublisher.rating/spotlightAuthor and TaskOld.specialOldField now use strengthened nullability. Subtype field interfaces omit locally redeclared storage fields from their base interface so those declarations replace incompatible base tuples.
- Reviewed the complete generated diff: no other fixture or GraphQL output changed. User.passwordHistory still passes `true, true` (array, nullable) to CustomSerdeAdapter; AuthorStat.decimalSamples/bigintSamples retain the same flags. All three retain `sqlNullable: true`. No existing STI array fixture changed flags.
- Package and consumer typechecks and module-sync passed. Full core: 9 suites, 180 tests, 13 snapshots. Full codegen: 13 suites, 87 tests, 2 snapshots. Full stock: 171 suites, 2,410 tests, 167 snapshots (23 existing skipped tests). Full lazy: 171 suites, 2,411 tests, 167 snapshots (22 existing skipped tests). The full integration runs include execute/execution/types, ordinary/raw/set reads and codecs, and STI/CTI inheritance tests; each variant ran in one in-band process on its own database.
- Initial checks caught snapshot indentation and the inherited tuple conflict; both were fixed without weakening supported read assertions. Existing immediate-FK warnings/cycle diagnostics and the VM-modules warning remain non-fatal. No migrations, database resets, clean builds, commits, or history changes were run. Other variants, sibling fixture tests, and the docs build were not repeated for this change.
- GraphQL codegen: 7 suites, 33 tests, 36 snapshots passed. Scoped lint and formatting checks passed for all five manually edited TypeScript files. Repository search found no remaining duplicate descriptor property references.

## Constructor Initialization Verification

- Single-column serde constructors accept an optional final `column?: Pick<Column, "sqlNullable" | "hasDefault" | "isGenerated">` and explicitly assign each property. Date inherits the PrimitiveSerde constructor; Temporal constructors forward the argument to CustomSerdeAdapter. Existing constructor calls remain valid and omitted facts remain `undefined`.
- Generated `Field.serde` entries now construct serdes directly with the three facts in the last argument. Existing array flags precede that argument, with `false, false` for scalars. The codegen-only `columnOptions` function emits the object literal; it adds no runtime helper or metadata type. Field column tuples, column identities, mutation consumers, and polymorphic support are unchanged.
- Removed the post-construction initializer, its exported/codegen symbol, and its three isolated tests. Updated existing shared-query test constructors without adding mocked metadata tests. Preserved the user's AGENTS.md and generator-test edits; no snapshot updates were needed.
- Root `yarn codegen` regenerated all fixture workspaces. Non-clean tsdown, package and consumer typechecks, and module-sync passed. No migrations, database resets, clean scripts, commits, or history changes were run.
- Core: 9 suites, 177 tests, 13 snapshots. Codegen: 13 suites, 87 tests, 2 snapshots. Full stock: 171 suites, 2,410 tests, 167 snapshots, with 23 existing skipped tests. Full lazy: 171 suites, 2,411 tests, 167 snapshots, with 22 existing skipped tests.
- Temporal classic and lazy-binary ran sequentially: 80 tests and 13 snapshots each. Number IDs: 13 tests. UUID IDs: 19 tests. Untagged IDs: 24 tests. Slug IDs: 7 tests. Immediate foreign keys: 8 tests, 5 snapshots, with 2 existing skipped tests.
- Scoped lint/format checks and the docs build passed. Existing immediate-FK diagnostics, the VM-modules warning, and the missing `404` docs warning remain non-fatal. No unresolved verification failures remain.

## Shared Output Compatibility

- INSERT SELECT and compound reads now compare the same `outputType`; the duplicate SQL-transfer descriptor, forwarding getters, and array helper are removed. No production metadata type, registry, or capability framework was added.
- Custom array filters encode each element with the same mapper used by writes. Scalar filter behavior and SQL NULL bypass are unchanged. Physical custom/Temporal arrays use their SQL array type and mapper identity, distinct from aggregate array domains because physical null elements reach the mapper.
- Known native custom arrays and the four Temporal array types support compound filters and decoding. Custom numeric arrays remain unknown because classic pg numeric-array elements differ from scalar numeric text. Unknown array parsers, nested arrays, and physical enum arrays do not gain compatibility. Physical enum arrays and custom arrays with unknown codecs now reject INSERT SELECT before SQL; their bound writes and RETURNING remain unchanged.
- Real User password-history tests cover populated, empty, and SQL NULL arrays through direct `em.query`, derived UNION predicates, and `em.find`, with generated-domain type assertions. Existing real Author/Book Temporal tests now also exercise direct and derived array predicates for all four Temporal types. Existing successful Temporal INSERT SELECT coverage is unchanged.
- Non-clean tsdown, package/consumer typechecks, module-sync, and scoped lint/format checks pass. Core: 9 suites, 177 tests, 13 snapshots. Focused stock execute/set-query tests: 5 suites, 326 tests, 74 snapshots. Full stock: 171 suites, 2,399 tests, 164 snapshots, with 7 suites/23 tests skipped. Full lazy: 171 suites, 2,400 tests, 164 snapshots, with 7 suites/22 tests skipped. Temporal classic and lazy ran sequentially: 6 suites, 79 tests, 13 snapshots each.
- Initial verification found the obsolete scalar-array filter assertion, the obsolete physical Temporal-array rejection, and an invalid array-shaped `where` in the new Temporal coverage. These were corrected; no successful behavior test was weakened. Initial full integration runs exceeded 120 seconds without reported failures; full reruns passed with a 300-second limit. No unresolved failures remain.
- No codegen, decoder-source, schema, migration, reset, clean, or history changes were needed. Native-ID fixtures, preloading variants, codegen tests, and the docs build were not repeated for this change.

## PR3 Gates

- Continue to reject CTE declarations, conflict/upsert clauses, UPDATE FROM, DELETE USING, inherited mutation families, polymorphic assignments, and entity RETURNING until PR3 semantics and tests exist.
- Use `outputType` for shared read/filter conversions and SQL transfer. Do not infer a codec from `sql<R>`.
- Keep INSERT source scopes independent from target RETURNING scopes, preserve branch correlations, and keep source rows entirely in SQL.
- Review the proposed PR3 syntax with the user as required by its handoff. This implementation does not approve additional extension syntax or begin PR3.
