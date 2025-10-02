---
title: Reactions
description: Documentation for Reactions
sidebar:
  order: 9
---

Reactions are a powerful feature that sits between [Lifecycle Hooks](./lifecycle-hooks) and [Reactive Fields](./reactive-fields), allowing you to run custom business logic whenever specific fields or relations change during flush or recalc.

## Differences from other features

Reactions differ from Reactive Fields in that they:

* **Can make arbitrary changes** to any entity
* **Receives a `Loaded<T, H>`** as its first parameter rather than a `Reacted<T,H>` allowing arbitrary access

Reactions differ from Lifecycle Hooks in that they:
* **Only run when their hint changes**, not on every flush 
* **Can run when the entity has no direct changes**, such as when a related entity changes
* **Can run multiple times per flush** as the reactivity graph settles
* **Takes a [reactive hint](./reactive-fields/#always-up-to-date)** rather than a simpler load hint


Comparison table with Hooks and Reactive Fields:

| Feature                       | Hooks | Reactions | Reactive Fields / References |
|-------------------------------|-------|-----------|------------------------------|
| Runs on every flush           | Yes   | No        | No                           |
| Arbitrary entity mutation     | Yes   | Yes       | No                           |
| Runs multiple times per flush | No    | Yes       | Yes                          |
| Requires database column      | No    | No        | Yes                          |
| Selective triggering          | No    | Yes       | Yes                          |

:::caution

Because reactions can run multiple times per flush, ensure your reaction functions are **idempotent** (safe to run multiple times with the same result) and avoid creating circular dependencies in your reactive hints.

:::

## Setup

Reactions are configured using the entity's `config` API, similar to hooks and validation rules:

```typescript
import { authorConfig as config } from "./entities";

export class Author extends AuthorCodegen {}

// React to firstName changes
config.addReaction("firstName", (author) => {
  // Business logic here
  console.log(`Author name changed to ${author.firstName}`);
});
```
## Named Reactions

For debugging purposes, you can give reactions explicit names:

```typescript
config.addReaction(
  "syncPublisherData",  // name for debugging
  { publisher: ["name", "address"] },
  (author) => {
    // Business logic here
  }
);
```

The name will appear in error messages and logs, making it easier to trace which reaction is executing or causing issues.

## Run-Once Reactions

By default, reactions can run multiple times during a flush as the reactivity graph settles. If you need a reaction to run only once per flush, use the `runOnce` option.  Be aware this means your reaction will not be called again if further changes occur during the same flush:

```typescript
config.addReaction(
  { runOnce: true },
  "firstName",
  (author) => {
    // This will only run once per flush, even if firstName changes multiple times
    sendNotification(author);
  }
);
```

You can also combine `runOnce` with a name:

```typescript
config.addReaction(
  { name: "sendWelcomeEmail", runOnce: true },
  ["firstName", "email"],
  (author) => {
    // Named and runs only once
    queueWelcomeEmail(author);
  }
);
```

## Accessing Context

Reactions receive the same context parameter as hooks, allowing access to the `EntityManager` and any custom context:

```typescript
config.addReaction("status", (author, ctx) => {
  // Access the entity manager
  const em = ctx.em;
  // Access custom context (if configured)
  await ctx.makeApiCall("author-status-changed");
});
```

## Read-Only Relations

If you want to pre-load relations in your reaction but don't want changes to those relations to trigger the reaction, you can mark them as read-only using the `:ro` suffix:.  This is not necessary for fields, as reactions are passed a `Loaded<T, H>` rather than a `Reacted<T, H>` so all primitive fields are available to read.

```typescript
config.addReaction(
  { books_ro: ["title"] },
  (author) => {
    // This reaction triggers on book title changes, but not when books are added or removed from the underlying 
    // relation.  The books relation, however, is still loaded and available to read.
    const publishedBooks = author.books.get.filter(b => b.status === "published");
  }
);
```

## Best Practices

1. **Keep reactions focused**: Each reaction should handle a single concern
2. **Make reactions idempotent**: Since they can run multiple times, ensure they produce the same result
3. **Avoid circular dependencies**: Don't create reactions where A triggers B which triggers A
4. **Use read-only relations**: Mark relations as `:ro` when you only need to read them, not react to them
5. **Don't list all fields**: Only list the fields you need to react to, not all accessed fields like in a rule or reactive field
6. **Consider `runOnce`**: If your reaction has side effects (like sending notifications), use `runOnce: true`
7. **Prefer Reactive Field/Reference for stored values**: If you're calculating a value to store in the database, use a Reactive Field/Reference instead
