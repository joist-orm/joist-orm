---
title: SQL Mutations
description: Documentation for immediate SQL mutations with em.execute
sidebar:
  order: 3.3
---

You should nearly always prefer updating your application's data by mutating entities and calling `em.flush()`, so that all of your application's validation rules, reactive fields, and reactions run.

That said, when you really need to issue bulk SQL updates, Joist provides an `em.execute` API that can issue arbitrary `INSERT`, `UPDATE`, and `DELETE` statements.

It works similar to the `em.query` API for doing raw SQL queries.

## Inserts

With insert, you can use either:

- `values` to insert an array of POJOs:

  ```ts
  const b = table(Book);
  const inserted = await em.execute({
    insert: b,
    values: [
      { title: "Book 1", authorId: "a:1", notes: "some notes" },
      { title: "Book 2", authorId: "a:1", notes: "some notes" },
    ],
    returning: { id: b.id, title: b.title },
  });
  // inserted.rows: { id: BookId; title: string }[]
  ```
  
  - The values should be the same domain values as entity fields
  - Missing or `undefined` values use SQL defaults
  - Explicit `null` also means SQL `NULL` (only allowed if the column is nullable)
  - Columns marked `insert: "required"` must be supplied in every row; nullable or defaulted columns may be omitted

- `from` to insert the results of another `SELECT`:
  
  ```ts
  const source = table(Book);
  await em.execute({
    insert: b,
    from: {
      from: source,
      where: source.id.eq("b:1"),
      select: { title: source.title, authorId: source.authorId, notes: source.notes },
    },
    returning: { id: b.id },
  });
  ```

## Updates

```typescript
const updated = await em.execute({
  update: b,
  set: { order: sql.number`${b.order} + ${1}` },
  where: b.id.eq("b:1"),
  returning: b.order,
});
// updated.rows: number[]
```

## Deletes

```typescript
const deleted = await em.execute({
  delete: b,
  where: b.id.eq("b:1"),
});
```

## Transactions and entity state

:::caution[Immediate SQL is not an entity write]

Mutations do not run entity hooks, validation rules, configuration defaults, reactions, `updatedAt` maintenance, or [optimistic locking](/advanced/optimistic-locking/).

They also do not flush pending entities.

Already-loaded entities and collections are not refreshed after a mutation. A later `em.flush()` can overwrite the SQL changes with pending entity edits; database triggers may also change `updated_at` and cause optimistic locking to fail for loaded entities with an older timestamp.

:::
