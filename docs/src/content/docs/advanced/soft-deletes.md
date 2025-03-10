---
title: Soft Deletes
description: Documentation for Soft Deletes
---

Joist has built-in support for the soft-delete pattern, of marking rows with a `deleted_at` column and then "mostly ignoring them" within the application.

In our experience, it's common to have application bugs where business logic "forgets to ignore soft-deleted rows", so Joist flips the model to where soft-deleted rows are _ignored by default_, and business logic needs to explicitly opt-in to seeing them.

## Setup

To use Joist's soft-delete support, just add `deleted_at` columns to any entity you want to soft-delete.

By default, Joist will pick up any column named `deleted_at` or `deletedAt` as a soft-delete column, and use it for implicit filtering.

If you want to change the name of the `deleted_at` column, you can configure that in `joist-config.json`'s `timestampFields` key:

```json
{
  "timestampFields": {
    "deletedAt": {
      "names": ["deleted_at"]
    }
  }
}
```

Note that currently Joist assumes that `deleted_at` columns are timestamps, but they should work as `boolean` columns as well.

## Load/Populate Behavior

When entities are soft-deleted, Joist's `populate` methods will still fetch their rows from the database, but collection accessors (i.e. `o2m.get` and `m2m.get`) will filter them out of the results.

For example, if an `Author` has a soft-deleted `Book`:

```typescript
// This loads all books for a:1 from the db
const a = await em.load(Author, "a:1", "books");
// This list will not include any soft-deletes books
console.log(a.books.get);
```

If you do want to explicitly access soft-deleted rows, you can use the `getWithDeleted` accessor:

```typescript
// This list will be everything
console.log(a.books.getWithDeleted);
```

## Find Queries

`em.find` queries also filter out soft-deleted rows by default but at the database level (by adding a `WHERE deleted_at IS NULL` to the query).

If you'd like to include soft-deleted rows in a `find` query, you can use the `softDeletes` option:

```ts
const allBooks = await em.find(Book, {}, { softDeletes: "include" });
```
