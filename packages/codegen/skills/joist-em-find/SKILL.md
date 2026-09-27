---
name: joist-em-find
description: Use when writing or debugging Joist em.find, findOne, or findOneOrFail entity queries, including relation filters, OR conditions, optional filters, collection joins, and N+1 behavior. For aggregates or custom SELECTs, use joist-em-query instead.
---

<!-- Managed by joist-codegen. Do not edit by hand; re-run codegen to update. -->

# Finding entities with `em.find`

Prefer `em.find` for entity SELECTs: Joist automatically batches finds to avoid N+1 queries. Nested relation filters become joins; inline conditions are AND-ed:

```ts
const books = await em.find(Book, {
  author: { firstName: "Alice" },
  publishedAt: { gte: jan1 },
});
```

- Operators include `eq`, `ne`, `in`, `gt`, `gte`, `lt`, `lte`, `like`, and `ilike`. Pass an entity or tagged ID to filter a reference.
- `undefined` drops a condition and any unused join; use explicit `null` for `IS NULL`.
- For `OR`, bind `alias(Book)` with `{ as: b }` and pass `{ conditions: { or: [b.title.eq("A"), b.title.eq("B")] } }` as the third argument. Bind aliases on joined tables too when conditions span relations.
- Collection filters usually become `EXISTS` subqueries to avoid duplicate roots. Complex alias conditions may instead use `LEFT JOIN`s; opt into multiple collection left joins only when the fanout is intentional.
- `findOne` returns `undefined` when absent; `findOneOrFail` throws. Both reject multiple matches.
- Normal `find` reads the database, not unflushed entity changes; use `findWithNewOrChanged` for flat filters that must include in-memory changes.

For aggregates, projections, subqueries, or explicit SQL control, use `joist-em-query`.
Full docs: <https://joist-orm.io/features/queries-find/>.
