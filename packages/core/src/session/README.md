# Session prototype

An experimental JSON-command workspace in `joist-core`, intended eventually for `joist-session`.

```ts
const session = new Session({ createEm: newEntityManager });
await session.apply({ op: "create", type: "Tag", $clientId: "t#7", values: {} });
const invalid = await session.validateChanges();
await session.apply({ op: "update", entity: "t#7", values: { name: "corrected" } });
const review = await session.previewChanges();
if (review.status === "valid") {
  // The application obtains approval before committing the command revision.
  const result = await session.commitChanges();
}
```

## Execution

- `apply` uses ordinary entity APIs and logs caller commands. External command callers receive JSON only.
- `update` accepts a `values` object like `create`, decodes its fields and references, then calls ordinary `entity.set(values)` once. Entity setters and Joist own mutation behavior and validation.
- `applyBatch(commands)` applies commands sequentially under one exclusive operation and returns their IDs in order. Later commands can reference entities created earlier in the batch. Each successful command is logged and advances the revision exactly as with `apply`.
- `read` returns selected fields as JSON.
- `query(callback)` lets trusted application code use ordinary ORM read APIs on the current staging EM. The callback is not a command and is never replayed.
- `validateChanges` uses the same physical staging EM across turns and recoverable validation failures, stopping before SQL writes. Successful feedback includes `scope: "pre-write"`.
- `previewChanges` replays commands on a fresh application EM and performs one dry run. It captures retained changes **after rollback**, without a flush callback.
- `commitChanges()` replays the current commands on a fresh EM and calls ordinary `flush()`. Preview and approval are optional caller policies.

### Application-owned queries

An adapter can build an ordinary ORM query from validated request data without adding a
Session-specific query command:

```ts
const books = await session.query(async (em) => {
  const entities = await em.find(Book, { title: "Draft" }, { limit: 100_000 });
  return Promise.all(entities.map((entity) => readSessionEntityData(entity, ["title", "author"])));
});
```

Import `readSessionEntityData` from `joist-orm` to reuse Session's selected-field JSON
serialization, including client IDs for new relationship targets. The callback can
instead return its own application-defined projection.

The callback is trusted application code, never code supplied by an external caller.
It receives normal application permissions, not the ORM's privileged execution context.
It must not mutate, flush, retain the EM/entities, or return live entities to external
callers. These are caller responsibilities, not sandbox guarantees. Adapters must validate
their allowed types, filters, projections, and result limits before using this access.

Ordinary `em.find` still selects persisted rows using database state, then returns entities
from the shared identity map with any pending field edits intact. It does not automatically
include new entities or changed filter membership. Application code can explicitly choose
`em.findWithNewOrChanged` when it needs that overlay.

```ts
const targets = await session.applyBatch([
  { op: "create", type: "Author", $clientId: "a#7", values: { firstName: "Alice" } },
  { op: "create", type: "Book", $clientId: "b#2", values: { title: "Draft", author: "a#7" } },
  { op: "update", entity: "a#7", values: { firstName: "Alicia", lastName: "Smith" } },
]);
// targets: [{ id: "a#7" }, { id: "b#2" }, { id: "a#7" }]
```

A batch stops at the first failed command. Earlier successful commands remain recorded; later commands are not attempted. If a setter throws, earlier fields from that command may still be visible on the editing EM. The Session stays usable, but preview and commit replay only successful commands. Correct and resend the whole failed update, including fields that already look correct.

## Entity identity

Creates require an explicit `$clientId`, validated and registered by Joist, such as `a#7`.
The command log preserves the supplied client ID on every replay, independent of incidental hook creation order.

Targets and relationship values are plain ID strings: `a#7` for a new entity or
`a:123` for a persisted entity.

## Dry runs

`em.flush({ dryRun: "validate" })` runs the ordinary pre-write defaults, hooks, reactions, and validation, then returns before opening a write transaction. It leaves entity and join-row persistence state pending. Validation rules are evaluated again on each attempt using those pending changes. Successful reactions remain consumed; changes to their dependencies queue new work normally.

`em.flush({ dryRun: true })` is the full preview path. It shares the rollback mechanism used by `in-memory-writes`, including SQL, RQFs, commit rules, and transition processing. It runs once on a disposable EM; further flushes on that EM are rejected. No insert/delete flags or join-row state are restored. Entity and transaction `beforeCommit`/`afterCommit` callbacks are excluded; transaction begin callbacks retain their normal behavior.

Pre-write validation leaves existing entities' `updatedAt` values unchanged. Full preview advances `updatedAt` just like an ordinary flush, so a second update to the same row uses the version written by the first. Rollback restores the database row, and Session discards the preview EM. No timestamp trigger migration is needed.

Ordinary validation rule failures can be corrected on the same editing EM. Preview failures discard only the disposable EM. Dry-run calls inside existing transactions are not supported.

On the editing EM, `beforeCreate` runs once per pending insert. Repeating validation skips successful `beforeUpdate` and `beforeFlush` hooks until the entity changes again. Validation rules still run on every pass, and preview and commit each run hooks on a fresh EM. SQL rollback does not undo sequence allocation or external I/O from hooks; successful-commit effects belong in after-commit callbacks or an outbox.

## Transitions

Joist processes pending transitions in waves, one step per entity at a time. For example, if an advance goes from `Pending` to `Signed` and then to `Paid` before validation, its signature callbacks run before its payment guard. All guards in a wave must pass before any callbacks in that wave run.

If a guard rejects a transition during pre-write validation, Joist puts that wave and the remaining waves back in the queue. Correct the data and validate again on the same EM. If the payment guard failed, the signature callbacks have already run and won’t run again on that retry. There’s no reaction checkpoint to restore or SQL to roll back.

If a transition callback throws during pre-write validation, it may already have changed an entity. Retrying the wave could apply that change twice, so the Session discards the editing EM and replays the accepted commands on a fresh one before the next edit, without flushing. That gives the caller a chance to correct the input before callbacks run again.

Commit-phase transition callbacks run during full preview and commit, after SQL writes. Pre-write validation leaves them queued.

## Preview and commit contract

**Preview is optional and advisory.** Session does not enforce review or approval. Fresh commit may observe different data and produce different hook/RQF output; ordinary concurrency enforcement still applies within that commit EM. Transaction callbacks may also reject a commit that passed preview.

If your application requires approval and the commands change, ask the user to approve the new preview before committing.

A successful commit closes the Session. Flush errors during commit taint it because an error may occur after durable commit. Authoritative comparison of the final write set is deferred to a separate design.

Changes include stored old/new field values, entity operations/touches, and tracked many-to-many deltas. Owning foreign keys represent one-to-many moves; inverse many-to-many views can both appear. New entities use their ORM client IDs and existing entities use tagged database IDs. You can read a hook-created entity by client ID if it exists on the editing EM. Commands, including relationship values, can use only client IDs from earlier successful creates: replay applies those commands before flush hooks run.

## Limits

### Partial staging feedback

Staging returns just after `runValidation` and before `driver.transaction` in `EntityManager.flush`. Ordinary reaction processing leaves query reactions queued until the post-write loop, which staging does not execute. Preview runs the full pipeline on a fresh disposable EM.

This is more than skipping the RQF loop while still writing SQL: that would retain most rollback bookkeeping. The smaller design is **pre-write validation on staging, full rollback-only execution on a disposable preview EM**.

`status: "valid", scope: "pre-write"` means “no pre-write errors found,” not complete validity. RQF values can be stale or unset; checks depending on them are not authoritative until preview. The fixture's `Publisher.numberOfBookReviews` rule is a concrete example. Existing pre-write rules still run; this prototype does not classify and selectively defer arbitrary application callbacks. An arbitrary hook can explicitly load an RQF, so this is not a promise of zero query execution. Commit rules and database constraints are preview-only.

### Current API limits

- Initial codecs cover JSON primitives/objects/arrays, Dates, enum codes, and entity references. Lazy/custom codecs, large/one-to-one mutations, and enum-collection commands remain unsupported.
- No arbitrary entity methods, persistent logs, SQL recording/replay, or commit-to-staging reconciliation.
- Native SQL and external I/O in application hooks retain ordinary ORM semantics; Session is not a sandbox.

Integration coverage lives in `packages/tests/integration/src/Session.test.ts`:

```sh
yarn workspace joist-tests-integration test-stock Session.test.ts
```
