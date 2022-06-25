---
title: Installation
slug: /getting-started
sidebar_position: 0
---

First, install Joist's packages:

```
npm add --save joist-orm knex joist-utils
npm add --save-dev joist-codegen
```

### Workflow

Joist works by generating all the necessary entities by reading your database schema. Below is the workflow for making changes to your entities:

1. Create a migration with your library of choice
2. Migrate your changes
3. Run Joist codegen
4. Use the entities in your production code

You can also verify your database schema matches [Joist's schema assumptions](./schema-assumptions.md).

### Creating a migration and migrating

#### node-pg-migrate

If you do use `node-pg-migrate`, the `joist-migration-utils` package has some helper methods + glue code to invoke `node-pg-migrate` with the same `DATABASE_URL` environment variable.

```shell
yarn ts-node ./node_modules/joist-migration-utils/build/index.js
```

This will apply any `node-pg-migrate` migrations located in your `./migrations/` directory.

:::tip

Joist is agnostic to your migration tool and will codegen based on your database schema. You're welcome to use [node-pg-migrate](https://github.com/salsita/node-pg-migrate), Knex's [migrations](http://knexjs.org/guide/migrations.html#migration-cli) or another tool for migrations.

:::

### Run Joist codegen

Define your local postgres credentials in a `DATABASE_URL` environment variable, i.e. in an `local.env` file similar to:

```shell
DATABASE_URL=postgres://joist:local@localhost:5435/joist
```

With this env variable set, run the `joist-codegen` module, i.e. with `env`

```shell
yarn ts-node ./node_modules/joist-codegen/build/index.js
```

This will generate all the required files

### Use the entities in your production code

```ts
import { EntityManager, Author } from './entities';
import { newPgConnectionConfig, PostgresDriver } from 'joist-orm';
import { knex as createKnex, Knex } from 'knex';

let knex: Knex;

function getKnex(): Knex {
  return createKnex({
    client: 'pg',
    connection: newPgConnectionConfig() as any,
    debug: false,
    asyncStackTraces: true,
  });
}

function newEntityManager(): EntityManager {
  return new EntityManager({}, new PostgresDriver(getKnex()));
}

const em = newEntityManager();


app.get('/authors', async (req, res) => {
  const authors = await em.find(
    Author,
    {},
  );

  res.send(authors);
});
```
