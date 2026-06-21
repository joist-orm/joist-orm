# Reaction Trigger Context Design

## Context

Joist reactions currently run when any field in their reactive hint changes. Inside the reaction, authors can inspect `entity.changes`, but `changes` reflects the entity's current net dirty state, not the reason the reaction was queued.

This matters when a field changes and is restored during the same flush:

```ts
a.publisher.set(p2);
// A reaction or hook restores the original persisted value before another reaction observes it.
a.publisher.set(p1);
```

`ReactionsManager` correctly requeues/reruns reactions after this mid-flush restore, but `a.changes.publisher.hasChanged` returns `false` once `publisher` returns to the original value. This is intentional for public dirty-state semantics: set-then-revert before flush means the entity has no net change to write.

The missing concept is not "is the field currently dirty?" It is "which source field caused this reaction run?"

## Goals

- Preserve existing `entity.changes` semantics.
- Let reactions detect source fields that triggered the current run, even if those fields were restored before the reaction function executes.
- Support direct hints like `"publisher"` and nested hints like `{ books: "title" }` with one API.
- Avoid adding hot-path allocations for existing reactions and reactive fields.

## Non-Goals

- Do not make `changes.hasChanged` sticky until flush completes.
- Do not eagerly expose all trigger records as arrays unless a later use case needs it.
- Do not make reactive fields/references pay for reaction trigger context.

## Proposed API

Expose a third argument for trigger-aware reactions:

```ts
config.addReaction("publisherSync", "publisher", (author, ctx, reaction) => {
  if (reaction.triggeredBy(author, "publisher")) {
    // The author's publisher field triggered this reaction run.
  }
});
```

For nested hints, the same API points at the source entity whose field changed:

```ts
config.addReaction("bookTitleSync", { books: "title" }, (author, ctx, reaction) => {
  if (reaction.triggeredBy(Book, "title")) {
    // At least one Book.title caused this Author reaction run.
  }
});
```

For precise source checks, `triggeredBy` can accept an entity instance:

```ts
config.addReaction("bookTitleSync", { books: "title" }, (author, ctx, reaction) => {
  for (const book of author.books.get) {
    if (reaction.triggeredBy(book, "title")) {
      // This specific book's title caused this author reaction run.
    }
  }
});
```

Proposed shape:

```ts
interface ReactionTriggerContext {
  triggeredBy(entity: Entity, fieldName: string): boolean;
  triggeredBy(cstr: EntityConstructor<Entity>, fieldName: string): boolean;
}
```

The name `triggeredBy` is preferred over `hasField` because it describes source fields, not target fields. For direct reactions those are often the same entity; for nested reactions they are not.

## Concrete Direct Example

Given:

```ts
config.addReaction("publisherSync", "publisher", (author, ctx, reaction) => {
  reaction.triggeredBy(author, "publisher");
});
```

And:

```ts
author.publisher.set(p2);
author.publisher.set(p1);
```

The reaction should be able to observe:

```ts
author.changes.publisher.hasChanged === false;
reaction.triggeredBy(author, "publisher") === true;
```

This preserves the difference between net dirty state and reaction trigger history.

## Concrete Nested Example

Given:

```ts
config.addReaction("bookTitleSync", { books: "title" }, (author, ctx, reaction) => {
  reaction.triggeredBy(Book, "title");
});
```

And two independent changes in one flush:

```ts
b1.author.set(a1);
b2.author.set(a2);

b1.title = "New B1";
b2.title = "New B2";
```

The correct trigger relationships are:

```ts
b1.title -> a1 reaction
b2.title -> a2 reaction
```

So the reaction contexts should behave like:

```ts
// During a1's reaction run:
reaction.triggeredBy(b1, "title") === true;
reaction.triggeredBy(b2, "title") === false;
reaction.triggeredBy(Book, "title") === true;

// During a2's reaction run:
reaction.triggeredBy(b1, "title") === false;
reaction.triggeredBy(b2, "title") === true;
reaction.triggeredBy(Book, "title") === true;
```

This cannot be derived from the current `followReverseHint` result, because it returns only the target entities:

```ts
followReverseHint("bookTitleSync", [b1, b2], ["author"]);
// returns [a1, a2]
```

That answer is sufficient for "which reactions should run?" but it has lost the source-to-target mapping required for `reaction.triggeredBy(b1, "title")`.

## Why TriggeredBy Needs A Source-Preserving Walk

Current reverse walking intentionally dedupes to a target set:

```ts
Set<Book> [b1, b2] -> follow author -> Set<Author> [a1, a2]
```

For trigger context, the walk must preserve pairs:

```ts
b1 -> follow author -> a1
b2 -> follow author -> a2
```

When actions are deduped by target entity and reaction name, their trigger data must be merged into that action:

```ts
Map<targetEntity, Map<sourceEntity, FieldMask>>
```

If both `b1.title` and `b2.title` point to the same author, there should still be one author reaction action, but it should know about both source books:

```ts
b1.author.set(a1);
b2.author.set(a1);
b1.title = "New B1";
b2.title = "New B2";

// One action for a1, with both source triggers:
a1 <- b1.title
a1 <- b2.title
```

Without preserving source identity during the reverse walk, `triggeredBy(Book, "title")` can be approximated, but `triggeredBy(b1, "title")` cannot be answered correctly.

## Implementation Sketch

Add per-pending trigger tracking alongside the existing pending todo/done sets:

```ts
type FieldMask = string | string[];

type Pending = {
  todo: Set<Entity>;
  done: Set<Entity>;
  dirtyFields?: Map<Entity, FieldMask>;
};
```

`queueDownstreamReactables(entity, fieldName)` would record the source entity and source field for trigger-aware reactions:

```ts
pending.todo.add(entity);
addDirtyField(pending, entity, fieldName);
```

`dequeueDownstreamReactables(entity, fieldName)` would remove a pending field only if the reactable has not already run. If `pending.done.has(entity)` is true, keep or re-add the field as the reason for the rerun.

When `recalcPendingReactables` builds actions:

- For non-trigger-aware reactables, keep the current `followReverseHint` path.
- For direct trigger-aware reactions, attach trigger masks directly from `pending.dirtyFields`.
- For nested trigger-aware reactions, use a source-preserving reverse walk that returns target entities with their contributing source triggers.
- When multiple source paths arrive at the same target action key, merge trigger masks into the same action.

Build the trigger context before invoking any reaction function. This is important because synchronous reaction A can mutate or restore a field before reaction B runs in the same loop. Reaction B still needs the trigger context captured from queueing time, not from current `changes` state.

## Performance Notes

Trigger context should be opt-in because queueing happens from field setters and can be hot.

Preferred options:

```ts
config.addReaction({ name: "sync", trackTriggers: true }, hint, (entity, ctx, reaction) => {});
```

or, as a convenience with an explicit override:

```ts
const wantsTriggers = fn.length >= 3;
```

Allocation rules:

- Do not allocate trigger objects like `{ entity, fieldName }` during queueing.
- Do not use `Set<string>` per source entity in the common case.
- Store a single `string` for the first field, and upgrade to `string[]` only when multiple fields trigger the same source entity/reactable.
- Do not eagerly expose `reaction.triggers` as an array.
- Keep the existing bulk `followReverseHint` for all non-trigger-aware reactions.
- Run the source-preserving reverse walk only for trigger-aware nested reactions.

This keeps existing apps on the current low-allocation path and charges the extra mapping work only to reactions that request trigger context.

## Open Questions

- Should `trackTriggers` be required, or should `fn.length >= 3` imply it?
- Should `triggeredBy(EntityConstructor, fieldName)` include subtypes for CTI/STI hierarchies?
- Should a later version expose a lazy `reaction.triggers` iterable for debugging or audit-style use cases?
- Should field names be typed from the source entity in public overloads, or should the first version keep them as `string` for implementation simplicity?
