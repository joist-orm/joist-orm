---
title: Read Locking
description: Protect read-only dependencies with PostgreSQL FOR SHARE locks
sidebar:
  order: 9.5
---

## Why Read Locking?

Oplocks protect rows being updated, not rows your business logic only reads.

For example, a business invariant might allow editing a child only while its parent's `status` is `draft`. After we read `status=draft`, another transaction could change it to `status=published`. Our decision to allow the edit is now based on stale data, even though we never write the parent ourselves.

Because Joist normally reads entities outside the flush transaction, a stricter (and more expensive) SQL isolation level on that transaction does not protect those earlier reads.

Joist can help prevent these race conditions by opting into PostgreSQL's `FOR SHARE` row locks with `assertUnchanged`. We still read the parent's `status=draft` outside the transaction as usual. During flush, **inside the transaction that commits our writes**, Joist reads the parent's version again to check whether anyone has changed or version-bumped the row since we loaded it.

If the version has changed, Joist fails the transaction. Otherwise, `FOR SHARE` holds a read lock on the row, preventing other transactions from updating or deleting it until our transaction commits. This closes the gap between checking the version and committing our decision.

There are three ways to opt into `FOR SHARE` locks:

1. Call `em.assertUnchanged(entity)` explicitly.
2. Add `{ assertUnchanged: true }` to a reactive rule or reaction.
3. Configure `{ assertUnchanged: true }` on a field in `joist-config.json`.

## Explicit Assertions

```typescript
const book = await em.load(Book, bookId, "author");
em.assertUnchanged(book.author.get);
book.notes = "Decision based on the author's current state";
await em.flush();
```

## Reactive Rules and Reactions

Reactive rules and reactions can request `FOR SHARE` read locks for all entities in their reactive hints by using the `assertUnchanged` option, but only when they actually run:

```typescript
config.addRule({ assertUnchanged: true }, { notes: {}, author: ["status", "maxBooks"] }, (book) => {
  // Validate using book.author.get.status and book.author.get.maxBooks
});
config.addReaction({ assertUnchanged: true }, { notes: {}, author: "status:ro" }, (book) => {
  // React using the author's current status
});
```

Note, be aware that this approach can overuse `FOR SHARE` locks: a broad reactive hint may lock many entities even if only a few reads are invariant-critical. Use explicit assertions or field-level configuration for narrower protection.

The options-first form matches reaction options such as `runOnce`. Reactive `addCommitRule` also supports this option.

## Field-Level Configuration

For fields that are always invariant-critical, like status fields, we can configure read-lock protection for the field just once in `joist-config.json`:

```json
{
  "entities": {
    "Publisher": {
      "tag": "p",
      "fields": { "status": { "assertUnchanged": true } }
    }
  }
}
```

Now any business logic that reads `publisher.status`, `publisher.statusDetails`, or `publisher.isDraft` automatically calls `em.assertUnchanged(publisher)`. This works in ordinary business logic, rules, reactions, and hooks without rule-level opt-in.

## Scope and Limitations

This remains **row-level** protection: a version-bumping change to any field on the row can invalidate a read of `status`.

For example, if we read `publisher.status` as `draft` and another transaction changes only `publisher.name`, our flush still fails because the publisher's row version changed—even though its status is still `draft`.

This protects **row drift**, not predicates or collection membership. For `{ author: "books" }`, the reached author and book rows are protected, but a newly inserted book is not detected. Membership invariants require a parent-row locking protocol followed by all writers, or a database constraint. Writes that bypass version bumps are not detected.
