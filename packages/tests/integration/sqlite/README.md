# Shared integration tests on SQLite

The integration package selects its test driver with `TEST_DRIVER=postgres|sqlite`.
PostgreSQL is the default. Both backends use the same test files, handwritten entities,
factories, and existing PostgreSQL-generated entity API.

```sh
yarn workspace joist-tests-integration test-stock
yarn workspace joist-tests-integration test-sqlite
```

Jest arguments work with either command. For example, the driver-neutral regression
tests cover multiple-row inserts and updates, binary certificates, and bigint bindings:

```sh
yarn workspace joist-tests-integration test-sqlite --runTestsByPath src/drivers/Driver.shared.test.ts
```

## Database setup

Each Jest environment creates its own temporary SQLite database from `schema.sql`.
The ORM and Knex fixture helpers access that same database file. Entity rows and id
counters are reset before each test; enum lookup rows remain seeded. The database
connections and temporary directory are removed after the suite finishes.

The ORM driver uses prepared row statements within its flush transaction. SQLite
disables DataLoader query batching while retaining its request-scoped cache.

## Updating the schema

`schema.sql` is exported from the real PostgreSQL catalog after applying the existing
integration migrations. No ORM metadata is manufactured to create the SQLite fixture.
Use a database migrated from this checkout to avoid importing fields from another branch:

```sh
DATABASE_URL=postgres://joist:local@localhost:5435/your_fixture_database \
  yarn workspace joist-tests-integration sqlite:export-schema
```

The exporter preserves physical columns, primary keys, unique indexes, foreign keys,
and enum lookup rows. It translates the defaults used by these migrations and rejects
unknown defaults. SQLite timestamp defaults supply the values that PostgreSQL's insert
triggers normally provide to direct fixture inserts.

PostgreSQL-specific storage is deliberately limited:

- Arrays are JSON text with the original declared array type, so the shared codecs can
  read their values. PostgreSQL array operators still need a SQLite implementation.
- Non-id serial fields have an initial default of `1`, not a separate PostgreSQL sequence.
- PostgreSQL generated expressions, including full-text search, are not emulated.
- SQLite unique indexes do not have PostgreSQL's deferred-constraint behavior.

## Current scope

This is a shared **runtime** suite. Independently generating the full integration entity
API from SQLite remains follow-up work; PostgreSQL column comments currently supply
relation names, and SQLite codegen does not yet expose the same array/native-enum model.
The separate `packages/tests/sqlite` fixture continues to exercise SQLite codegen.

Ordinary `.test.ts` / `.test.tsx` files run against both drivers. Native PostgreSQL contracts
use `.pg.test.ts` names and are excluded from SQLite runs; `.sqlite.test.ts` files are
excluded from PostgreSQL runs. Mixed files use visibly skipped PostgreSQL-only groups for
native response counts and pool/client routing. These native checks do not count as SQLite coverage.

Shared tests keep entity results, domain types, validation, caching, and rollback assertions
unconditional. PostgreSQL SQL snapshots are guarded with `if (!isSqlite)`; assertions that
no query occurred remain shared. Where batching changes the query count, the test states
both expected counts explicitly and separately verifies that cached reads issue no further query.
`find.concurrent.test.ts` also checks SQLite's ordinary single-filter SQL with its own inline snapshot.
Flush-lock tests pause at a `beforeBegin` hook instead of assuming a timer overlaps database I/O.

Unsupported SQL operators, scalar-expression decoding, transaction isolation, and portable
validation-error behavior remain visible failures rather than backend-specific skips.

Use `select`, `insert`, `update`, `delete`, and `count` on `TestDriver` for portable direct
row access. Tests that need PostgreSQL's native pool use `getPostgresPool()`, which fails
explicitly when the selected test driver is SQLite.
