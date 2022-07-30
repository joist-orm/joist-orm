---
title: Schema Assumptions
sidebar_position: 1
---

Joist makes several assumptions about your database schema, as described below.

## Entity Tables

Joist expects entity tables (i.e. `authors`, `books`) to have a single primary key column, `id`, that is either:

1. A `id` / `serial` type, that uses a sequence called `${tableName}_id_seq`, or
2. A `uuid` type

### Singular vs. Plural

You can use either singular table names, e.g. `book`, or plural table names, e.g. `books`.

### camelCase or snake_case

Joist will work with column names that are camelCase or snake_case.

### Timestamp Columns

Entity tables can optionally have `created_at` and `updated_at` columns, which when present Joist will auto-manage the setting of `created_at` when creating entities, and updating `updated_at` when updating entities.

In `joist-codegen.json`, you can configure the names of the `timestampColumns`, which defaults to:

```json
{
  "timestampColumns": {
    "createdAt": { "names": ["created_at", "createdAt"], "optional": true },
    "updatedAt": { "names": ["updated_at", "updatedAt"], "optional": true }
  }
}
```

For example, if you want to strictly require `created_at` and `updated_at` on all entities in your application's schema, you can use:

```json
{
  "timestampColumns": {
    "createdAt": { "names": ["created_at"], "optional": false },
    "updatedAt": { "names": ["updated_at"], "optional": false }
  }
}
```

:::tip

 If you have non-Joist clients that update entities tables, or use bulk/raw SQL updates, you can create triggers that mimic this functionality (but will not overwrite `INSERT`s / `UPDATE`s that do set the columns), see [joist-migration-utils](https://github.com/stephenh/joist-ts/blob/main/packages/migration-utils/src/utils.ts#L73).

(This methods use `node-pg-migrate`, but you can use whatever migration library you prefer to apply the DDL.)

:::

## Enum Tables

Joist can model enums (i.e. `EmployeeStatus`) as their own database tables with a row-per-value.

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

## Many-to-many Join Tables

Joist expects join tables to have three or four columns:

* `id` primary key/serial
* One foreign key column for 1st side
* One foreign key column for 2nd side
* `created_at` `timestamptz` (optional)

(`updated_at` is not applicable to join tables.)

## Deferred Foreign Key Constraints

Joist's goal of "batch all operations" can be difficult to achieve and still satisfy foreign key constraints, particularly as multiple types of entities are flushed to the database in a single transaction.

For example, when dealing with a publisher/author pair of entities, i.e. sometimes the `publisher` needs to be flushed first to satisfy an `author.publisher_id` foreign key constraint, and other times the `author` needs to be flushed first to satisfy a (say) `publisher.top_author_id` foreign key constraint. Or, even trickier, if mixing `author` and `publisher` `INSERT`s and `DELETE`s in the same transaction; should we delete authors then insert publishers, or delete publishers then insert authors, etc.

The easiest way for Joist to deal with this, and still keep it's "batch everything" goal, is to rely on deferred foreign key constraints, which tells Postgres that _temporarily_ violating foreign key constraints in the middle of a transaction is fine,
as long as at `COMMIT` time, the right values are in place and satisfy the checks.

To turn this capability on, you need to create your foreign keys with this syntax:

```sql
CREATE TABLE "authors" (
  ...
  "publisher_id" integer REFERENCES "publishers" DEFERRABLE INITIALLY DEFERRED,
  ...
);
```

See the `joist-migration-utils` utility methods, i.e. `createEntityTable` and `foreignKey` to always apply these defaults for you.

:::tip

If you need to convert your existing foreign keys to deferrable, you can use `pg-structure` in a migration to loop over them like:

```typescript
const db = await newPgStructure({ includeSchemas: "public" });
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
