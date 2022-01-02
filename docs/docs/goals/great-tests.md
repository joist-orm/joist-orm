---
title: Great Tests
sidebar_position: 4
---

Joist focuses not just on great production code & business logic, but also on great testing of that business logic, by facilitating tests that are:

1. Isolated,
2. Succinct, and
3. Fast

## Isolated Tests

Isolation is an important tenant of great tests, because generally any sort of "shared fixtures", "shared environment", etc. that couples automated tests to an ever-growing, ever-changing shared test data eventually becomes very confusing to debug and very brittle to change.

With Joist, each unit test starts out with a clean database, and so is concerned only with the minimum amount of data it needs for its boundary case.

I.e. when you run:

```typescript
describe("Author", () => {
  it("can have rule one", async () => {
    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1" });
    await em.flush();
  });

  it("can have rule two", async () => {
    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1" });
    await em.flush();
  });
});
```

Each `it` block will see a clean/fresh database.

This is achieved by running a `flush_database` stored procedure in `beforeEach`:

```typescript
beforeEach(async () => {
  await knex.select(knex.raw("flush_database()"));
});
```

Where the `flush_database` stored procured:

1. Is a single database invocation, so cheap to invoke
2. Knows the difference between entity tables and enum tables, and only `TRUNCATE`s entity tables
3. Resets sequences to restart from 1
4. Is only created in local testing environments, not production

## Succinct Tests

Given each test starts with a clean database, Joist provides factories to easily create test data, so that the benefit of "a clean database" is not negated by lots of boilerplate code to re-create test data.

Factories can:

1. Accept values that are important to the test case being tested,
2. Fill in defaults for any other required fields/columns,
3. Also accept specific hints/flags to create re-usable "chunks" of data

For example, if you want to test an author with a book of the same name/title:

```typescript
const a1 = newAuthor({
  firstName: "a1",
  books: [{ title: "a1" }],
});
```

If either the `Author` or `Book` had other required fields, the `newAuthor` and `newBook` factories will apply them as needed.

See the [factories](../features/test-factories.md) for more information on custom flags.

## Fast Enough Tests

Slow tests can kill productivity and dis-incentivize testing in general, so Joist tries to make tests as fast as possible.

Joist does not have a specific approach/feature that enables fast tests, other than:

- The `flush_database` stored procedure makes db resets a single database call instead of `N` calls (i.e. 1 per table in your schema)
- Using build-time code generation means Joist does not need to scan the schema at runtime/boot time.

In small projects, you can generally expect:

- A single file takes ~1 second to run (Jest will report ~100ms, but real time is higher)
- Individual `it` test cases take ~10ms to run

In larger projects (i.e. 100-150 tables), you can expect:

- A single file takes ~5 seconds to run (Jest will report ~1.5 seconds, but real time is higher)
- Individual `it` test cases take ~50ms to run

:::tip

Note that the "5 seconds of wall clock time" for large projects, and in general the discrepancy between Jest time vs. actual wall clock time, can be mitigated by projects like `@swc/jest` and `@swc-node/register`, as in larger projects the bottleneck becomes Node `require`/`import`-ing source code and transpiling the TypeScript to JavaScript, instead of Joist / the database operations themselves.

:::

:::tip

When running Postgres locally for testing, you can run `postgres -c fsync=off` (i.e. passed as the `command` in your `docker-compose.yml` file) to put Postgres into a "sort of" in-memory mode, that is faster because transactions will not commit to disk before completing.

:::

#### What is "Fast Enough?"

Granted, compared to true in-memory unit tests, these tests times are still ~5-10x slower, but the goal is that they are still "fast enough" given the benefit of still using the real database.

Sometimes applications will choose to mock out all database calls, with the goal of having strictly zero I/O calls during unit tests; granted, sometimes this approach can make sense, i.e. a frontend codebase mocking all GraphQL calls makes sense. But, for testing domain entities that are fundamentally tied to the database schema & persistence layer, it's generally more pragmatic with Joist to just keep testing against the real database.

:::info

Joist has explored an [InMemoryDriver](https://github.com/stephenh/joist-ts/blob/main/packages/orm/src/drivers/InMemoryDriver.ts), that could potentially achieve "no I/O calls during unit tests", with the idea that building this complexity into Joist itself might justify/amortize its expense, instead of complicating each application's architecture.

However, so far the `InMemoryDriver` is not actually 10x faster than real Postgres tests (it's maybe ~2-3x), and also does not support custom SQL queries, so for now its development is on pause. Rebooting it on top of [pg-mem](https://github.com/oguimbal/pg-mem) might be fun, to get custom SQL query support.

:::
