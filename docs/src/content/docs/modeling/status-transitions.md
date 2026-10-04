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

The field's setter checks the table, so if a field transitions in a way the table doesn't list, the assignment throws a validation error like `Cannot change status from Paid to Pending`, without waiting for `em.flush`.

Creating an entity is not a change, so a new entity may start in any state.

## Guarding changes

`config.guardTransition(field, match, hint?, rule)` adds a validation rule that runs for each state transition that `match` describes.

Like `addRule`, it returns an error message to reject the change. Its `hint` is a load hint, as in `beforeFlush`, so it's loaded before the rule runs, but only the field itself triggers the guard.

Guards are different from regular `addRule` validation rules in a few ways:

* **Only fires on matching state transitions.** Other changes of the field, or changes to only the hinted data, skip it, so the rule doesn't need exceptions for unrelated changes.
* **Guards never run on creation.** At creation there is no previous state, and related entities are often being created in the same flush. Use `addRule` for rules about an entity's starting state.
* **Guards run for every transition, even ones the entity has moved past.** Guards run during `em.flush`, so the entity may already be in a later state. The rule's second argument is the `transition` it's checking, i.e. `{ from: AdvanceStatus.Pending, to: AdvanceStatus.Signed }`.

## Reacting to changes

`config.onTransition(field, match, hint?, fn)` runs `fn` for each state transition that `match` describes.

Like a [reaction](./reactions), `fn` can change any entity, and those changes can trigger more transitions in the same flush. You don't need `em.touch` to make related entities react.

Unlike `addReaction`, the `hint` is a load hint, as in `beforeFlush`. It is loaded before `fn` runs, but changes to the hinted data don't trigger `fn`. Only the field itself does.

Other behavior:

* **Every transition fires once, in order.** See [How transitions are recorded](#how-transitions-are-recorded).
* **Creation fires by default.** Creating an entity with a matching `to` state fires `fn`, because entering a state by creation usually needs the same side effects as entering it by a change. Set `onCreate: false` for logic that only makes sense for a change. A `match` with a `from` state never fires on creation, because a new entity has no previous state.
* **Only allowed transitions will fire `onTransition`.** If the table or a guard rejects a change, `fn` doesn't run for it.
* **`phase: "commit"`** runs `fn` in `beforeCommit`, after the entities' SQL changes have been flushed to the database, once for each matching transition. Use it for enqueueing jobs.

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

## How transitions are recorded

Setters are synchronous, but guards and reactions can be async, so Joist splits the work:

1. When the field is set, the setter checks the `transitions` table, and throws if the table doesn't allow the transition.
2. The setter records the transition. Creating an entity records one creation transition.
3. During `em.flush`, Joist runs each matching guard and `onTransition` once for every recorded transition, in order.
4. Joist forgets the recorded transitions when `em.flush` succeeds.

For example:

```typescript
// Given a persisted advance that is Pending
ba.status = AdvanceStatus.Signed;
ba.status = AdvanceStatus.Paid;
await em.flush();
```

Joist records two transitions, `Pending` to `Signed`, then `Signed` to `Paid`. The table allows both, and both a `{ to: "Signed" }` reaction and a `{ to: "Paid" }` reaction fire. A cycle like `A -> B -> A -> B` fires three times.

:::caution

Guards and reactions see the entity's current state, not its state at the time of the transition. In the example above, the `{ to: "Signed" }` reaction runs while the advance is already `Paid`.

Use the `transition` argument to see which transition is being handled, and check the current state before side effects that only make sense in that state:

```typescript
config.onTransition("status", { to: "Signed" }, (ba, ctx, transition) => {
  // `transition` is { from: AdvanceStatus.Pending, to: AdvanceStatus.Signed }, but the advance may already be Paid
  if (ba.status === AdvanceStatus.Signed) return addReadyToPayJob(ctx, ba);
});
```

:::

## Factories

[Test factories](../testing/test-factories) accept a `with` option for each transition field, like they do for [reactive fields](../testing/test-factories):

* `newBookAdvance(em, { status: AdvanceStatus.Paid })` means "created as Paid, and react to that". `onTransition` reactions fire on creation, as they would in production.
* `newBookAdvance(em, { withStatus: AdvanceStatus.Paid })` means "created as Paid, and don't ask why". Joist doesn't record a creation transition, so creation fires nothing.

Only the created state is trusted. A later transition, even in the same flush, is checked, recorded, and fires the guards and reactions as normal.
