---
title: Schema Assumptions
sidebar_position: 1
---

Joist makes a few assumptions about your database schema, which basically assume you have a modern/pleasant database schema that you want directly mapped to your TypeScript domain model.

## Entity Tables

Joist expects entity tables (i.e. `authors`, `books`) to have a single primary key column, `id`, that is either:

1. A `id` / `serial` type, that uses a sequence called `${tableName}_id_seq`, or
2. A `uuid` type

And that is it; you can:

* Use either singular or plural table names (`author` or `authors`)
* Use either underscore or camel cased column names (`first_name` or `firstName`)

If you use plural table names, Joist will de-pluralize them for the entity name, e.g. `authors` -> `Author`.

:::info

We have added Postgres data types to Joist only as we've personally needed them; if you use a data type that Joist doesn't support yet, you'll get an error when running `joist-codegen`, but please just open an issue or PR, and we'll be happy to look in to it.

:::

### Deferred Constraints

Joist batches all `INSERT`s and `UPDATE`s within an `EntityManager.flush`, which results in the best performance, but means that foreign keys might be temporarily invalid (i.e. we've inserted a `Book` with an `author_id` before the `Author` is inserted).

Joist handles this by telling Postgres to _temporarily_ defer foreign key checks until the end of the transaction.

To enable this, foreign keys must be created with this syntax:

```sql
CREATE TABLE "authors" (
  ...
  "publisher_id" integer REFERENCES "publishers" DEFERRABLE INITIALLY DEFERRED,
  ...
);
```

If you're using node-pg-migrate for your migrations, Joist's `joist-migration-utils` NPM package has utility methods, i.e. `createEntityTable` and `foreignKey`, to apply these defaults for you, but you should be able to do the same in any migration library.

:::info

As a longer example explaining the nuance of insertion order, given `Publisher`/`Author` entities, if deferred FK constraints are not used then:

* Sometimes `Publisher` needs flushed first to satisfy an `authors.publisher_id` foreign key constraint, but
* Other times `Author` needs flushed first to satisfy a `publishers.top_author_id` foreign key constraint.
* Or, even trickier, if mixing `authors` and `publishers` `INSERT`s and `DELETE`s in the same transaction: should we delete authors then insert publishers, or delete publishers then insert authors, etc.

Using deferred constraints makes this complexity & non-deterministic insertion order go away.

:::

:::tip

If you have an existing schema, and need to convert your existing foreign keys to deferrable, you can use [pg-structure](https://www.pg-structure.com/) in a migration to loop over them like:

```typescript
import pgStructure from "pg-structure";

const client = getYourDbClient();
const db = await pgStructure(client, { includeSchemas: "public" });
for (const table of db.tables) {
  for (const constraint of table.constraints) {
    if (constraint instanceof ForeignKey) {
      await b.db.query(`
        ALTER TABLE ${table.name}
        ALTER CONSTRAINT ${constraint.name}
        DEFERRABLE INITIALLY DEFERRED
      `);
    }
  }
}
```

:::

### Timestamp Columns

Entity tables can optionally have `created_at` and `updated_at` columns, which Joist will automatically manage by setting `created_at` when creating entities, and updating `updated_at` when updating entities.

In `joist-config.json`, you can configure the names of the `timestampColumns`, which defaults to:

```json
{
  "timestampColumns": {
    "createdAt": { "names": ["created_at", "createdAt"], "required": false },
    "updatedAt": { "names": ["updated_at", "updatedAt"], "required": false }
  }
}
```

For example, if you want to strictly require `created_at` and `updated_at` on all entities in your application's schema, you can use:

```json
{
  "timestampColumns": {
    "createdAt": { "names": ["created_at"], "required": true },
    "updatedAt": { "names": ["updated_at"], "required": true }
  }
}
```

:::tip

 If you have non-Joist clients that update entities tables, or use bulk/raw SQL updates, you can create triggers that mimic this functionality (but will not overwrite `INSERT`s / `UPDATE`s that do set the columns), see [joist-migration-utils](https://github.com/joist-orm/joist-orm/blob/main/packages/migration-utils/src/utils.ts#L73).

(These methods use `node-pg-migrate`, but you can use whatever migration library you prefer to apply the DDL.)

:::

## Enum Tables

Joist models enums (i.e. `EmployeeStatus`) as their own database tables with a row-per-enum value.

For example, `employee_status` might have two rows like:

```
id  | code          | name
----+---------------+---------------
1   | FULL_TIME     | Full Time
2   | PART_TIME     | Part Time
```

And Joist will generate code that looks like:

```typescript
enum EmployeeStatus {
  FullTime,
  PartTime,
}
```

This "enums-as-tables" approach allows the entities reference to the enum, i.e. `Employee.status` pointing to the `EmployeeStatus` enum, to use foreign keys to the enum table, i.e. `employees.status_id` is a foreign key to the `employee_status` table. This enables:

1. Data integrity, ensuring that all `status_id` values are valid statuses, and
2. Allows Joist's code generator to tell both that `employees.status_id` is a) of the type `EmployeeStatus` and b) how many enum values `EmployeeStatus` has.

Joist expects enum tables to have three columns:

* `id` primary key/serial
* `code` i.e. `FOO_BAR`
* `name` i.e. `Foo Bar`

The `joist-migration-utils` package has `createEnumTable`, `addEnumValue`, and `updateEnumValue` helper methods to use in your migrations.

And, as mentioned, entities that want to use this enum should have a foreign key that references the appropriate enum table.

If you do not wish to use enums as tables, native enums can be used as well, and Joist will generate the Typescript enum.

## Many-to-Many Join Tables

Joist expects join tables to have three or four columns:

* `id` primary key/serial
* One foreign key column for 1st side
* One foreign key column for 2nd side
* `created_at` `timestamptz` (optional)

(`updated_at` is not applicable to join tables.)

