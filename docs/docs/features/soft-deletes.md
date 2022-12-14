---
title: Soft Deletes
sidebar_position: 6
---

Joist has built-in support for the soft-delete pattern, of marking rows with a `deleted_at` column and then "mostly ignoring them" within the application.

In our experience, it's common to have application bugs where business logic "forgets to ignore soft-deleted rows", so Joist flips the model to where soft-deleted rows are *ignored by default*, and business logic needs to explicitly opt-in to seeing them.

### Setup

To use Joist's soft-delete support, just add `deleted_at` columns to any entity you want to soft-delete.

If you want to change the name of the `deleted_at` column, you can configure that in `joist-config.json`'s `timestampFields` key:

```json
{
  "timestampFields": {
    "deletedAt": {
      "names": ["deleted_at"],
      "required": true
    }
  }
}
```

Note that currently Joist assumes that `deleted_at` columns are timestamps, but they should work as `boolean` columns as well.

### Behavior

When rows are soft-deleted, Joist will still fetch them from the database, but any accessors will, by default, filter them out of the results.

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

### Notes

Currently, Joist does not implicitly modify any SQL queries to ignore soft-deleted rows.

For example `em.find(Book, { title: "t1" })` does not inject a `WHERE deleted_at IS NOT NULL` into the SQL query, so it will return soft-deleted books.

The rationale for this is a combination of:

1. Implementation simplicity, it's easier to let SQL queries fetch all rows and then filter them in-memory
2. If soft-deleted rows are not loaded up-front, then the `getWithDeleted` opt-in method would need to be `async`, to "go back to the database" and now fetch the rest of the rows.

Granted, this does have the downside of likely needlessly fetching soft-deleted rows; if you have a large amount of soft-deleted rows such that this is problematic, then you can either:

- Just manually add `{ deletedAt: null }` conditions to your queries, or
- Work on adding this "implicitly update `WHERE` clauses" feature to Joist
