---
name: joist-upsert
description: Implement partial-update / RPC / GraphQL save endpoints with Joist using setPartial, createPartial, em.upsert, and incremental collection ops. Use when a create/update accepts a subset of fields, treats null as "unset", or saves a parent plus a mix of new and existing children.
---

<!-- Managed by joist-codegen. Do not edit by hand; re-run codegen to update. -->

# Joist partial updates & upsert

These APIs exist for "partial update" endpoints (REST/GraphQL/gRPC) where the
input is loosely typed (`string | null | undefined`) and follows the
conventions:

- A subset of fields may be sent; omitted fields are left as-is.
- `null` means "unset this field".
- Children collections can be updated incrementally.

Joist's normal `em.create` / `Entity.set` are intentionally strict and won't
accept `string | null | undefined`. The partial variants opt into the looser
semantics.

## `setPartial`

```ts
// firstName is typed `string | null | undefined` (e.g. from a GraphQL input)
const author = await em.load(Author, "a:1");
author.setPartial({ firstName }); // compiles; `set` would not
```

Semantics, per field:

- Required field (`firstName`): value updates it; `undefined` does nothing;
  `null` is a **validation error** (required field can't be unset).
- Optional field (`lastName`): value updates it; `undefined` does nothing;
  `null` unsets it (sets to `undefined`).
- Collection (`books`): `[b1]` sets it to exactly `[b1]`; `null` sets it to
  `[]`; `undefined` does nothing.

`em.createPartial(Author, ...)` and `em.upsert(Author, ...)` share these
semantics.

## `em.upsert` — parent plus children

`em.upsert` saves a parent and a mix of new/existing children in one call. It is
**async** (unlike `em.create`) because it may issue `SELECT`s to resolve
existing child ids.

```ts
await em.upsert(Author, {
  id: "a:1",                       // update author 1
  books: [
    { title: "new book" },         // no id -> create
    { id: "b:1" },                 // existing, unchanged
    { id: "b:2", title: "updated" }, // existing, updated
  ],
});
```

By default a collection is set **exhaustively** — any existing child not listed
is removed.

## Incremental collections (`op`)

To change only some children without sending the whole collection, add an `op`
hint to each child:

```ts
author.setPartial({
  books: [{ op: "include", title: "b3" }], // adds b3, leaves existing books
});
```

- `{ op: "include", id }` — add if needed, or update an existing child
- `{ op: "remove", id }` — remove from the collection (no delete)
- `{ op: "delete", id }` — remove and `em.delete` the child

Rules and gotchas:

- If **any** child has an `op`, **all** children must have one.
- `op` is not a real entity field — it's only a hint on the input type.
- An **empty** list always clears the collection (it looks like an exhaustive
  set), so to send "no changes" omit the collection key entirely. Alternatively
  include a single `{ op: "incremental" }` sentinel child to force incremental
  semantics without adding/removing anything.

## Legacy keys (soft-deprecated)

Older code used `delete: true` / `remove: true` instead of `op`; still
supported, but prefer `op` for new code:

```ts
author.setPartial({
  books: [{ id: "b:1", delete: true }, { id: "b:2", remove: true }, { id: "b:4" }],
});
```
