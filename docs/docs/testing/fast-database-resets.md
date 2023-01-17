---
title: Fast Database Resets
sidebar_position: 1
---

To reset the database between each unit test, Joist's `joist-codegen` command generates a `flush_database` stored procedure [^1] that will delete all rows/reset the sequence ids:

```typescript
await knex.select(knex.raw("flush_database()"));
```

This is generated at the end of the `joist-codegen`, which should only be invoked against local development databases, i.e. this function should never exist in your production database. It is only for local testing.

Your test suite should invoke this `knex.select` command in a suite-test `beforeEach`.

### What About Per-Test Transactions?

As an alternative to Joist's `flush_database` approach, some ORMs invoke tests in a transaction, and then rollback the transaction before the next test (i.e. Rails does this).

However, this has a few downsides:

1. Debugging failed tests is more difficult b/c the data you want to investigate via `psql` has disappeared/been rolled back, and
2. Your tests cannot test any behavior that uses transactions.

For this reasons, Joist prefers the `flush_database` approach, however you could still use the transaction-per-test approach by putting `BEGIN` and `ROLLBACK` commands in your project's `beforeEach`/`afterEach`.

[^1] `flush_database` is the only stored procedure that Joist uses, and opting for a stored procedure is solely an optimization (1 SQL statement to reset all tables) to keep tests as fast as possible.
