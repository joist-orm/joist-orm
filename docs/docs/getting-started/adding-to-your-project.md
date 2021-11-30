---
title: Adding Joist to Your Project
sidebar_label: Adding to Your Project
sidebar_position: 2
---

(TODO: Rewrite/finish this.)

This page covers setting up Joist for your project.

It assumes that:

1. You have a local postgres database.

   I.e. running locally in Docker or just on your machine (see the [db.dockerfile](https://github.com/stephenh/joist-ts/blob/master/packages/integration-tests/db.dockerfile) that Joist uses for code generation and integration tests).

2. You have a schema management/migration library in place.

   If you use [node-pg-migrate](https://github.com/salsita/node-pg-migrate), Joist has several helper methods (i.e. `createEntityTable`, `createEnumTable`, etc.), but it's not required to use that specific library.

## Setting up Codegen

Run `npm install --save-dev joist-codegen`.

Define your local postgres creds in a `DATABASE_CONNECTION_INFO` environment variable, i.e. in an `local.env` file similar to:

```shell
DATABASE_CONNECTION_INFO=postgres://joist:local@localhost:5435/joist
# the AWS RDS/SecretsManager JSON format is also supported natively
DATABASE_CONNECTION_INFO={"host":"localhost","port":5435,"username":"joist","password":"local","dbname":"joist"}
```

With this env variable set, run the `joist-codegen` module, i.e. with `env` or [`run.sh`](https://github.com/stephenh/joist-ts/blob/master/packages/integration-tests/run.sh):

```shell
./run.sh joist-codegen
```

### If using node-pg-migrate

If you do use `node-pg-migrate`, the `joist-migration-utils` package has some helper methods + glue code to invoke `node-pg-migrate` with the same `DATABASE_CONNECTION_INFO` environment variable.

```shell
./run.sh joist-migration-utils
```

This will apply any `node-pg-migrate` migrations located in your `./migrations/` directory, and then, if `ADD_FLUSH_DATABASE` is set, add the `flush_database()` function for your tests to use.

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
