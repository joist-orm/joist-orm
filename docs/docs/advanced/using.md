---
title: Async Disposable
sidebar_position: 3
---

Joist's `EntityManager` can be used with the new `using` keyword in TypeScript 5.2, to auto-`flush` changes to the database.

For example, in a method that creates an `EntityManager`:

```typescript
async function performWork() {
  // Create an EntityManager w/your context & driver
  await using em = new EntityManager({}, driver);
  // Load an entity
  const a1 = await em.load(Author, "a:1");
  // Make any mutations
  a1.firstName = "a2";
  // That's it; `em.flush` will be called automatically
}
```

Note that the `em.flush` method can fail if any validation rules are invalid, or any errors occur while running hooks, in which case the caller of `performWork` would get a rejected promise.

:::caution

As a disclaimer, the `using` statement is new, so we're not 100% sure if it's usage will end up being idiomatic or not.

For example, it's common to do an explicit `em.flush` to ensure changes are committed to the database, any reactivity within the domain model has been executed, and only then build out a return value, i.e. a GraphQL result or REST response payload.

If you build a GraphQL result or REST payload before executing `em.flush`, you risk building it based on values that will be changed by hooks & derived values, so just keep that in mind.

The best practice is to ensure `em.flush` is ran before creating response values.

::: 
