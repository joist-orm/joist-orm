---
title: Fast Database Resets
sidebar_position: 2
---

To reset the database between each unit test, Joist generates a `flush_database` stored procedure that will delete all rows/reset the sequence ids:

```typescript
await knex.select(knex.raw("flush_database()"));
```

This is generated at the end of the `joist-migation-utils` set only if `ADD_FLUSH_DATABASE` environment variable is set, i.e. this function should never exist in your production database. It is only for local testing.

### What About Per-Test Transactions?

As an alternative to Joist's `flush_database` approach, some ORMs invoke tests in a transaction, and then rollback the transaction before the next test (i.e. Rails does this).

However, this has a few downsides:

1. Debugging failed tests is more difficult b/c the data you want to investigate via `psql` has disappeared/been rolled back, and
2. Your tests cannot test any behavior that uses transactions.

For this reasons, Joist prefers the `flush_database` approach, however you could still use the transaction-per-test approach by putting `BEGIN` and `ROLLBACK` commands in your project's `beforeEach`/`afterEach`.
