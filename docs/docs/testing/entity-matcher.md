---
title: Custom Jest Matcher
sidebar_position: 4
---

Joist provides a `toMatchEntity` matcher for more pleasant assertions in Jest.

There are two main benefits:

- Automatic loading of relations
- Prettier actual vs. expected output

:::info

To use `toMatchEntity`, you must have the `joist-test-utils` package installed as a `devDependency`.

:::

### Automatic Loading of Relations

A potentially unwieldy pattern in tests is asserting against a "subtree" of data that was not initially loaded, i.e.:

```typescript
const a1 = newAuthor(em);
// Invoke something that adds books with reviews
await addBooksAndReviews(a1);
// Because a1 is New we can access `books.get`, so this is easy...
expect(a1.books.get.length).toEqual(2);
// But beyond that, we can't drill into each book's reviews
// Compile error
expect(a1.books.get[0].reviews.get[0].title).toEqual("title");
```

And so test code would have to explicitly load what it wants to assert against, either with a separate `await b1.reviews.load()` for each individual relation (which can be tedious), or by declaring a "2nd version" of the entity with a `populate` load hint (which is better but also awkward):

```typescript
const a1 = newAuthor(em);
// Invoke something that adds books with reviews
await addBooksAndReviews(a1);
// Preload the subtree of data we want to assert against
const a1_2 = await a1.populate({ books: "reviews" });
// Now we can use get
expect(a1_2.books.get.length).toEqual(2);
expect(a1_2.books.get[0].reviews.get[0].title).toEqual("title");
```

As a third option, `toMatchEntity` provides a `toMatchObject`-style API so that a test can idiomatically declare what the subtree of data should be:

```typescript
const a1 = newAuthor(em);
// Invoke something that adds books with reviews
await addBooksAndReviews(a1);
expect(a1).toMatchEntity({
  books: [
    {
      title: "b1",
      reviews: [{ rating: 5 }],
    },
    {
      title: "b2",
      reviews: [{ rating: 4 }, { rating: -2 }],
    },
  ],
});
```

The upshot is that we get to assert against the entity "as if it's JSON" or "just data", and then `toMatchEntity` takes care of loading the various references and collections.

### Prettier Output

Sometimes when entities are included in Jest failures, i.e. by Jest's native `toMatchObject`, the Jest console output is ugly b/c Jest prints the internal implementation of the entity object (i.e. a failure for "expected `a1`" ends up printing the `a1.books` field, which is actually a `OneToManyCollection` with various internal flags/state, all of which are included in the output).

Even with ~3-4 entities in a native `toMatchObject` assertion, the output can get long and hard to visually parse.

Instead, `toMatchEntity` abbreviates each entity as simply its tagged id, so output for an assertion failure of "the collection expected two books of `b:1` and `b:2` but only had one `b:2`" will look like:

```text
- Expected  - 0
+ Received  + 1

  Object {</>
    "books": Array [
+     "b:1",
      "b:2",
    ],
  }
`);
```

Note that if an entity is new, i.e. the test has not done `em.flush` (which is fine, tests should only `em.flush` if really necessary, to be as fast & lightweight as possible), the abbreviation for an unsaved `Book` will be a "test id" of `b#1` where `b` is the entity's tag, and the `#1` is the index of that particular entity within the `EntityManager`'s entities of that type.

### Installation

In your `setupTests.ts`, add:

```typescript
import { toMatchEntity } from "joist-test-utils";

expect.extend({ toMatchEntity });
```
