---
title: Optimistic Locking
description: Documentation for Optimistic Locking
sidebar:
   order: 9
---

Joist implements optimistic locking to avoid conflicting/dropped `UPDATE`s.

Optimistic locking is a pattern where reading data (i.e. `em.load(Author, "a:1")`) does not lock data (i.e. within the database at the row level, holding a lock that prevents other transactions from reading the row until we're "done").

Instead, optimistic locking assumes we are not going to conflict (hence the term "optimistic"), and so does not bother prematurely locking data (which would be "pessimistic locking").

However, when _writing_ data, we check that the data has not changed since we read it.

### How It Works

When Joist loads data, it knows the `updated_at` for every row that is read, i.e.:

```typescript
const author = await em.load(Author, "a:1");
console.log(author.updated_at); // ...10:00am...
```

Then when issuing `UPDATE`s, we include the `updated_at` as part of the `WHERE` clause:

```sql
UPDATE authors
  SET
    first_name = 'bob'
    updated_at = '...10:01am...'
  WHERE id = 1
  AND updated_at = '...10:00am...'
```

This `UPDATE` can have two outcomes:

* The `UPDATE` modifies 1 row, and we know no one else changed the data, so our write is successful.
* The `UPDATE` modifies 0 rows, and we know that a different thread changed the data since we had read it, so our write was not successful, and Joist will throw an `Oplock failure` error.

:::note

The SQL in this example only updates 1 row at a time, so is pretty straight forward.

The SQL that Joist generates at runtime will be more complex, because it batches all `UPDATE`s for a single table together into 1 SQL call, but the effect is the same: the bulk `UPDATE`s still check the individual/per-row `updated_at` values.

:::

### Oplock Granularity

Currently, Joist's oplock granularity is at the entity/row level, because it uses the row-level `updated_at` column to detect conflicts.

So if you have two clients that are trying to simultaneously update separate columns, i.e.:

```sql
-- thread 1, sets first name
UPDATE authors SET first_name = 'bob'
  WHERE id = 1 AND updated_at = '...10:00am...'

-- thread 2, sets last name
UPDATE authors SET last_name = 'smith'
  WHERE id = 1 AND updated_at = '...10:00am...'
```

These two statements will still conflict, and only 1 will win.

There are two interpretations of this behavior:

1. That it's incorrect because each `UPDATE` touched separate columns, so they should have been allowed to interleave.
2. That it's correct because the person/business logic changing `last_name` might have needed to know that the `first_name` they observed at read time is actually incorrect (or vice versa, that the person/business logic `first_name` might have needed to know that the `last_name` it observed is incorrect), and so they should "redo" their update/logic with the latest values.

Unfortunately, which of these interpretations is right likely changes on a case-by-case basis.

However, the 2nd interpretation is safer (i.e. "just in case", let's have one of the writers retry), and it's also the most convenient to implement, because a singular `updated_at` column can't support per-field versioning (which would be required to implement the 1st interpretation).

So, for now, Joist uses the 2nd interpretation, and does not allow "technically setting separate columns" `UPDATE`s to interleave.

Eventually Joist could support per-field versioning, perhaps with a `columns_at` `jsonb` column that is a map of `columnName -> timestamp`, with some careful crafting of `UPDATE` statements to check and maintain the per-column values.

### When Will Errors Like This Happen?

In theory, you should rarely see `Oplock failure` errors, and when you do it should be one of two conditions:

1. A longer-running process did a read, briefly paused due to business/logic/etc., and then when writing the data, another process had changed the data.

   This is a valid detection of the oplock feature preventing data overwrites; ideally the long running process can be implemented with retries to just try again.

2. Two incoming requests happened simultaneously, and it's possible a client is "double tapping" saves, i.e. issuing two requests when it should only be issuing one.

### Protecting Read-Only Dependencies

Oplocks protect rows being updated, not rows your business logic only reads.

For example, a business invariant might allow editing a child only while its parent's `status` is `draft`. After we read `status=draft`, another transaction could change it to `status=published`. Our decision to allow the edit is now based on stale data, even though we never write the parent ourselves.

Because Joist normally reads entities outside the flush transaction, a stricter (and more expensive) SQL isolation level on that transaction does not protect those earlier reads.

Joist can help prevent these race conditions by opting into PostgreSQL's `FOR SHARE` row locks with `assertUnchanged`. We still read the parent's `status=draft` outside the transaction as usual. During flush, **inside the transaction that commits our writes**, Joist reads the parent's version again to check whether anyone has changed or version-bumped the row since we loaded it.

If the version has changed, Joist fails the transaction. Otherwise, `FOR SHARE` holds a read lock on the row, preventing other transactions from updating or deleting it until our transaction commits. This closes the gap between checking the version and committing our decision:

```typescript
const book = await em.load(Book, bookId, "author");
em.assertUnchanged(book.author.get); // Also accepts an array of entities
book.notes = "Decision based on the author's current state";
await em.flush();
```

Reactive rules and reactions can assert all rows reached through their hints, but only when they actually run:

```typescript
config.addRule({ assertUnchanged: true }, { notes: {}, author: ["status", "maxBooks"] }, (book) => {
  // Validate using book.author.get.status and book.author.get.maxBooks
});
config.addReaction({ assertUnchanged: true }, { notes: {}, author: "status:ro" }, (book) => {
  // React using the author's current status
});
```

The options-first form matches reaction options such as `runOnce`. Reactive `addCommitRule` also supports this option.

Inside the flush transaction, Joist batches assertions by table and locks rows in id order with `SELECT ... FOR SHARE` before writing. It compares `updatedAt` against the original loaded value, **not** the value when the rule ran. Under READ COMMITTED, the query waits for in-flight writers and checks their committed version. The locks block non-key updates and deletes until the transaction commits. Missing or changed rows throw `ReadSetDriftError`, including tagged ids and expected/actual versions. Like an oplock failure, retry the **whole unit of work with a fresh EntityManager**, reloading data and rerunning business logic; do not retry flush on the failed EM.

Assertions clear after a successful flush, including read-set-only flushes. Assert again for a later flush if needed; this does not refresh the entity's loaded version. Unsaved entities are ignored, and entities written in the flush use the existing write path instead of an extra read lock. Assertions require an `updatedAt` version field. Joist's existing deletes do not perform version checks.

This protects **row drift**, not predicates or collection membership. For `{ author: "books" }`, the reached author and book rows are protected, but a newly inserted book is not detected. Membership invariants require a parent-row locking protocol followed by all writers, or a database constraint. Writes that bypass version bumps are not detected. Date-based versions use the same millisecond precision as oplocks; Temporal preserves database precision.

Row locks write to tuple headers and generate WAL, and can cause lock waits or deadlocks. There is one extra locking query per table in each flush phase that registers dependencies. Use this for invariant-critical reads, not every loaded entity. There are no extra queries without assertions.

### Integrating Locks with the Client

By default/currently, Joist's op locks are only "held" between the read & write of a single `EntityManager`, i.e.:

1. An HTTP request comes in with `firstName=bob`
2. We load `author = await em.load(Author, "a:1")`
3. We call `author.firstName = "bob"`
4. We save `em.flush()`

Because steps 2 and 4 are probably ~milliseconds apart, it is fairly unlikely another user/request will have written to `a:1`.

However, a potentially useful way to leverage optimistic locks is to have the HTTP request _specify which version of `a:1` the user was viewing when they made the change_.

For example, if:

1. User A loads the page `/author?id=a:1` at 10:00am
2. User A decides that `firstName=bob` is a good change to make
3. User B quickly loads `/author?id=a:1`, makes a change, hits save at 10:02am
4. User A finally hits "Save Author" at 10:05am

On step 4, the `saveAuthor` request could specify "the user is saving `a:1`, but 'as of' `updated_at=...2:00am...`".

This approach would catch that User A is potentially writing over User B's changes, i.e. and fail User A's update with an `Oplock failure`.

That said, this example is theoretical at this point, because Joist does not currently have a way to load an entity but then say you want the `updated_at` to be the prior/incoming `updated_at` / "as of" value. See [#204](https://github.com/joist-orm/joist-orm/issues/204) for tracking that feature.
