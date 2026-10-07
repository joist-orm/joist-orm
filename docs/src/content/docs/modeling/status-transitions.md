---
title: State Transitions
description: Modeling enum-based state machines with transitions
sidebar:
  order: 9
---

Many entities have a status-style [enum](./enum-tables) field, i.e. `BookAdvance.status` that moves from `Pending` to `Signed` to `Paid`, basically forming a state machine.

Joist has three `config` methods to model these state machines:

| Method                   | Answers                            |
|--------------------------|------------------------------------|
| `config.transitions`     | Which changes are possible?        |
| `config.guardTransition` | When is a possible change allowed? |
| `config.onTransition`    | What happens after a change?       |

## Quick Example

Here's an example modeling a book advance's `AdvanceStatus` enum, i.e. whether the advance has/has not been paid to the author:

```typescript
import { bookAdvanceConfig as config } from "./entities";

// Declares the allowed state transitions
config.transitions("status", {
  Pending: ["Signed"],
  // Allow Signed back to Pending for signature revoking
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

The field's setter immediately validates state changes, so an invalid transition immediately throws an error like `Cannot change status from Paid to Pending`, without waiting for `em.flush`.

Creating an entity is not a change, so a new entity may start in any state.

## Guarding changes

`config.guardTransition(field, match, hint?, rule)` checks each state transition that `match` (which declares the `from` & `to` states, potentially multiple of each) describes.

Like `addRule`, it returns an error message to reject the change.

When Joist processes a transition during a reaction pass, it evaluates its matching guards once before
running any matching callbacks. A failing guard immediately stops processing, even if no callback
matches or the field has returned to its original value.

Guards are not rechecked during final validation. A callback or later reaction can change the data a
guard checked without revisiting that transition. Use `addRule` for invariants that must hold in the
final entity state.

The optional `hint` is a load hint, as in `beforeFlush`, so it's loaded before the rule runs.

Guards are different from regular `addRule` validation rules in a few ways:

* **Only fired on matching state transitions.** Other state changes, or changes only to the hinted data, will not trigger the guard, so the guard doesn't need exceptions for unrelated changes.
* **Guards never run on creation,** because there is no `from` previous state. Use `addRule` for rules about an entity's starting state.
* **Every transition is checked in order.** Moving `Pending` -> `Signed` -> `Paid` queues both transitions, even before `em.flush` is called. Joist checks each transition's guards before its callbacks, and stops if a guard fails.

## Reacting to changes

`config.onTransition(field, match, hint?, fn)` runs `fn` for each state transition that `match` describes.

Flush-phase callbacks run whenever reactions are recalculated, including explicit `em.recalc`,
without waiting for `em.flush`. Commit-phase callbacks still wait for the flush's commit phase.

Like `addReaction`, callbacks are named by their source location unless you pass an explicit name:
`config.onTransition(name, field, match, hint?, fn)`. Names must be unique within an entity's config,
including `addReaction` and commit-phase callbacks. If a helper or loop registers multiple callbacks
from the same source location, Joist throws during registration and asks you to pass unique names.

Like [reactions](./reactions), `fn` can change any entity, and those changes can trigger more transitions in the same flush.

Unlike `addReaction`, the `hint` is a "just load hint", as in `beforeFlush`, so it is used to preload data before `fn` is invoked, but data referenced by the hint itself does not trigger the `fn`.

Other behavior:

* **Each entity's transitions fire once, in order.** Different entities are processed in parallel waves,
  with guards finishing before callbacks begin in each wave. This lets hinted data loads batch across entities.
* **Creation fires by default.** Creating an entity with a matching `to` state fires `fn`, because entering a state by creation usually needs the same side effects as entering it by a change.

  To avoid this, you can either pass `onCreate: false`, or set a `from` state, as the `from` clauses never match on creation.
* **Only allowed transitions will fire `onTransition`.** If the table or a guard rejects a change, `fn` doesn't run for it.
* **`phase: "commit"`** runs `fn` in `beforeCommit`, after the entities' SQL changes have been flushed to the database, once for each matching transition. Use it for enqueueing jobs.

:::caution

Guards and reactions see the entity's current state, not its state at the time of the transition.

This means, if you have a transition that fires on `to: "Signed"`, but the advance already moved to `Paid`, then checking `bookAdvance.status` in the lambda will see `Paid`, not `Signed`.

To check the at-time-of-transition state, we provide a `transition` argument:

```typescript
config.onTransition("status", { to: "Signed" }, (ba, ctx, transition) => {
  // `transition.to` is Signed even if `ba.status` is already Paid.
  if (transition.to === AdvanceStatus.Signed) return addReadyToPayJob(ctx, ba);
});
```

But this only covers the `status` field itself, and doesn't snapshot the rest of the entity's overall state at the time of each transition.

:::

## The `match` argument

`guardTransition` takes `GuardTransitionMatch`, while `onTransition` takes `OnTransitionMatch`:

```typescript
interface GuardTransitionMatch<V> {
  // The state before the transition, omitted means any state
  from?: V | readonly V[];
  // The state after the transition, omitted means any state
  to?: V | readonly V[];
}

interface OnTransitionMatch<V> extends GuardTransitionMatch<V> {
  // Fire when an entity is created with a matching `to` state, defaults to true
  onCreate?: boolean;
  // "commit" runs in beforeCommit, after the entities' SQL changes have been flushed to the database
  phase?: "flush" | "commit";
}
```

## New Entity Behavior

It's common for a new entity to be created with a default state and then immediately be mutated to its correct initial state.

Joist recognizes this pattern and doesn't start recording `from` transitions until the first reaction
pass, whether triggered by `em.flush` or `em.recalc`. So in this scenario:

```typescript
// Create a new advance, initially as Pending
const ba = em.create(BookAdvance, { status: AdvanceStatus.Pending, book, publisher });
// While still creating the new entity, mark it as paid
ba.status = AdvanceStatus.Paid;
await em.flush();
```

Joist treats this as creation in Paid, rather than a Pending → Paid transition. No guards run, but `onTransition` callbacks that match creation in Paid (i.e. to Paid, with no from) still fire.

This behavior is also beneficial for both `em.findOrCreate` and test factories, where it's common for an entity to be created with an initial/default status, but then very quickly set "to the right initial value", which should not be considered a true transition change.

## Inheritance

Like validation rules, transition configuration is inherited by entity subtypes. Subtype tables and
guards add restrictions to the base type's configuration, and both base and subtype callbacks run
for matching transitions.

## Test Factories

By default, test factories that set `status: Paid` still trigger the `onTransition`s that have a `to: Paid` match.

Usually this is desirable, i.e. to keep test data as production-like as possible, however if you'd like to disable it, factories also have a `withStatus` (or similarly named opt) that will not trigger `onTransition` reactions on creation:

* `newBookAdvance(em, { status: AdvanceStatus.Paid })` means "created as Paid, and react to that". `onTransition` reactions fire, as they would in production.
* `newBookAdvance(em, { withStatus: AdvanceStatus.Paid })` means "created as Paid, and don't ask why". Joist doesn't record a creation transition, so no `onTransition` reactions fire.
