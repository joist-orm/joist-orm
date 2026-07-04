---
title: Seeding Data
description: Populating your local database with day-one data
sidebar:
  order: 16
---

Joist provides a `seed` helper for populating your local/test database with some initial data, using the same [factories](../testing/test-factories.md) you use in your tests.

:::caution[Seeds are for day-one prototyping only]

Joist generally **frowns upon relying on seed data** for anything beyond very early, day-one prototyping.

Seed scripts tend to become a large, brittle mess of overlapping and potentially-conflicting use cases: every feature wants "its" data to exist, and over time the single seed becomes a shared dependency that no one wants to touch.

**Automated tests should never rely on seed data.** Instead, each test should create exactly the data it needs via [factories](../testing/test-factories.md). This keeps tests isolated, self-documenting, and immune to changes in the seed. See [Fast Database Resets](../testing/fast-database-resets.md) for how tests get a clean database per-test.

:::

## Usage

Import `seed` from `joist-orm/pg` and pass an async function that creates your data:

```ts
// seed.ts
import { seed } from "joist-orm/pg";
import { newAuthor, newPublisher } from "./entities";

seed(async (em) => {
  const p = newPublisher(em, { name: "Penguin" });
  newAuthor(em, { firstName: "Jane", publisher: p });
});
```

Then run it with `ts-node` (or your runner of choice), with `NODE_ENV` set to `local` or `test`:

```bash
NODE_ENV=local ts-node seed.ts
```

The `seed` helper will:

- Assert `NODE_ENV` is `local` or `test` (it refuses to run otherwise, because it resets the database)
- Call `flush_database()` to reset the database (see [Fast Database Resets](../testing/fast-database-resets.md))
- Create an `EntityManager` backed by the `PostgresDriver`
- Run your function and `em.flush()` the results

Connection settings are read from the environment via `newPgConnectionConfig` (i.e. `DATABASE_URL`, or the individual `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_DATABASE` variables), so make sure your env is loaded before running the script.
