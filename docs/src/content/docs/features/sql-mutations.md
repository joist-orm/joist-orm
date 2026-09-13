---
title: SQL Mutations
description: Documentation for immediate SQL mutations with em.execute
sidebar:
  order: 3.3
---

You should nearly always prefer updating your application's data by mutating entities & calling `em.flush()`, so that all of your application's validation rules, reactivity fields, and reactivity run.

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
    }],
    returning: { id: b.id, title: b.title },
  });
  // inserted.rows: { id: BookId; title: string }[]
  ```
  
  - The values should be the same domain values as entity fields
  - Missing or `undefined` values become SQL `NULl`
  - Explicit `null` also means SQL `NULL` (only allowed if the column is nullable)
  - `NOT NULL` columns are required

- `from` to insert the results of another `SELECT`:
  
  ```ts
  const source = table(Book);
  await em.execute({
    insert: b,
    from: {
      from: source,
      where: source.id.eq("b:1"),
      select: [source.title, source.authorId, source.notes],
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

Note that database triggers still run and may change `updated_at` timestamps in the database, which if you do have entities loaded into memory (with the prior `updated_at` values), might cause an self-oplock failure.
