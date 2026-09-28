---
name: joist-em-execute
description: Use when writing bulk or immediate SQL INSERT, UPDATE, or DELETE statements with Joist em.execute, including typed table values, set expressions, and returning rows. Explains when to prefer entity mutations and em.flush and which hooks, validation, and in-memory state immediate writes bypass.
---

<!-- Managed by joist-codegen. Do not edit by hand; re-run codegen to update. -->

# Immediate SQL writes with `em.execute`

Prefer mutating entities and calling `em.flush()` so Joist runs validation, hooks, and reactions. Use `em.execute` for bulk SQL writes that must happen immediately:

```ts
import { table, sql } from "joist-orm";

const b = table(Book);
const inserted = await em.execute({
  insert: b,
  values: [{ title: "New book", authorId: "a:1" }],
  returning: b.id,
}); // inserted.rows is BookId[]

const updated = await em.execute({
  update: b,
  set: { order: sql.number`${b.order} + ${1}` },
  where: b.id.eq("b:1"),
  returning: b.order,
}); // updated.rows is number[]

await em.execute({ delete: b, where: b.id.eq("b:1") });
```

- `insert` also supports `from: { from: source, select: [...] }` for INSERT ... SELECT. `returning` accepts a column or a named projection; results are in `.rows`.
- These statements do **not** flush pending entities or run entity hooks, validation, defaults, reactions, updatedAt maintenance, or optimistic locking. Already-loaded entities may be stale afterward; database triggers still run.

Full docs: <https://joist-orm.io/features/sql-mutations/>.
