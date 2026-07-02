---
name: joist-partial-updates
description: Joist ORM partial updates, em.upsert, setPartial, nested collection op semantics, and GraphQL/REST/gRPC save inputs. Use when designing, implementing, reviewing, or debugging Joist partial-update or save-input APIs, especially parent-child graphs, id-less nested rows, required-parent validation errors, or accidental collection removal.
---

# Joist Partial Update APIs

Use Joist's native partial-update contract from the transport through to `EntityManager.upsert` or `Entity.setPartial`. Do not load an existing graph and write custom reconciliation code when IDs and Joist collection operations can express the update.

Authoritative documentation: <https://joist-orm.io/features/partial-update-apis/>

## Non-Negotiable Rules

1. Preserve entity IDs across read, edit, and write boundaries.
2. Decide whether every supplied collection is exhaustive or incremental before writing the payload.
3. Omit a field to leave it unchanged. Do not replace omission with `null`, `[]`, or a generated default.
4. A collection array is exhaustive by default. Omitted existing children are removed from the relation.
5. A collection becomes incremental when its child objects use `op`.
6. If any child has `op`, every child in that collection must have `op`, including newly created children.
7. An empty array is always exhaustive and clears the collection. It never means "no changes."
8. Use `{ op: "incremental" }` only as a no-op sentinel when the collection key must be present. Prefer omitting the collection key.
9. Use `include`, `delete`, and `remove` according to their actual relationship semantics.
10. Test updates against an already-persisted graph and flush the unit of work. Mapper-only tests cannot catch detached required children.
11. Authorize every supplied ID and operation. Joist enforces persistence rules, not API permissions or tenant boundaries.

## Partial Field Semantics

Joist distinguishes omission, `undefined`, and `null`:

| Input | Scalar or relation behavior | Collection behavior |
| --- | --- | --- |
| Omitted | Leave unchanged | Leave unchanged |
| `undefined` | Leave unchanged | Leave unchanged |
| `null` | Unset optional value; required value fails validation | Clear the collection |
| Value or array | Set/update | Exhaustively replace unless `op` enables incremental behavior |

Do not globally normalize `null` to `undefined`. That destroys the caller's ability to explicitly unset an optional field. Adapt only fields whose transport representation differs from the entity graph.

Transport-specific presence rules:

- GraphQL: preserve the difference between an omitted input field and an explicit `null`. Codegen commonly produces `T | null | undefined`; this is what `DeepPartialOrNull` and the partial APIs are designed to accept.
- REST/JSON: omission means no change; JSON has no `undefined`, so do not synthesize absent keys while decoding or mapping.
- gRPC/Protobuf: scalar presence can use `optional`, wrappers, or `oneof`, but ordinary repeated fields do not distinguish omitted from empty. Wrap repeated fields in a present message, use a `oneof`, or use a field mask so "unchanged" cannot decode to `[]`.

## Choose the Collection Contract

### Exhaustive Replacement

Use an exhaustive collection only when the caller intentionally sends the complete desired membership:

```ts
await em.upsert(Author, {
  id: "a:1",
  books: [
    { id: "b:1", title: "Retained and updated" },
    { title: "New book" },
  ],
});
```

This removes every omitted existing book from `author.books`. It does not imply hard deletion. If the inverse relation is required, detaching an omitted child can produce validation errors such as `Book author is required`.

Do not use exhaustive replacement when:

- The client does not know every existing child.
- The UI discarded child IDs.
- Omitted children should remain untouched.
- Removed children must be hard-deleted rather than merely detached.

### Incremental Update

Use incremental operations when the request describes additions, updates, removals, or deletions without replacing the whole collection:

```ts
await em.upsert(Author, {
  id: "a:1",
  books: [
    { id: "b:1", op: "include", title: "Updated title" },
    { op: "include", title: "New book" },
    { id: "b:2", op: "delete" },
  ],
});
```

Operation meanings:

| Operation | Behavior |
| --- | --- |
| `include` | Create or update the child, and ensure it belongs to the collection |
| `delete` | Remove the child from the collection and call `EntityManager.delete` |
| `remove` | Detach the child without deleting it |
| `incremental` | No-op sentinel that enables incremental semantics for an otherwise empty list |

Use `remove` only when the child can validly exist without this parent or is being reparented in the same unit of work. For a required parent relation, `remove` alone usually creates an invalid entity. Use `delete` when the child should cease to exist.

An actual empty array still clears:

```ts
await em.upsert(Author, { id: "a:1", books: [] });
```

For an incremental no-op, prefer:

```ts
await em.upsert(Author, { id: "a:1" });
```

If a generic payload builder must emit `books`, use:

```ts
await em.upsert(Author, {
  id: "a:1",
  books: [{ op: "incremental" }],
});
```

## Stable Identity End to End

IDs are the reliable identity contract for active nested updates. A nested object without an ID is normally a request to create a new entity.

For an editable parent-child graph:

1. Query IDs for the parent and every editable nested entity.
2. Include those IDs in API response types.
3. Store IDs in form or draft state.
4. Send retained rows as `{ id, op: "include", ...changes }`.
5. Keep deleted persisted IDs in a deletion list and send `{ id, op: "delete" }`.
6. Send new rows without an ID but with `op: "include"`.
7. Keep the same discipline recursively for grandchildren.

A robust UI row model looks like:

```ts
interface EditableBook {
  id?: string;
  title: string;
}

interface AuthorDraft {
  books: EditableBook[];
  deletedBookIds: string[];
}
```

Do not key editable rows only by array index. Reordering or deleting an earlier row can assign an existing ID to the wrong logical row. Prefer structured row state with stable IDs. If a textarea represents multiple database rows, either maintain line identity explicitly or document why positional identity is safe for that domain.

Do not infer identity from `sortOrder`, names, unique constraints, or array position. Joist may use configured uniqueness for specific upsert cases such as soft-deleted rows, but do not assume `uniqueBy` will match active id-less children. Send the ID unless the current Joist behavior is intentionally relied on and covered by an integration test.

## GraphQL Shape

Make GraphQL inputs mirror Joist's native graph shape:

```graphql
enum UpsertOp {
  include
  remove
  delete
  incremental
}

input SaveAuthorInput {
  id: ID
  firstName: String
  books: [SaveBookInput!]
}

input SaveBookInput {
  id: ID
  op: UpsertOp
  title: String
}
```

The corresponding output query must expose nested IDs:

```graphql
query EditAuthor($id: ID!) {
  author(id: $id) {
    id
    firstName
    books {
      id
      title
    }
  }
}
```

Keep the resolver thin when the schema already matches the entity graph:

```ts
import { type DeepPartialOrNull } from "joist-orm";

async function saveAuthor(input: SaveAuthorInput, em: EntityManager): Promise<Author> {
  return em.upsert(Author, input as DeepPartialOrNull<Author>);
}
```

The cast is appropriate only after checking that relation names, IDs, scalar fields, and nested collection operations align with Joist's expected graph. A cast does not make an incompatible payload safe.

Thin does not mean unchecked. Before calling `upsert`, authorize the parent and every nested ID for the caller's tenant/scope, and validate that each requested attach, reparent, remove, or delete operation is allowed. This security validation is separate from persistence reconciliation.

If the API also accepts convenience fields, such as a textarea that expands into child rows, use a small boundary mapper:

```ts
type SaveAuthorConvenienceInput = SaveAuthorInput & { booksText?: string | null };

function toAuthorUpsertInput(input: SaveAuthorConvenienceInput): DeepPartialOrNull<Author> {
  return {
    id: input.id,
    firstName: input.firstName,
    books: mapBooks(input),
  } as DeepPartialOrNull<Author>;
}

function mapBooks(input: SaveAuthorConvenienceInput) {
  if (input.books !== undefined) return input.books;
  if (input.booksText === undefined) return undefined;
  return parseLegacyBooks(input.booksText ?? "");
}
```

The mapper should transform representation, not reconcile persistence. It must preserve `books: null` as an explicit clear and preserve omission as `undefined`; do not use `??` when `null` and omission have different meanings.

## REST and gRPC Shapes

Use the same graph contract regardless of transport. For example, a REST PATCH body can be:

```json
{
  "id": "a:1",
  "books": [
    { "id": "b:1", "op": "include", "title": "Updated title" },
    { "id": "b:2", "op": "delete" }
  ]
}
```

A gRPC message should model the same operations with an enum and explicit collection presence. A plain `repeated SaveBookInput books` field is unsafe for a partial update because its decoded empty list cannot distinguish "omitted" from "clear." Use a wrapper message inside a `oneof`, or an equivalent field-mask convention:

```proto
message BookChanges {
  repeated SaveBookInput values = 1;
}

message SaveAuthorRequest {
  optional string id = 1;
  oneof books_update {
    BookChanges books = 2;
    bool clear_books = 3;
  }
}
```

An unset `books_update` means unchanged; a present `books` wrapper carries incremental or exhaustive values; `clear_books: true` explicitly clears. Convert generated enum values to Joist's lowercase strings at the boundary if necessary.

Do not invent transport-specific reconciliation semantics. GraphQL, REST, and gRPC should all produce the same `DeepPartialOrNull<Entity>` graph before calling Joist.

## Implementation Workflow

1. Read the entity metadata and identify required inverse relations and delete behavior.
2. Trace the complete read-edit-write path, not only the resolver.
3. Verify every editable output type and query includes stable nested IDs.
4. Verify client state retains those IDs after parsing, normalization, and form edits.
5. Choose exhaustive or incremental semantics independently for every nested collection.
6. Make transport inputs match Joist's graph and expose `op` where incremental updates are needed.
7. Add only the smallest representation mapper required by the transport.
8. Call `em.upsert`, `entity.setPartial`, or a thin shared helper that delegates to them.
9. Flush in an integration test and assert identity, membership, deletion, and untouched fields.

## Failure Signatures

### `<Child> <parent> is required` after updating a parent

Likely cause: an id-less or incomplete child array was interpreted as exhaustive replacement. Joist created new children and detached omitted persisted children, whose required parent relation then failed validation.

Fix: preserve child IDs and either send the complete exhaustive graph or use `op: "include"`/`"delete"` incrementally.

### Duplicate children after each save

Likely cause: existing child IDs are missing from the write payload, so each row is treated as new.

Fix: query, retain, and resend IDs. Do not match by sort order or content on the server.

### All children disappear on a no-change save

Likely cause: a payload builder emitted `children: []`, which is an exhaustive clear.

Fix: omit `children`, or emit `[{ op: "incremental" }]` only if the key is mandatory.

### Incremental update is rejected or behaves exhaustively

Likely cause: only some children have `op`.

Fix: give every child in that collection an operation, including new children.

### GraphQL input does not type-check against Joist

Likely cause: generated nullable input types do not directly match strict entity setters, or the API has convenience fields not present on the entity.

Fix: target `DeepPartialOrNull<Entity>` and use a narrow boundary mapper. Do not weaken unrelated types or write a persistence reconciliation layer.

## Anti-Patterns

Never solve a partial-update mismatch by defaulting to these approaches:

- Loading all existing children in the resolver to assign IDs by array position.
- Diffing old and new child arrays manually.
- Appending custom delete markers after comparing database state.
- Matching active children by `sortOrder`, name, or another mutable field.
- Assuming a database unique constraint supplies identity to an id-less upsert.
- Dropping nested IDs from API output, DTOs, parsers, or form state.
- Mapping an omitted collection to `[]`.
- Mixing children with and without `op` in one collection.
- Using `remove` for a child whose parent relation is required.
- Treating an empty array as an incremental no-op.
- Converting every GraphQL `null` to `undefined`.
- Adding backward-compatibility reconciliation without a concrete shipped caller that requires it.

Custom reconciliation is justified only when the API contract fundamentally cannot carry stable identity or Joist operations, and changing that contract is impossible. Document that constraint before adding such code.

## Regression Tests

For a nested update bug, build a persisted graph before invoking the real API boundary:

1. Create a parent with at least three children.
2. Give one child at least two grandchildren.
3. Update retained entities using their IDs and `op: "include"`.
4. Add one new id-less entity with `op: "include"`.
5. Delete one persisted entity with `op: "delete"`.
6. Omit another relation and prove it remains unchanged.
7. Flush and reload.
8. Assert retained IDs are unchanged, new IDs were created, deleted entities are gone, and no duplicates exist.

Also cover these semantics where relevant:

- Omitted collection leaves membership unchanged.
- Explicit `[]` clears membership.
- `[{ op: "incremental" }]` is a no-op.
- `remove` detaches but does not delete an optional child.
- `delete` hard-deletes.
- Mixed missing/present `op` values are rejected.
- GraphQL or transport-level tests prove nested IDs and operations reach the resolver.

Do not stop at payload snapshots. The original class of failure often appears only during validation or flush.

## Review Checklist

- Are IDs selected for every editable nested entity?
- Are IDs retained in client or caller state?
- Does each supplied collection intentionally use exhaustive or incremental semantics?
- If incremental, does every child have `op`?
- Are new children marked `include`?
- Are deleted persisted IDs sent as `delete`?
- Is `remove` valid for the inverse relation's nullability?
- Can any no-change path emit `[]` accidentally?
- Are omitted fields preserved as omitted or `undefined`?
- Are explicit `null` values preserved where they mean unset?
- Is the resolver a thin `upsert`/`setPartial` boundary instead of a reconciliation engine?
- Does an integration test update a persisted graph and verify stable IDs after flush?
