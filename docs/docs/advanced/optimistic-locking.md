---
title: Optimistic Locking
sidebar_position: 4
---

Joist implements optimistic locking to avoid conflicting/dropped `UPDATE`s.

Optimistic locking is a pattern where reading data (i.e. `em.load(Author, "a:1")`) does not lock data (i.e. within the database at the row level, holding a lock that prevents other transactions from reading the row until we're "done").

Instead, optimistic locking assumes we are not going to conflict (hence the term "optimistic"), and so does not bother prematurely locking data (which would be "pessimistic locking").

However, when _writing_ data, we check that the data has not changed since we read it.

### How It Works

When Joist loads data, it knows the `updated_at` for every row that is read, i.e.:

```typescript
const author = await em.load(Author, "a:1");
console.lot(author.updated_at); // ...10:00am...
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

That said, this example is theoretical at this point, because Joist does not currently have a way to load an entity but then say you want the `updated_at` to be the prior/incoming `updated_at` / "as of" value. See [#204](https://github.com/stephenh/joist-ts/issues/204) for tracking that feature.


