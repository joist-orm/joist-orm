# Session prototype

An experimental JSON-command workspace in `joist-core`, intended eventually for `joist-session`.

```ts
const session = new Session({ createEm: newEntityManager, types: [Author, Book, Tag] });
await session.apply({ op: "create", type: "Tag", key: "tag", values: {} });
const invalid = await session.validateChanges();
await session.apply({ op: "set", target: { ref: "tag" }, values: { name: "corrected" } });
const review = await session.previewChanges();
if (review.status === "valid") {
  // The application obtains approval before committing the command revision.
  const result = await session.commitChanges({ reviewToken: review.reviewToken });
}
```

## Execution

- `apply` uses ordinary entity APIs and logs caller commands. Entities and managers remain private.
- `set` accepts a `values` object like `create`, decodes its fields and references, then calls ordinary `entity.set(values)` once. Entity setters and Joist own mutation behavior and validation.
- `applyBatch(commands)` applies commands sequentially under one exclusive operation and returns their references in order. Later commands can reference entities created earlier in the batch. Each successful command is logged and advances the revision exactly as with `apply`.
- `read` returns selected fields as JSON; `find` supports metadata-backed equality filters over persisted rows, not a query overlay for staged creations.
- `validateChanges` uses the same physical staging EM across turns and recoverable validation failures, stopping before SQL writes. Successful feedback includes `scope: "pre-write"`.
- `previewChanges` replays commands on a fresh application EM and performs one dry run. It captures retained changes **after rollback**, without a flush callback.
- `commitChanges` replays that command revision on another fresh EM and calls ordinary `flush()`.

The factory supplies a new, empty writable EM with application context and plugins for every role. No plugin cloning or setter observation is involved. Serialization leaves trusted ORM access before returning JSON.

`createEm` accepts `() => EM | Promise<EM>`, so application context and plugins can be initialized asynchronously. `new Session(options)` remains synchronous and does not invoke the factory. The first operation initializes staging inside the exclusive-operation boundary; subsequent staging operations retain that same EM. Preview and commit each await the same factory for a fresh EM. Returning a previously used EM is rejected, even if it is still empty.

Factory rejection rejects the current operation without accepting its command or tainting staging. A later operation can retry initialization. Preview attempts invalidate the previous review; commit attempts consume their token before initializing the commit EM, so a factory failure there requires a new preview. Flush failures during commit still taint the Session. Disposal before first use never invokes the factory. While any operation (including initialization) is pending, concurrent operations and disposal are rejected; no initialization runs in the background.

```ts
const refs = await session.applyBatch([
  { op: "create", type: "Author", key: "author", values: { firstName: "Alice" } },
  { op: "create", type: "Book", key: "book", values: { title: "Draft", author: { ref: "author" } } },
  { op: "set", target: { ref: "author" }, values: { firstName: "Alicia", lastName: "Smith" } },
]);
// refs: [{ ref: "author" }, { ref: "book" }, { ref: "author" }]
```

A batch stops and rejects on the first failure; later commands are not attempted. Earlier successful commands remain staged and logged. As with `apply`, decoding/reference errors leave staging usable, while errors during mutation taint the Session because entity setters may already have changed it. Batches are not atomic and do not flush, validate business rules, roll back, or reconstruct staging. Call `validateChanges`, `previewChanges`, and `commitChanges` explicitly as needed.

## Dry runs

`em.flush({ dryRun: "validate" })` runs the ordinary pre-write defaults, hooks, reactions, and validation, then returns before opening a write transaction. It leaves entity and join-row persistence state pending. Validation rules are evaluated again on each attempt using those pending changes. Successful reactions remain consumed; changes to their dependencies queue new work normally. If a transition guard fails, its wave and later unprocessed transitions remain queued. Earlier successful transition callbacks are not replayed. There is no reaction checkpoint or SQL rollback bookkeeping to repair.

`em.flush({ dryRun: true })` is the full preview path. It shares the rollback mechanism used by `in-memory-writes`, including SQL, RQFs, commit rules, and transition processing. It runs once on a disposable EM; further flushes on that EM are rejected. No insert/delete flags or join-row state are restored. Entity and transaction `beforeCommit`/`afterCommit` callbacks are excluded; transaction begin callbacks retain their normal behavior.

Neither path bumps existing entities' `updatedAt` values. Preview SQL uses their unchanged database versions for optimistic locking. No timestamp snapshot or restoration is needed.

This requires removing legacy UPDATE timestamp triggers via a migration calling `dropUpdatedAtTriggers(b)` from `joist-migration-utils`. New tables no longer receive those triggers; INSERT timestamp defaults remain. Ordinary ORM flushes still advance timestamps. Other SQL writers must explicitly advance `updated_at` to participate in optimistic locking.

Pre-write validation failures remain editable; unexpected flush failures taint staging. Preview failures discard only the disposable EM. Ordinary failed flush behavior is unchanged. Dry-run calls inside existing transactions are not supported.

Repeated staging runs can accumulate domain-hook effects. Fresh replay removes that staging history from preview. SQL rollback does not undo sequence allocation or external I/O from hooks; successful-commit effects belong in after-commit callbacks or an outbox.

## Preview and commit contract

**Preview is advisory. There is no final approval comparison or mutation guard.** A review token binds a command revision, not exact final database writes. Fresh commit may observe different data and produce different hook/RQF output; ordinary concurrency enforcement still applies within that commit EM. Transaction callbacks may also reject a commit that passed preview.

Caller edits invalidate tokens. A commit attempt consumes its token; success closes the Session. Commit errors conservatively taint it because an error may occur after durable commit. Authoritative comparison of the final write set is deferred to a separate design.

Changes include stored original/new field values, entity operations/touches, and tracked many-to-many deltas. Owning foreign keys represent one-to-many moves; inverse many-to-many views can both appear. Explicit creations use command keys, existing entities use tagged IDs, and hook creations have diagnostic `@Type:n` identities that cannot be command targets.

## Limits

### Partial staging feedback

Staging returns just after `runValidation` and before `driver.transaction` in `EntityManager.flush`. Ordinary reaction processing leaves query reactions queued until the post-write loop, which staging does not execute. Preview runs the full pipeline on a fresh disposable EM.

This is more than skipping the RQF loop while still writing SQL: that would retain most rollback bookkeeping. The smaller design is **pre-write validation on staging, full rollback-only execution on a disposable preview EM**.

`status: "valid", scope: "pre-write"` means “no pre-write errors found,” not complete validity. RQF values can be stale or unset; checks depending on them are not authoritative until preview. The fixture's `Publisher.numberOfBookReviews` rule is a concrete example. Existing pre-write rules still run; this prototype does not classify and selectively defer arbitrary application callbacks. An arbitrary hook can explicitly load an RQF, so this is not a promise of zero query execution. Commit rules and database constraints are preview-only.

### Current API limits

- Initial codecs cover JSON primitives/objects/arrays, Dates, enum codes, and entity references. Lazy/custom codecs, large/one-to-one mutations, and enum-collection commands remain unsupported.
- Commands that fail during mutation taint the workspace rather than permit silently unlogged partial edits. Errors detected before mutation do not taint it.
- No arbitrary entity methods, persistent logs, SQL recording/replay, or commit-to-staging reconciliation.
- Native SQL and external I/O in application hooks retain ordinary ORM semantics; Session is not a sandbox.

Integration coverage lives in `packages/tests/integration/src/Session.test.ts`:

```sh
yarn workspace joist-tests-integration test-stock Session.test.ts
```
