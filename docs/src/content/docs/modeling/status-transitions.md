---
title: State Transitions
description: Modeling enum-based state machines with transitions
sidebar:
  order: 9
---

Many entities have a status-style [enum](./enum-tables) field, i.e. `BookAdvance.status` that moves from `Pending` to `Signed` to `Paid`, basically forming a state machine.

Joist has three `config` methods to help model the state machine & build business logic around it:

| Method                   | Answers                            |
|--------------------------|------------------------------------|
| `config.transitions`     | Which changes are possible?        |
| `config.guardTransition` | When is a possible change allowed? |
| `config.onTransition`    | What happens after a change?       |

Here's an example modeling a book advance's `AdvanceStatus`, i.e. whether the advance has/has not been paid to the author:

```typescript
import { bookAdvanceConfig as config } from "./entities";

// Declares the allowed state transitions
config.transitions("status", {
  Pending: ["Signed"],
  Signed: ["Paid", "Pending"],
  // Paid is the terminal state
  Paid: [],
});

// Prevent moving to Paid when the book is `Unpublished`
config.guardTransition("status", { to: "Paid" }, "book", (ba) => {
  if (ba.book.get.title === "Unpublished") {
    return "Cannot pay an advance for an unpublished book";
  }
});

// When we're paid & data is almost committed (we're still in the txn),
// schedule our payment job
config.onTransition("status", { to: "Paid", phase: "commit" }, (ba, ctx) => {
  return addPaymentJob(ctx, ba);
});
```

## Declaring allowed changes

`config.transitions(field, table)` maps each "from" state to the "to" states it may transition to.

A state that is missing from the table, or maps to `[]`, is treated as a terminal state & cannot be changed.

If a field transitions in a way the table doesn't list, `em.flush` fails with a validation error like `Cannot change status from Paid to Pending`.

Creating an entity is not a change, so a new entity may start in any state.

## Guarding changes

`config.guardTransition(field, match, hint?, rule)` adds a validation rule that only runs when the field changes in a way that `match` describes.

Like `addRule`, it returns an error message to reject the change. Its `hint` is a load hint, as in `beforeFlush`, so it's loaded before the rule runs, but only the field itself triggers the guard.

Guards are different from regular `addRule` validation rules in a few ways:

* **Only fires on matching state transitions.** Other changes of the field, or changes to only the hinted data, skip it, so the rule doesn't need exceptions for unrelated changes.
* **Guards never run on creation.** At creation there is no previous state, and related entities are often being created in the same flush. Use `addRule` for rules about an entity's starting state.

## Reacting to changes

`config.onTransition(field, match, hint?, fn)` runs `fn` after the field changes in a way that `match` describes.

Like a [reaction](./reactions), `fn` can change any entity, and those changes can trigger more transitions in the same flush. You don't need `em.touch` to make related entities react.

Unlike `addReaction`, the `hint` is a load hint, as in `beforeFlush`. It is loaded before `fn` runs, but changes to the hinted data don't trigger `fn`. Only the field itself does.

Other behavior:

* **Each change fires once.** See [How changes are observed](#how-changes-are-observed).
* **Creation fires by default.** Creating an entity with a matching `to` state fires `fn`, because entering a state by creation usually needs the same side effects as entering it by a change. Set `onCreate: false` for logic that only makes sense for a change. A `match` with a `from` state never fires on creation, because a new entity has no previous state.
* **Only allowed transitions will fire `onTransition`.** If the table or a guard rejects a change, `fn` doesn't run for it.
* **`phase: "commit"`** runs `fn` once in `beforeCommit`, after the entities' SQL changes have been flushed to the database. Use it for enqueueing jobs. Commit-phase transitions see the net change of the whole flush, not each step.

## The `match` argument

`guardTransition` and `onTransition` take the same `match` object:

```typescript
type TransitionMatch<V> = {
  // The state before the transition, omitted means any state
  from?: V | V[];
  // The state after the transition, omitted means any state
  to?: V | V[];
  // onTransition only: fire when an entity is created with a matching `to` state, defaults to true
  onCreate?: boolean;
  // onTransition only: "commit" runs in beforeCommit, after the entities' SQL changes have been flushed to the database
  phase?: "flush" | "commit";
};
```

## How changes are observed

Each `onTransition` remembers the last state it saw for each entity, and fires when the field's current state differs from that state.

1. Setting the field, or creating the entity, queues the reaction like any other reaction.
2. When the reaction runs, it compares the field's current state with the last state this reaction saw. The first time in a flush, that is the state from before the flush.
3. If the states differ, it fires with that `from` and `to`, and remembers the new state. If they are the same, it does nothing.
4. The reaction resets these remembered states when `em.flush` finishes.

A reaction never fires twice for the same change. If the field cycles, i.e. `A -> B -> A -> B`, and the reaction runs after each assignment, it fires for each change it sees: `A -> B`, then `B -> A`, then `A -> B` again. If the whole cycle happens before the reaction runs, it only compares the start and end states, so it fires `A -> B` once. A cycle that ends where it started, i.e. `A -> B -> A`, doesn't fire at all.

### Changes between reactions collapse

Because a reaction only sees states when it runs, several assignments between two runs collapse into one change.

```typescript
// Given a persisted advance that is Pending
ba.status = AdvanceStatus.Signed;
ba.status = AdvanceStatus.Paid;
await em.flush();
```

Joist sees one change, from `Pending` to `Paid`, not `Pending` to `Signed` and then `Signed` to `Paid`. The same happens when a single reaction or hook sets the field more than once before returning.

:::caution

Collapsing has two consequences to plan for:

* **Reactions for the intermediate state don't fire.** A `{ to: "Signed" }` reaction won't run in the example above. If its side effects must happen, move the advance to `Signed` in one flush, and to `Paid` in a later flush, or make the logic part of the `Paid` reaction.
* **The table checks the collapsed change.** With the table above, `Pending` to `Paid` is not allowed, so this flush fails validation, even though each assignment on its own was allowed. Either flush between the assignments, or list the combined change in the table when it is a real path.

:::

Changes made by different reactions can still collapse, depending on timing. Say one reaction moves the advance to `Signed`, and a second reaction reacts to `Signed` by moving it to `Paid`. A third reaction that is queued by the same `Signed` change runs in the same loop as the second one. If it runs first, it sees `Pending` to `Signed`, and later `Signed` to `Paid`. If it runs after the second one, it only sees `Pending` to `Paid`. Don't rely on observing a state that another reaction immediately moves past.

### Why collapse instead of recording every assignment

Recording every assignment would fire reactions for states the entity is no longer in. In the example above, a `{ to: "Signed" }` reaction would run after the advance is already `Paid`, and might send a "ready to pay" notification for a paid advance. Collapsing means each reaction only acts on the state the entity is actually in, which keeps side effects consistent with the data that gets saved.

## Factories

[Test factories](../testing/test-factories) accept a `with` option for each transition field, like they do for [reactive fields](../testing/test-factories):

* `newBookAdvance(em, { status: AdvanceStatus.Paid })` means "created as Paid, and react to that". `onTransition` reactions fire on creation, as they would in production.
* `newBookAdvance(em, { withStatus: AdvanceStatus.Paid })` means "created as Paid, and don't ask why". Joist records the state as already seen by every `onTransition`, so creation fires nothing.

Only the created state is trusted. A later change, even in the same flush, fires the guards and reactions as normal.
