---
title: Schema Assumptions
sidebar_position: 3
---

Joist makes several assumptions about your database schema, as described below.

:::caution

Ideally you are developing your database schema greenfield with Joist from day one, so you can just adopt these assumptions/conventions from the beginning.

However, if this is not the case, hopefully it would not be too bad to nudge your schema towards what Joist expects.

Eventually Joist may have configuration options to work with different schema conventions, but today is does not. 

:::

### Entity Tables

Joist expects entity tables (i.e. `authors`, `books`) to:
 
1. Be named using plurals, i.e. `authors` instead of `author`,

   :::note

   Technically Joist rarely "guesses" table names, mostly just for the initial "what is the entity name for this table name?", so this constraint may actually be pretty soft in practice.

   :::

2. Always have at least these three columns:

    * `id` primary key/serial
    * `created_at` `timestamptz`
    * `updated_at` `timestamptz`

   Joist automatically maintains the `created_at`/`updated_at` columns for each row/entity during `EntityManager.flush`.

   :::tip

    If you have non-Joist clients that update entities tables, or use bulk/raw SQL updates, you can create triggers that mimic this functionality (but will not overwrite `INSERT`s / `UPDATE`s that do set the columns), see [joist-migration-utils](https://github.com/stephenh/joist-ts/blob/main/packages/migration-utils/src/utils.ts#L73).

   (This methods use `node-pg-migrate`, but you can use whatever migration library you prefer to apply the DDL.)

   :::

   :::note

    Eventually Joist should configurable enablement of `created_at`/`updated_at` columns, but for now it is assumed/required to have them.

   :::

5. Have a single primary key column, `id`, that is `SERIAL`/auto-increment

### Enums as Tables

Joist models enums (i.e. `EmployeeStatus`) as their own database tables with a row-per-value. 

I.e. `epmloyee_status` (singular) might have two rows like:

```
id  | code          | name
----+---------------+---------------
1   | FULL_TIME     | Full Time
2   | PART_TIME     | Part Time
```

And will be codegen'd as:

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

### Many-to-many tables

Joist expects join tables to have four columns:

* `id` primary key/serial
* One foreign key column for 1st side
* One foreign key column for 2nd side
* `created_at` `timestamptz`

(`updated_at` is not applicable to join tables.)

### Deferred Foreign Key Constraints

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

### Composite Primary Keys

Joist does not support composite primary keys.
