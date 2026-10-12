---
title: State Transitions
description: Modeling enum-based state machines with transitions
sidebar:
  order: 9
---

Many entities have a status-style [enum](./enum-tables) field, i.e. `BookAdvance.status` that moves from `Pending` to `Signed` to `Paid`, basically forming a state machine.

Joist has three `config` methods to model these state machines:

| Method                         | Answers                            |
|--------------------------------|------------------------------------|
| `config.setTransitions`        | Which changes are possible?        |
| `config.addTransitionRule`     | When is a possible change allowed? |
| `config.addTransitionReaction` | What happens after a change?       |

## Quick Example

Here's an example modeling a book advance's `AdvanceStatus` enum, i.e. whether the advance has/has not been paid to the author:

```typescript
import { bookAdvanceConfig as config } from "./entities";

// Declares the allowed state transitions
config.setTransitions("status", {
  Pending: ["Signed"],
  // Allow Signed back to Pending for signature revoking
  Signed: ["Paid", "Pending"],
  // Paid is the terminal state
  Paid: [],
});

// Prevent moving to Paid when the book is `Unpublished`
config.addTransitionRule("status", { to: "Paid" }, "book", (ba) => {
  if (ba.book.get.title === "Unpublished") {
    return "Cannot pay an advance for an unpublished book";
  }
});

// When we're paid & data is almost committed (we're still in the txn),
// schedule our payment job
config.addTransitionReaction("status", { to: "Paid", phase: "commit" }, (ba, ctx) => {
  return addPaymentJob(ctx, ba);
});
```

## Design Rationale

To a certain extent, transitions are just "special rules & reactions", with these core differences:

- Normal validation rules run at the end of `em.flush` and only see the entities' final state, which is normally perfectly fine/desirable behavior.

  But for state machines, you often want to validate each specific step of `stateA` -> `stateB` -> `stateC` flow, even if they all happen in a single `em.flush` -- `addTransitionRule` let's you do this, because a) it's invoked earlier in `em.flush`, and b) we record every state transition and make sure it's rules are invoked for each one.

- Normal reactions similarly see "the _latest_ entity change" on each invocation, not "_every_ change" since the reaction was last ran--again usually fine/desirable behavior.

  But again state machines usually want to see each individual transition, so similar to `addTransitionRule`, `addTransitionReaction` will be invoked for each discrete transition that Joist observes.

Both `addTransitionRule` and `addTransitionReaction` basically just "do more bookkeeping" that applications could technically do by hand on top of normal validation rules & reactions, but the state/status enum pattern is common enough that its worth implementing as a first-class feature in Joist.

## Declaring Allowed Changes

`config.setTransitions(field, table)` configures each "from" state to its allowed "to" states.

```ts
config.setTransitions("status", {
  Pending: ["Signed"],
  Signed: ["Paid", "Pending"],
  Paid: [],
});
```

Any state missing from the table, or set to `[]`, is a terminal state & cannot be changed.

Joist instruments the field's setter (i.e. `bookAdvance.status = Paid`) to validate & record the state change, so an invalid transition immediately throws an error, i.e. `Cannot change status from Paid to Pending` without waiting for `em.flush`.

Creating an entity is not a change, so a new entity may start in any state. If you want to prevent this, you can use a regular `addRule` validation rule.

## Validating Changes

`config.addTransitionRule(field, match, hint?, rule)` validates each state transition that its `match` parameter matches against.

```ts
config.addTransitionRule("status", { to: "Paid" }, "book", (ba) => {
  if (ba.book.get.title === "Unpublished") {
    return "Cannot pay an advance for an unpublished book";
  }
});
```

Like `addRule` validation rules, it returns an error message to reject the change.

Unlike `addRule`s, which are ran as the final phase of `em.flush` after all changes have settled, transition rules are ran immediately before `addTransitionReaction` callbacks (see the next section), so that they can evaluate "should we have allowed this change state to happen?".

Note that technically the lambda is still invoked _after_ the state change was made, during the reactions phase `em.flush`, so you can use `changes` or `originalValue`s to evaluate any "existing/previous state" business logic.

Also unlike regular `addRule`s, transition rules do not run on newly-created entities, because the entity has no `from` previous state. Use `addRule` for rules about an entity's starting state.

:::tip[Info]

Ideally transition rules really could run immediately "during the setter", however because setters are synchronous, and transition rules are asynchronous, Joist has to wait until `em.flush()` to invoke the transition rules.

:::

## Reacting to Changes

`config.addTransitionReaction(field, match, hint?, fn)` runs `fn` for each state transition that its `match` parameter matches against.

```ts
config.addTransitionReaction("status", { to: "Paid", phase: "commit" }, (ba, ctx) => {
  return addPaymentJob(ctx, ba);
});
```

By default, `addTransitionReaction` callbacks run whenever reactions are recalculated, either during an explicit `em.recalc`, or waiting for `em.flush`. Alternatively, they can also run during the `em.flush` commit phase, see the `phase` param below.

Like [reactions](./reactions), the transititon's `fn` lambda can change any entity, and those changes can trigger more transitions (even to the same field it's reacting to) in the same flush.

Unlike `addReaction`, the `hint` is a "just load hint", as in `beforeFlush`, so it is used to preload data before `fn` is invoked, but data referenced by the hint itself does not reactively trigger the `fn` to be invoked when its changed--only the `field` state field changing invokes transition reactions.

Note that unlike `addTransitionRule`, `addTransitionReaction`s _do_ actually run on newly-created entities, as long as their `to` matches. The rationale is that entered a state, even when newly created, usually needs the same side effects as entering the state via a change. To avoid this, you can either pass `onCreate: false`, or set a `from` state, as the `from` clauses never match on creation.

Only allowed transitions will fire `addTransitionReaction`, i.e. if the `setTransititons` table or a `addTransitionRule` rejects a change, then `addTransitionReaction`s for that state change will not be ran.

If you pass `phase: "commit"`, then `fn` will be invoked similarlly to a `beforeCommit` hook, after the entities' SQL changes have been flushed to the database, once for each matching transition. Use it for enqueueing jobs.

:::caution

Guards and reactions see the entity's current state, not its state at the time of the transition.

This means, if you have a transition that fires on `to: "Signed"`, but the advance already moved to `Paid`, then checking `bookAdvance.status` in the lambda will see `Paid`, not `Signed`.

To check the at-time-of-transition state, we provide a `transition` argument:

```typescript
config.addTransitionReaction("status", { to: "Signed" }, (ba, ctx, transition) => {
  // `transition.to` is Signed even if `ba.status` is already Paid.
  if (transition.to === AdvanceStatus.Signed) return addReadyToPayJob(ctx, ba);
});
```

But this only covers the `status` field itself, and doesn't snapshot the rest of the entity's overall state at the time of each transition.

:::

## Matching Transitions

Both `addTransitionRule` and `addTransitionReaction` take a `match` parameter that has `to` and `from` keys:

```typescript
interface Match<V> {
  // The state before the transition, omitted means any state
  from?: V | readonly V[];
  // The state after the transition, omitted means any state
  to?: V | readonly V[];
}
```

Either can be a single state, or an array of states.

## New Entity Behavior

It's common for a new entity to be created with a default state and then immediately be mutated to its correct initial state.

Joist recognizes this pattern and doesn't start recording `from` transitions until the first reaction pass, whether triggered by `em.flush` or `em.recalc`. So in this scenario:

```typescript
// Create a new advance, initially as Pending
const ba = em.create(BookAdvance, { status: AdvanceStatus.Pending, book, publisher });
// While still creating the new entity, mark it as paid
ba.status = AdvanceStatus.Paid;
await em.flush();
```

Joist treats this as creation in Paid, rather than a Pending → Paid transition. No guards run, but `addTransitionReaction` callbacks that match creation in Paid (i.e. to Paid, with no `from`) still fire.

This behavior is also beneficial for both `em.findOrCreate` and test factories, where it's common for an entity to be created with an initial/default status, but then very quickly set "to the right initial value", which should not be considered a true transition change.

## Modeling Tip

Joist doesn't order reactions and transitions when invoking them, so if a `status` change triggers multiple reactions & transitions that are actually dependent on each other, they will race each other and likely cause bugs.

The best way to solve these race conditions is **give each step its own state**, and represent the dependency between each state as a first-class notion directly in your domain model.

For example, an `Approval` entity might currently have an initial `Pending` state that needs both:

1. Create its list of `Approver`s, and
2. Move itself to `Approved` once every `Approver` has approved.

If both of these watch the single Approval `Pending` state change, the second reaction might run before the first one has created any
approvers, see that "every approver has approved" (because there are none), and approve too early.

We can fix this by modeling each step as its own state, so each piece of logic knows when to run:

```typescript
 // Split the old singular `Pending` state into two: `Opening` and `PendingDecision`
config.setTransitions("status", {
  Opening: ["PendingDecision"],
  PendingDecision: ["Approved", "Rejected"],
});

// Opening only prepares the approvers, and then hands off to PendingDecision
config.addTransitionReaction("status", { to: "Opening" }, (approval) => {
  createApprovers(approval);
  approval.status = ApprovalStatus.PendingDecision;
});

// PendingDecision only watches the approvers, which now exist
config.addReaction({ status: {}, approvers: "status" }, (approval) => {
  if (!approval.isPendingDecision) return;
  if (approval.approvers.get.every((a) => a.isApproved)) approval.status = ApprovalStatus.Approved;
});
```

Now our the `addTransitionReaction` and `addReaction` know exactly when each should run.

## Inheritance

Like validation rules, transition configuration is inherited by entity subtypes. Subtype tables and
guards add restrictions to the base type's configuration, and both base and subtype callbacks run
for matching transitions.

## Test Factories

By default, test factories that set `status: Paid` still trigger the `addTransitionReaction`s that have a `to: Paid` match.

Usually this is desirable, i.e. to keep test data as production-like as possible, however if you'd like to disable it, factories also have a `withStatus` (or similarly named opt) that will not trigger `addTransitionReaction` reactions on creation:

* `newBookAdvance(em, { status: AdvanceStatus.Paid })` means "created as Paid, and react to that". `addTransitionReaction` reactions fire, as they would in production.
* `newBookAdvance(em, { withStatus: AdvanceStatus.Paid })` means "created as Paid, and don't ask why". Joist doesn't record a creation transition, so no `addTransitionReaction` reactions fire.
