---
title: Test Utils
sidebar_position: 5
---


## `run` Helper Method

While the `DeepNew` provided by Joist's [test factories](./test-factories.md) allows ergonomically asserting against entities without `await`s, it assumes that no other code (i.e. a separate `EntityManager`) has mutated the entities in the underlying database.

However, often it's desirable for your code-under-test to have a "clean slate" `EntityManager` that starts out completely empty, and isn't affected by your test's own setup code / own `EntityManager`, to avoid missing production bugs that only passed the tests b/c of a side effect in the test's `EntityManager`.

To support this, Joist provides a `run` function that will, given your test's `em`, create a new `EntityManager` and run the code-under-test against it:

```typescript
import { run } from "joist-test-utils";

it("creates a book", async () => {
  const em = newEntityManager();
  // Given an author
  const a = newAuthor(em);
  // When we perform the business logic
  await run(em, (em) => performPostBook(em, { title: "t1" }));
  // Then we have a new book
  expect(a.books.get.length).toEqual(1);
  // And it has the right title
  expect(a.books.get[0].title).toEqual("t1");
});
```

Furthermore, after the `performPostBook` is executed, `run` will **automatically refresh all entities** in your test's `EntityManager`, so that they see the latest values that the code-under-test's `EntityManager` committed to the database.

This means we can immediately assert against `a.books.get` without needing to load "a 2nd `Author`" instance for the same row, which can be really common in tests that interact with a stateful database:

```typescript
const a1 = newAuthor(em);
await performPostBook(em);
// Example of what we _don't_ need to do: reload a1
await a1_2 = em.load(Author, a1.idOrFail);
expect(a.books.get.length).toEqual(1);
```

`run` accomplishes this by calling the `EntityManager.refresh` method, which reloads all currently-loaded entities from the database.
