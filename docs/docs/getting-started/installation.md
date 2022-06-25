---
title: Installation
slug: /getting-started
sidebar_position: 0
---

Installing Joist in your project has four main steps:

1. Setting up your database
2. Setting up `joist-codegen`
3. Setting up your tests
4. Setting up your production code

A wrinkle is that each Node.js application can be pretty different, in terms of how you manage your local database (i.e. with Docker Compose), what your production application looks like (a REST API, a GraphQL API, etc.), etc.

So, to simplify this page, we'll include some assumptions based on the [Joist sample app](https://github.com/stephenh/joist-ts-sample), but you should be able to adjust these steps to your specific project. 

:::info

If you want a faster intro than this page, you should be able to check out the sample app, run the commands in its readme, and just start poking around.

:::

## Setting up your database

The sample app uses `docker-compose` and a `db.dockerfile` file to manage the local Postgres database. 

To start it, clone the [sample app](https://github.com/stephenh/joist-ts-sample), and run:

```bash
docker-compose build db
docker-compose up -d db
```

The `docker-compose.yml` exposes the `sample_app` database on port `5346`, so it is accessible with an environment variable of:

```env
DATABASE_URL=postgres://sample_user:local@localhost:5436/sample_app
```

The following steps will assume your database is available at this location (it is already set in the sample app's `env/local.env` file), but you can set `DATABASE_URL` to whatever is appropriate for your application.

### Setting up migrations

You should also set up a migrations library to manage your database schema; the Joist sample app uses [node-pg-migrate][1]. 

If you want to use `node-pg-migrate` as well, you can install Joist's `node-pg-migrate`-based helper methods:

```shell
npm add --save-dev joist-migration-utils
```

And add `joist-migrate` and `joist-new-migration` commands to your `package.json`:

```json
{
  "scripts": {
    "joist-migrate": "./run.sh ./node_modules/joist-migration-utils",
    "joist-new-migration": "npx node-pg-migrate create"
  }
}
```

The sample app uses a `run.sh` helper script to load the environment variables from `env/local.env` before running `joist-migration-utils`, but if you don't like that, you can manage your application's environment variables however you like.

Now we can apply any migrations by running:

```shell
npm run joist-migrate
```

The sample app also supports resetting the database schema (so you can re-run the migrations from scratch) by running:

```shell
docker-compose exec db ./reset.sh
```

:::tip

Joist is agnostic to your migration tool and will codegen based on your database schema, however it happens to be managed. You're welcome to use [node-pg-migrate](https://github.com/salsita/node-pg-migrate), Knex's [migrations](http://knexjs.org/guide/migrations.html#migration-cli), or another tool for migrations/schema management.

:::

## Setting up `joist-codegen`

Install the `joist-codegen` package as a dev dependency and add a `joist-codegen` script to your `package.json`:

```shell
npm add --save-dev joist-codegen
```

```json
{
  "scripts": {
    "joist-codegen": "./run.sh ./node_modules/joist-codegen"
  }
}
```

This again uses the `run.sh` script, as `joist-codegen` will use the `DATABASE_URL` environment variable to connect to your local database.

Now, anytime you make schema changes (i.e. by running `npm run joist-migrate`), you can also run `joist-codegen` to get the latest code:

```shell
npm run joist-codegen
```

## Setting up your tests

We want each test to get a clean/fresh database, so we should set up a `beforeEach` to invoke our local-only `flush_database` command:

The sample app does this via a `setupTests.ts` file that will be used for all tests:

```typescript
import { EntityManager } from "src/entities";
import { knex as createKnex, Knex } from "knex";
import { PostgresDriver } from "joist-orm";
import { newPgConnectionConfig } from "joist-utils";

let knex: Knex;

function getKnex(): Knex {
  return (knex ??= createKnex({
    client: "pg",
    connection: newPgConnectionConfig() as any,
    debug: false,
    asyncStackTraces: true,
  }));
}

export function newEntityManager(): EntityManager {
  return new EntityManager({}, new PostgresDriver(getKnex()));
}

beforeEach(async () => {
  const knex = await getKnex();
  await knex.select(knex.raw("flush_database()"));
});

afterAll(async () => {
  if (knex) {
    await knex.destroy();
  }
});
```

The `newPgConnectionConfig` helper method from `joist-utils` also uses the `DATABASE_URL` environment variable, which we can have loaded into the Jest process by using `dotenv` in a `setupTestEnv.js` file:

```typescript
import { config } from "dotenv";

export default () => {
  if (process.env.STAGE === undefined) {
    config({ path: "./env/local.env" });
  }
};
```

And then configure `jest.config.js` to use both files:

```javascript
module.exports = {
    preset: "ts-jest",
    globalSetup: "<rootDir>/src/setupTestEnv.ts",
    setupFilesAfterEnv: ["<rootDir>/src/setupTests.ts"],
    testMatch: ["<rootDir>/src/**/*.test.{ts,tsx,js,jsx}"],
    moduleNameMapper: {
        "^src(.*)": "<rootDir>/src$1",
    },
};
```

As usual, you can/should adjust all of this to your specific project.

Now your unit tests should be able to create an `EntityManager` and work with the domain objects:

```ts
import { Author, EntityManager, newAuthor } from "src/entities";
import { newEntityManager } from "src/setupTests";

describe("Author", () => {
  it("can be created", async () => {
    const em = newEntityManager();
    const a = new Author(em, { firstName: "a1" });
    await em.flush();
  });
});
```

## Setting up your production code

Finally, you can use the `EntityManager` and your domain objects in your production code.

This is where the guide really becomes "it depends on your application", but in theory it will look very similar to setting up the tests:

1. Configure a single/global `knex` instance that will act as the connection pool,
2. For each request, create a new `EntityManager` to perform that request's work 

An extremely simple example might look like:

```ts
import { EntityManager, Author } from './entities';
import { newPgConnectionConfig, PostgresDriver } from 'joist-orm';
import { knex as createKnex, Knex } from 'knex';

// Create our global knex connection
let knex: Knex = createKnex({
  client: 'pg',
  connection: newPgConnectionConfig(),
  debug: false,
  asyncStackTraces: true,
});

// Create a helper method for our requests to create a new EntityManager
function newEntityManager(): EntityManager {
  return new EntityManager({}, new PostgresDriver(getKnex()));
}

// Handle GET `/authors`
app.get('/authors', async (req, res) => {
  // Create a new em
  const em = newEntityManager();
  // Find all authors
  const authors = await em.find(Author, {});
  // Send them back as JSON
  res.send(authors);
});
```

Note that you'll again need the `DATABASE_URL` environment variable set, but that will depend on whatever hosting provider you're using to run the app.

:::info

In the above code, the `newPgConnectionConfig` is the only method that depends on `DATABASE_URL` being set, so if you don't want to use an environment variable at all, or have multiple environment variables set (`DB_USER`, `DB_PASSWORD`, etc.) you can create the `knex` instance/connection information however you'd like.

:::

[1]: https://github.com/salsita/node-pg-migrate
