---
name: joist-em-query
description: Use when writing Joist em.query SELECTs that need aggregates, projections, grouping, subqueries, CTEs, or SQL expressions beyond em.find. Covers typed table aliases, joins, select result shapes, pruning, and the fact that every em.query is a database call.
---

<!-- Managed by joist-codegen. Do not edit by hand; re-run codegen to update. -->

# SQL SELECTs with `em.query`

Use `em.find` for ordinary entity reads; use `em.query` for SQL-shaped SELECTs. Unlike batched `em.find`, **each `em.query` makes a database call**.

```ts
import { tables } from "joist-orm";

const [a, b] = tables(Author, Book);
const rows = await em.query({
  from: a,
  join: [a.books.as(b)],
  select: { name: a.firstName, bookCount: b.id.count() },
  groupBy: [a.firstName],
  orderBy: { bookCount: "DESC" },
}); // { name: string; bookCount: number }[]
```

- `table(Entity)` / `tables(...)` expose typed columns. Join via relation paths (`a.books.as(b)`), a relation tree, or explicit `{ inner: b, on: ... }` / `{ left: b, on: ... }`.
- `select: { ... }` returns typed rows; `select: a.id` returns scalar values; `select: a` returns identity-mapped entities (optionally with `populate`). None are auto-batched.
- Use column methods (`eq`, `gte`, `count`, etc.) in `where`/`having`; compose conditions with `{ and: [...] }` or `{ or: [...] }`. Use `query(...)` for reusable subqueries or CTEs and typed `sql.*` tagged templates for custom SQL.
- Conditions with `undefined` and joins unused after pruning disappear. Use explicit `null` to filter for SQL NULL; use `keep: true` on a join or `pruneJoins: false` if it must remain.
- Joins to collections fan out rows. For a yes/no child filter without duplicates, use `exists` or an `in` subquery.

For immediate INSERT/UPDATE/DELETE, use `joist-em-execute`.
Full docs: <https://joist-orm.io/features/queries-raw/>.
