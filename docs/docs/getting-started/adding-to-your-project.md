---
title: Adding Joist to Your Project
sidebar_label: Adding to Your Project
sidebar_position: 2
---

(TODO: Rewrite/finish this.)

There are three main steps to integrating Joist into your project:

1. Setup migrations
2. Setup code generation
3. Setup unit tests
4. Setup your production code

It assumes that:

1. You have a local postgres database.

   I.e. running locally in Docker or just on your machine (see the [db.dockerfile](https://github.com/stephenh/joist-ts/blob/master/packages/integration-tests/db.dockerfile) that Joist uses for code generation and integration tests).

2. You have a schema management/migration library in place.

   If you use [node-pg-migrate](https://github.com/salsita/node-pg-migrate), Joist has several helper methods (i.e. `createEntityTable`, `createEnumTable`, etc.), but it's not required to use that specific library.

## Setting up Codegen

Run `npm install --save-dev joist-codegen`.

Define your local postgres creds in a `DATABASE_URL` environment variable, i.e. in an `local.env` file similar to:

```shell
DATABASE_URL=postgres://joist:local@localhost:5435/joist
```

With this env variable set, run the `joist-codegen` module, i.e. with `env` or [`run.sh`](https://github.com/stephenh/joist-ts/blob/master/packages/integration-tests/run.sh):

```shell
./run.sh joist-codegen
```

### If using node-pg-migrate

If you do use `node-pg-migrate`, the `joist-migration-utils` package has some helper methods + glue code to invoke `node-pg-migrate` with the same `DATABASE_URL` environment variable.

```shell
./run.sh joist-migration-utils
```

This will apply any `node-pg-migrate` migrations located in your `./migrations/` directory.

Note that usually `joist-migration-utils` / your migration library of choice is run first, i.e. a flow would be:

1. Start your database
2. Reset the schema
3. Apply the migrations from scratch
4. Run code generation

Which, using Joist's integration tests as an example, can look like:

```shell
docker-compose up -d db
docker-compose exec db ./reset.sh
./run.sh joist-migration-utils
./run.sh joist-codegen
```
