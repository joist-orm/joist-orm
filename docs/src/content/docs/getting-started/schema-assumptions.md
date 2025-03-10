---
title: Schema Assumptions
description: Documentation for Schema Assumptions
---

Joist makes a few assumptions about your database schema, primarily that you have a modern/pleasant database schema that you want directly mapped to your TypeScript domain model.

## Surrogate Keys

The term "surrogate key" basically means "all your tables have an `id` column".

The opposite of a surrogate key is a natural key, like identifying rows in an `employees` table by an `ssn` column, or a composite key like `employer_id` + `employee_number`.

Joist takes the opinionated/simplifying stance that natural keys are an older, legacy pattern of domain modeling, and that `id` surrogate keys are best practice for modern applications.

If you have an existing schema that lacks surrogate keys, you should be able to add an `id` column to your existing tables, with a default value, and not break your existing application.

:::tip[Info]

Joist supports several types of `id` columns:

* `int` or `bigint` with a sequence
* `uuid` with Joist's `RandomUuidAssigner`
* `text` with an `IdAssigner` that manually assigns ids (i.e. [cuid](https://github.com/paralleldrive/cuid)s)

We also currently require `id` columns for many-to-many tables, see [this issue](https://github.com/joist-orm/joist-orm/issues/1321).

:::

## Entity Tables

Joist requires entity tables (i.e. `authors`, `books`) to have a single primary key column, `id`, that is either:

1. An `id`, `serial`, `int`, or `bigint` type, that uses a sequence called `${tableName}_id_seq`, or
2. An `uuid` type

And that is it; you can:

* Use either singular or plural table names (`author` or `authors`)
* Use either underscore or camel cased column names (`first_name` or `firstName`)

If you use plural table names, Joist will de-pluralize them for the entity name, e.g. `authors` -> `Author`.

:::tip[Info]

We have added Postgres data types to Joist only as we've personally needed them; if you use a data type that Joist doesn't support yet, you'll get an error when running `joist-codegen`, but please just open an issue or PR, and we'll be happy to look in to it.

:::

## Deferred Constraints (Recommended)

Joist automatically batches all `INSERT`s and `UPDATE`s within an `EntityManager.flush`, which results in the best performance, but means that foreign keys might be temporarily invalid (i.e. we've inserted a `Book` with an `author_id` before the `Author` is inserted).

The cleanest way to handle this, is by telling Postgres to _temporarily_ defer foreign key checks until the end of the transaction.

To enable this, foreign keys must be created with this syntax:

```sql
CREATE TABLE "authors" (
  "publisher_id" integer REFERENCES "publishers" DEFERRABLE INITIALLY DEFERRED,
);
```

If you're using node-pg-migrate, Joist's `joist-migration-utils` package has utility methods, i.e. `createEntityTable` and `foreignKey`, to apply these defaults for you, but you should be able to do the same in any migration library.

The first time you run `joist-codegen`, Joist will output any foreign keys it finds that are not deferred, and create an `alter-foreign-keys.sql` file you can apply to convert them over.

That said, this is *optional*; if you don't want to use deferred foreign keys, you can set `nonDeferredForeignKeys: "ignore"` in your `joist-config.json`, and Joist will stop outputting this warning.


:::tip[Info]

One scenario where deferred keys are required is if you have `NOT NULL` cycles in your schema.

An example is having `authors.favorite_book_id` and `books.author_id`, both of which are `NOT NULL`.

When creating an `Author` and a `Book`, there is no way for Joist to "choose which one goes first", and so in this scenario you must either make one of the FKs nullable (i.e. the `authors.favorite_book_id`, in which case Joist will insert the `Author` first), or make one of the FKs deferred.

:::

## Timestamp Columns

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

:::tip[Tip]

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

