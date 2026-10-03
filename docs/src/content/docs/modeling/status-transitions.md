---
title: Status Transitions
description: Documentation for config.transitions, guardTransition, and onTransition
sidebar:
  order: 9
---

Many entities have a status-style [enum](./enum-tables) field, i.e. `BookAdvance.status` that moves from `Pending` to `Signed` to `Paid`. Joist has three `config` methods that make the field's state machine explicit:

| Method                       | Answers                              | Kind of logic                                    |
|------------------------------|--------------------------------------|--------------------------------------------------|
| `config.transitions`         | Which changes are possible?          | A static table, checked as a validation rule     |
| `config.guardTransition`     | When is a possible change allowed?   | A validation rule that only runs for some changes |
| `config.onTransition`        | What happens after a change?         | A [reaction](./reactions) that fires once per change |

Each method takes the field name first, so an entity file reads as a description of that field's state machine. You can use any of them on its own.

```typescript
import { AdvanceStatus, bookAdvanceConfig as config } from "./entities";

config.transitions("status", {
  Pending: ["Signed"],
  Signed: ["Paid", "Pending"],
  Paid: [],
});

config.guardTransition("status", { to: "Paid" }, { book: "title" }, (ba) => {
  if (ba.book.get.title === "Unpublished") return "Cannot pay an advance for an unpublished book";
});

config.onTransition("status", { to: "Paid", phase: "commit" }, (ba, ctx) => {
  return addPaymentJob(ctx, ba);
});
```

## Declaring allowed changes

`config.transitions(field, table)` maps each value to the values it may change to. A value that is missing from the table, or maps to `[]`, can never change.

If a flush changes the field in a way the table doesn't list, `em.flush` fails with a validation error like `Cannot change status from Paid to Pending`.

Creating an entity is not a change, so a new entity may start with any value.

### Writing values

Tables and `match`es accept three spellings of the same value:

* The enum's accessor as a string, i.e. `"Paid"` for `AdvanceStatus.Paid`
* The enum's code, i.e. `"PAID"`
* The enum member itself, i.e. `AdvanceStatus.Paid`

All three are type-checked, so a typo like `"Payed"` is a compile error.

Accessor strings work because `joist-codegen` finds `config.transitions`, `config.guardTransition`, and `config.onTransition` calls in your entity files, the same way it finds `config.setDefault`. For those fields it adds the accessor names to the field's type. At runtime, Joist converts accessors to codes using the `enumType` that `metadata.ts` emits for every enum field.

## Guarding changes

`config.guardTransition(field, match, hint?, rule)` adds a validation rule that only runs when the field changes in a way that `match` describes. Like `addRule`, it returns an error message to reject the change, and its `hint` is a [reactive hint](./reactive-fields).

Use a guard for conditions that depend on other data, which a static table can't express. Guards differ from `addRule` in a few ways:

* **Only matching changes run the rule.** Other changes of the field, or changes to only the hinted data, skip it, so the rule doesn't need exceptions for unrelated changes.
* **Guards never run on creation.** At creation there is no previous value, and related entities are often being created in the same flush. Use `addRule` for rules about an entity's starting value.
* **Guards compare the value before the flush with the value being saved.** If a reaction changes related entities during the flush, read their `changes.<field>.originalValue` to see the state the flush started from.

## Reacting to changes

`config.onTransition(field, match, hint?, fn)` runs `fn` after the field changes in a way that `match` describes. Like a [reaction](./reactions), `fn` can change any entity, and those changes can trigger more transitions in the same flush. You don't need `em.touch` to make related entities react.

Unlike `addReaction`, the `hint` is a load hint, as in `beforeFlush`. It is loaded before `fn` runs, but changes to the hinted data don't trigger `fn`. Only the field itself does.

Other behavior:

* **Each change fires once.** See [How changes are observed](#how-changes-are-observed).
* **Creation fires by default.** Creating an entity with a matching `to` value fires `fn`, because entering a value by creation usually needs the same side effects as entering it by a change. Set `onCreate: false` for logic that only makes sense for a change. A `match` with a `from` value never fires on creation, because a new entity has no previous value.
* **Rejected changes don't fire.** If the table or a guard rejects the change, `fn` doesn't run, because the flush will fail validation anyway.
* **`phase: "commit"`** runs `fn` once in `beforeCommit`, after all SQL has been written. Use it for enqueueing jobs. Commit-phase transitions see the net change of the whole flush, not each step.

## The `match` argument

`guardTransition` and `onTransition` take the same `match` object:

```typescript
type TransitionMatch<V> = {
  // The value before the change, omitted means any value
  from?: V | V[];
  // The value after the change, omitted means any value
  to?: V | V[];
  // onTransition only: fire when an entity is created with a matching `to` value, defaults to true
  onCreate?: boolean;
  // onTransition only: "commit" runs in beforeCommit with the flush's net change
  phase?: "flush" | "commit";
};
```

## How changes are observed

Joist doesn't record every assignment to the field. Instead, each `onTransition` remembers the last value it saw for each entity, and fires when the field's current value differs from that value.

1. Setting the field, or creating the entity, queues the reaction like any other reaction.
2. When the reaction runs, it compares the field's current value with the last value this reaction saw. The first time in a flush, that is the value from before the flush.
3. If the values differ, it fires with that `from` and `to`, and remembers the new value. If they are the same, it does nothing.
4. `em.flush` forgets these values when it finishes.

Each `onTransition` has its own memory, so one reaction firing doesn't hide a change from another reaction. A reaction never fires twice for the same change.

The `transitions` table is checked the same way, by its own internal reaction.

### Changes between reactions collapse

Because a reaction only sees values when it runs, several assignments between two runs collapse into one change.

```typescript
// Given a persisted advance that is Pending
ba.status = AdvanceStatus.Signed;
ba.status = AdvanceStatus.Paid;
await em.flush();
```

Joist sees one change, from `Pending` to `Paid`, not `Pending` to `Signed` and then `Signed` to `Paid`. The same happens when a single reaction or hook sets the field more than once before returning.

:::caution

Collapsing has two consequences to plan for:

* **Reactions for the intermediate value don't fire.** A `{ to: "Signed" }` reaction won't run in the example above. If its side effects must happen, move the advance to `Signed` in one flush, and to `Paid` in a later flush, or make the logic part of the `Paid` reaction.
* **The table checks the collapsed change.** With the table above, `Pending` to `Paid` is not allowed, so this flush fails validation, even though each assignment on its own was allowed. Either flush between the assignments, or list the combined change in the table when it is a real path.

:::

Changes made by different reactions can still collapse, depending on timing. Say one reaction moves the advance to `Signed`, and a second reaction reacts to `Signed` by moving it to `Paid`. A third reaction that is queued by the same `Signed` change runs in the same loop as the second one. If it runs first, it sees `Pending` to `Signed`, and later `Signed` to `Paid`. If it runs after the second one, it only sees `Pending` to `Paid`. Don't rely on observing a value that another reaction immediately moves past.

### Why collapse instead of recording every assignment

Recording every assignment would fire reactions for values the entity no longer has. In the example above, a `{ to: "Signed" }` reaction would run after the advance is already `Paid`, and might send a "ready to pay" notification for a paid advance. Collapsing means each reaction only acts on the value the entity actually has, which keeps side effects consistent with the data that gets saved.

## Factories

[Test factories](../testing/test-factories) accept a `with` option for each transition field, like they do for [reactive fields](../testing/test-factories):

* `newBookAdvance(em, { status: AdvanceStatus.Paid })` means "created as Paid, and react to that". `onTransition` reactions fire on creation, as they would in production.
* `newBookAdvance(em, { withStatus: AdvanceStatus.Paid })` means "created as Paid, and don't ask why". Joist records the value as already seen by every `onTransition`, so creation fires nothing.

Only the created value is trusted. A later change, even in the same flush, fires the guards and reactions as normal.
