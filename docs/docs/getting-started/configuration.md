---
title: Configuration
slug: /configuration
sidebar_position: 2
---

Joist prefers convention over configuration, but it still has some knobs to control its behavior.

The configuration is split into two sections:

1. Codegen config, used by `npm run joist-codegen` during the code generation build step,
2. Runtime config, used by `EntityManager` at runtime to configure the database that Joist connects to.

You can get started without any codegen config, and only some minimal runtime config.

## Codegen Configuration

The codegen configuration is controlled by a `./joist-config.json` file, that `npm run joist-codegen` will look for and automatically run.

A short, minimalistic example is:

```json
{
  "entitiesDirectory": "./src/entities"
}
```

Each of the supported keys are described below. Note this is an exhaustive list, but all the keys are optional.

### `databaseUrl`

This is the _build-time_ connection information for your database, e.g. it is only used when running `npm run joist-codegen`, and won't be used for either your unit tests or production code, because it's assumed to have a hard-coded/local-only host/port/etc.

If this is not set, `npm run joist-codegen` will also look for a `DATABASE_URL` environment variable.

### `idType`

Controls the type of the domain model's `id` properties, i.e. `Author.id` or `author1.id`.

Joist's default behavior is `tagged-string` which means the type of `Author.id` will be a `string`, and the value will be `a:1` where `a` is the "tag" established for all `Author` entities, and `1` is the numeric primary key value of that row.

If you do not want the `a:` tagged prefix, you can use `untagged-string`:

```json
{
  "idType": "untagged-string"
}
```

This is a project-wide setting and cannot be changed on an entity-by-entity basis.

Also note that this `idType` setting controls the _codegen output_, but Joist will still look at the database type of the each individual entity's `id` column to determine if the SQL values are actually numbers (i.e. auto increment integers) or other types like UUIDs.

:::info

Even if you use `untagged-string`s, currently Joist still manages ids internally as tagged, and so you'll still see a per-entity `tag` established in the `joist-config.json` file, but the tag will be stripped by the `id` getters.

:::

:::caution

Joist currently does not support typing `id` properties as `number`. This is doable, it's just not been something we've needed. See [this issue](https://github.com/stephenh/joist-ts/issues/368).

:::

### `contextType`

This optional key specifies your application specific `Context` type, if you're using that pattern.

The expectation is that this will be a request-level `Context`, i.e. it might hold user auth information or other application-specific information.

If you pass your request-level `Context` to each `EntityManager`:

```ts
import { Context } from "src/context";
import { EntityManager } from "src/entities";

const em = new EntityManager(ctx, driver);
```

Then in `EntityManager`-managed hooks, you'll be able to access the context:

```ts
config.beforeDelete((book, ctx) => {
  if (!ctx.user.isAdmin) {
    return "Only admins can delete a book";
  }
});
```

And the `ctx` param will be correctly typed to your application's specific `Context` type.

### `entitiesDirectory`

This controls whether Joist outputs the entity, codegen, and metadata files.

The default is `./src/entities`.

### `createFlushFunction`

Joist's preferred approach to testing is to let tests `COMMIT` their code, and then use a `flush_database` stored procedure to very quickly `TRUNCATE` all tables between each test.

This `flush_database` stored procedure if created during `npm run codegen`.

If you'd prefer to not use, you can set this to false:

```json
{
  "createFlushFunction": false
}
```

If you have multiple test databases (i.e. one per Jest work), you can set the parameter to an array of database names:

```json
{
  "createFlushFunction": ["db_test_1", "db_test_2"]
}
```

### `ignoredTables`

Allows ignoring tables, i.e. not generating TypeScript entities for them.

```json
{
  "ignoredTables": ["some_old_thing"]
}
```

### `timestampColumns`

Joist will automatically manage columns like `Author.created_at` and `Author.updated_at`.

The `timestampColumns` key lets you configure your schema's conventions for column names.

For example the following config looks for _only_ `updated_at` and `created_at` and requires both column to be present for Joist to consider a database table and entity table:

```json
{
  "timestampFields": {
    "updatedAt": {
      "names": ["updated_at"],
      "required": true
    },
    "createdAt": {
      "names": ["created_at"],
      "required": true
    },
    "deletedAt": {
      "names": ["deleted_at"],
      "required": true
    }
  }
}
```

The default configuration is basically:

```json
{
  "timestampFields": {
    "updatedAt": {
      "names": ["updated_at", "updatedAt"],
      "required": false
    },
    "createdAt": {
      "names": ["created_at", "createdAt"],
      "required": false
    }
  }
}
```

I.e. Joist will look for either `updated_at` or `updatedAt` naming conventions, and will not require the `updatedAt` column be present to consider a table an entity table.

### `codegenPlugins`

Allows other functionality to be inserted into the `npm run joist-codegen` pipeline.

The current example is an extra GraphQL-specific plugin that creates GraphQL-specific scaffolding/output based on your domain model:

```json
{
  "codegenPlugins": ["joist-graphql-codegen"]
}
```

### `entities`

This is a big section that allows per-entity configuration.

There are several sub-keys:

```typescript
export interface EntityConfig {
  tag: string;
  tableName?: string;
  fields?: Record<string, FieldConfig>;
  relations?: Record<string, RelationConfig>;
}
```

#### `tag`

This controls the tag that Joist uses for each entity. By default, Joist will guess a tag by abbreviating a table name `books_reviews` as the tag `br` and automatically save it in `joist-config.json`. If you'd like a different value, you're free to change it.

```json
{
  "entities": {
    "Author": { "tag": "a" }
  }
}
```

Note that you should probably not change the tag name for an entity after it has been deployed to production, b/c the tagged id could exist in external systems, i.e. if you've sent `"a:1"` to a 3rd party system, and then change your tag to `"author"`, you might break an integration that tries to look up the entity by the old `"a:1"` value.

#### `tableName`

Allows defining specific entity names for tables, for example if you had a `tbl_publishers` table that you wanted to back the `Publisher` entity, then you could setup:

```json
{
  "entities": {
    "Publisher": { "tableName": "tbl_publishers" }
  }
}
```

By default, Joist assumes table names are plural (i.e. `publishers`) and will [`singular`](https://www.npmjs.com/package/pluralize) the name for the entity name (i.e. `Publisher`).

### `entities.fields`

You can configure primitive fields by setting the camel-cased field name in the entity's `fields` key:

```json
{
  "entities": {
    "Author": { "fields": { "firstName": {} } }
  }
}
```

Within the field hash (i.e. the value of the `firstName` key), these values are supported:

```ts
export interface FieldConfig {
  derived?: "sync" | "async";
  protected?: boolean;
  ignore?: true;
  superstruct?: string;
}
```

Where:

* `derived` controls whether this field is derived from business logic (...link to docs...)
* `protected` controls whether this is field is `protected` and so can only be accessed internally by the domain model code
* `ignore` controls whether to ignore the field
* `superstruct` links to the superstruct type to use for `jsonb` columns, i.e. `commentStreamReads@src/entities/superstruct` (...link to docs...)

### `entities.relations`

You can configure relations (references and collections to other entities) by setting the camel-cased relation name in the entity's `relations` key:

```typescript
export interface RelationConfig {
  name?: string;
  polymorphic?: "notNull" | true;
  large?: true;
}
```

The support values are:

* `name` customizing the name, i.e. if Joist guesses the name for a relation (typically the `o2o` or `o2m` side of a `m2o`), you can set a more logical name.
* `polymorphic` creates this relation as a [polymorphic relation](/docs/modeling/relations#polymorphic-references), which logical combines several physical foreign keys into a single field

## Runtime Configuration

There are three main things to configure at runtime:

* Connection pool
* Driver
* EntityManager

### Connection Pool

Your application should have a single global connection pool; currently Joist recommends using [knex](http://knexjs.org/):

```typescript
import { newPgConnectionConfig } from "joist-utils";

const knex = createKnex({
  client: "pg",
  // This will read DATABASE_URL, but you can use whatever config you want, see the knex docs
  connection: newPgConnectionConfig(),
  // Setting this is true will `console.log` the SQL statements that Joist executes
  debug: false,
  asyncStackTraces: true,
});
```

### Driver

Joist has a `Driver` interface to support multiple different databases, like Postgres or MySQL or even an experimental in-memory driver. Currently only Postgres is supported.

Similar to the knex connection pool, you can create a single global instance of this driver:

```typescript
const driver = new PostgresDriver(knex);
```

#### IdAssigner

When creating the `PostgresDriver`, you can pass an `IdAssigner` instance, which currently has three implementations:

* `SequenceIdAssigner` assigns numeric ids from each entity's `SEQUENCE`
* `RandomUuidAssigner` assigns random UUIDs if you're using UUID columns
* `TestUuidAssigner` assigns deterministic UUIDs for unit testing

### EntityManager

With the global connection pool and `Driver` instance, you can create per-request `EntityManager` instances:

```typescript
// Your application's per-request Context, if applicable
const ctx = {};
const em = new EntityManager(ctx, driver);
```
