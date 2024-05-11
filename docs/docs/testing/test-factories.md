---
title: Test Factories
sidebar_position: 0
---

Joist provides customizable factories for easily creating test data.

This lets tests succinctly create entities, with all required fields & dependencies filled in:

```ts
// Given an author
const a = newAuthor(em);
```

Factories also allow easily creating "trees" of test data:

```ts
// Given one author with three books
const a1 = newAuthor(em, { books: [{}, {}, {}] });
// And a second author with two draft books
const a2 = newAuthor(em, { books: [{ draft: true }, { draft: true } });
// Then ...some business case...
```

The approach is very similar to generic test factory tools like [Fishery](https://github.com/thoughtbot/fishery), but with deep/native integration with Joist.

## Goal

The goal of test factories are to provide tests (and only tests!) with "valid by default" instances of entities, so that **each test can set only the fields/state that is unique to its boundary case**.

Joist also fundamentally assumes the database is reset between each test (see [Fast Database Resets](./fast-database-resets.md)), and so allowing tests to succinctly create the entire graph of entities they need is a key part of Joist's developer experience.

:::tip

Note that Joist's factories are **not intended to be used in production code**; they are only for quickly creating synthetic data in unit tests.

:::

## Overview

For example, given a `Book` entity, Joist creates an initial `newBook.ts` file that looks like:

```typescript
import { EntityManager, FactoryOpts, New, newTestInstance } from "joist-orm";
import { Book } from "../entities";

export function newBook(em: EntityManager, opts: FactoryOpts<Book> = {}): New<Book> {
  return newTestInstance(em, Book, opts, {});
}
```

Tests can then call `newBook` with as few opts as they want, and all required fields (for both primitives and relations) will be filled in.

For example, since `book.author_id` is a not-null column, calling `const b1 = newBook()` will create both a `Book` with a `title` (required primitive field) as well as create a new `Author` (required foreign key/many-to-one field) and assign it to `b1.author`:

```typescript
const b = newBook(em);
expect(b.title).toEqual("title");
expect(b.author.get.firstName).toEqual("firstName");
```

This creation is recursive, i.e. `newBookReview()` will make a new `BookReview`, a new `Book` (required for `bookReview.book`), and a new `Author` (required for `book.author`).

Importantly, you can also pass partials for either the book or the author:

```typescript
// Given a book by the author "a1"
const b = newBook(em, { author: { firstName: "a1" } });
// Then we got the default title
expect(b.title).toEqual("title");
// And "a1" was used as the author's firstName
expect(b.author.get.firstName).toEqual("a1");
```

This is key so that your tests can **set only the minimum amount of fields necessary to specify their boundary case**, and defer to the factories for any other irrelevant boilerplate.

## Usage

### Defaults for Primitives

Factories can provide test suite-wide defaults, for example providing a default age:

```typescript
// Default Authors (only within tests) to age 40
export function newAuthor(
  em: EntityManager,
  opts: FactoryOpts<Author> = {},
): DeepNew<Author> {
  return newTestInstance(em, Author, opts, {
    age: 40,
  });
}
```

And then every `newAuthor` will have an `age` of 40, unless a test specifically requires a different age:

```typescript
// Given an author that is 30
const a = newAuthor(em, { age: 30 });
// Then we didn't use the default age
expect(a.age).toEqual(30);
```

:::tip

This can be particularly helpful when you're adding a new field to an existing entity, and want all tests to have a default value for the new field, without updating every individual test.

:::

### Unique Strings

If you have a field that must be unique, like `name` with a database-enforce `UNIQUE` constraint, you can use the `testIndex` helper to automatically create unique-but-deterministic values:

```typescript
import { testIndex } from "joist-orm";

export function newBook(em: EntityManager, opts: FactoryOpts<Book> = {}): New<Book> {
  return newTestInstance(em, Book, opts, {
    // Make a unique name, `testIndex` will be 1/2/etc increasing and reset per-test
    title: `b${testIndex}`,
  });
}
```

### Defaults for References

Factories can also provide default entities, for example a book creating a default author:

```typescript
export function newBook(em: EntityManager, opts: FactoryOpts<Book> = {}): New<Book> {
  return newTestInstance(em, Book, opts, {
    author: {},
  });
}
```

Note that, if `author` was required, we would not have to explicitly pass `author: {}`; we'd only pass `author` to `newTestInstance` if:

- The `author` field is not required, but we want all test `Book`s to have one anyway
- We want all `Book`s' authors to themselves have some specific defaults, like `author: { age: 30 }`,
- We want to explicitly create a _new_ author (see the next point)

### Reusing Existing Entities

When factories need to set a relation field, they will first look for an "obvious default" entity before creating a new entity.

This is useful for stitching together complex schemas, because it means validation rules like "a `BookReview` must have the same `bookReview.author` as its `bookReview.author.book`" (pretending that `BookReview` had its own `author` field) will pass "for free" because we don't "sprawl out" and continually create new/unnecessary entities.

That said, Joist will only reuse an entity if there is a _single_ instance of that entity.

```typescript
// Given we have a single author
const a = newAuthor(em);
// Then newBook will see "there is only 1 author" and assume we want that one
const b = newBook(em);
expect(b.author.get).toEqual(a);
```

If there are multiple `Author`s created in the test, Joist sees it as ambiguous which one it should use, and so creates a new `Author`:

```typescript
// Given we have two existing Authors
const [a1, a2] = [newAuthor(em), newAuthor(em)];
// Then newBook will create a 3rd Author
const b = newBook(em);
expect(b.author.get.name).toEqual("a3");
```

#### Forcing New Entities

If you want to a specific field to never reuse existing entities, you can use `{}` as a marker for "always create a new entity":

```typescript
export function newBook(em: EntityManager, opts: FactoryOpts<Book> = {}): New<Book> {
  return newTestInstance(em, Book, opts, {
    author: {},
  });
}
```

#### Reusing Entities With `use`

As covered, if your test has already created multiple entities of a given type (e.g. multiple `Author`s), Joist will not use them as "obvious defaults", but if you want to nominate a specific `Author` as the default for a given `newBookReview` call, you can pass the `use` option:

```typescript
// We have multiple authors
const [a1, a2] = [newAuthor(em), newAuthor(em)];
// Make a new book review, but use a2 instead of creating a new Author
const br = newBookReview(em, { use: a2 });
```

### Defaults for Collections

If you have validation rules like "all `Author`s must have at least one `Book`", the `newAuthor` factory can create valid-by-default `Author`s by passing `books: [{}]`:

```typescript
export function newAuthor(em: EntityManager, opts: FactoryOpts<Author> = {}): DeepNew<Author> {
  return newTestInstance(em, Author, opts, {
    // Every Author has at least one Book
    books: [{}],
  });
}
```

Note that, due to the native factory integration, Joist is smart enough that if you create the graph "bottom up" and call `newBook()`, it will be smart enough to know that `newAuthor` should not create a 2nd book:

```typescript
// Given we create a book
const b = newBook(em);
// Then `newAuthor` was effectively passed `books: [b]` and did not create a 2nd book
expect(b.author.get.books.get.length).toBe(1);
```

### Custom Opts

Besides just setting existing entity fields, like `Author.firstName` and `Books.author`, Joist's factories allow you to declare custom, factory-specific opts so that multiple tests can request the similar "pre-baked" test data from a factory.

:::info

In fishery, these are called transient params.

:::

For example, a test might need to create a somewhat large graph of test data for a business scenario, perhaps a `Book` with a signed contract with a larger publisher (this is not that big, but it's a good example):

```typescript
// Given a book that is signed with a large publisher
const b = newBook(em, {
  author: {
    contracts: [{ signed: true, publisher: { type: "large" } }],
  },
});
```

If this "create a book ... with an author ... with a contract ... that is signed" is a common requirement for tests, it can be cumbersome to copy/paste this snippet across many tests, and keep it up to date (perhaps `signed` changes from `true` to a `signedOn` timestamp).

Instead, Joist's factories allow you to add a custom `withSignedContract` opt to the `newBook` factory:

```typescript
// Add an optional `withSignedContract` opt
export function newBook(
  em: EntityManager,
  opts: FactoryOpts<Book> & { withSignedContract?: boolean } = {},
): New<Book> {
  return newTestInstance(em, Book, opts, {
    // Conditionally create the snippet when requested
    ...(opts.withSignedContract ? { author: { contracts: [{ signed: true, publisher: { type: "large" } }] } } : {}),
  });
}
```

And now tests can request this behavior for free:

```typescript
// Given we have a book with a signed contract
const book = newBook(em, { title: "b1", withSignedContract: true });
// And it also works if going through BookReview
const br = newBookReview(em, { book: { withSignedContract: true } });
```

In general, we have two recommendations for this feature:

- Be careful and don't abuse it; tests are simplest to read when any assertions they have are against data that is specified directly inline in the "Given" block; if you've abstracted too much of your test's setup to a custom opt, it will hurt readability.

  Also, custom opts are a slippery slope to the seed data anti-pattern, where the seed data becomes so large & gnarly (because it's been tweaked over the years to support more and more disparate test cases), that the seed data becomes very brittle and can't be changed without failing a ton of tests.

- Use prefixes like `with` and `and` in the names of custom opts, e.g. `withSignedContract` or `andSigned` to make it clear to readers that the opt is custom to the factory and not actually a regular database/entity field.

### Disabling Factory Defaults

Sometimes you'll have a test that wants to opt-out of the defaults provided by a factory.

You can do this by using `useFactoryDefaults: false`, for example if `newAuthor.ts` establishes a default age of 40, you can ignore it by passing `useFactoryDefaults: false`:

```typescript
// Ignore the default when creating an author
const a = newAuthor(em, { useFactoryDefaults: false });

// You can also ignore when creating an author via another factory
const br = newBookReview(em, {
  book: { author: { useFactoryDefaults: false } },
});
```

Setting `useFactoryDefaults: false` ignores the defaults inside of `newAuthor.ts`, `newBook.ts`, etc., but it does not disable Joist's fundamental "required fields must always be set" defaults.

If you want to disable those as well, you can use `useFactoryDefaults: "none"`:

```typescript
// Ignore all defaults
const b = newBook(em, { useFactoryDefaults: "none" });
// Normally this would be "title", but is left unset
expect(b.title).toBeUndefined();
// Normally this would be a new/existing Author, but is left unset
expect(b.author.get).toBeUndefined();
```

:::tip

If you find yourself regularly using `useFactoryDefaults`, it might be an indication that your factory's defaults are too opinionated, and the factory should do less by default.

For example, instead of the factory having "not actually universally required/useful" defaults that frequently need to be turned off, only the tests that actually rely on the sometimes-wanted/sometimes-not-wanted defaults should opt in to them via a dedicated custom opt.

:::

## DeepNew / `async` Free Assertions

In production code, Joist relations must be accessed asynchronously, i.e. either with `load()` calls or `populate` preloads:

```typescript
// Call load directly
const b1 = await em.load(Book, "b:1");
const a1 = await book.author.load();
// Use a preload
const b2 = await em.load(Book, "b:2", "author");
const a2 = book.author.get;
```

However, because in tests we "just know" there is a) not that much data, and b) the factories control the instantiation of all entities, we can make the assumption that all relations are loaded already.

So factories return a special `DeepNew` type that marks all relations as loaded:

```typescript
it("some test", async () => {
  const em = newEntityManager();
  // Given a book
  const b1 = newBook(em);
  // When we exercise our production code
  performSomeBusinessLogic(b1);
  // Then we can assert against b1.authors w/o an await/load
  expect(b1.authors.get.length).toBe(1);
  // And we can assert against the author's publisher
  expect(b1.authors.get[0].publisher.get.name).toBe("p1");
});
```

This capability can dramatically clean up test assertions, by removing the need for `await` and `load()` calls.

:::tip

Also see Joist's [toMatchEntity](./entity-matcher.md), which provides another ergonomic way to assert against entities.

:::

## Singletons with the `useExisting` option

Sometimes when a test has just called `newAuthor`, we want the factory to realize that, due to unique constraints/business logic specific to `Author`, that the appropriate `Author` instance the test is asking for already exists.

An example is schemas with "enum-like" or "singleton" entities. Enum-like entities are user-added rows in the database (they are not a true `enum`), but still have enum-like behavior like "there should be only one of these entities for the given (name, parent, etc.) set of values", potentially backed by database-level unique constrains.

An example might be a `PublisherType` entity that is effectively unique on a `name` column, where the desired behavior is:

```ts
// Creates a new PublisherType w/name: large
newPublisher(em, { type: { name: "large" } });
// Creates a new PublisherType w/name: small
newPublisher(em, { type: { name: "small" } });
// Should reuse the existing PublisherType w/name: large
newPublisher(em, { type: { name: "large" } });
```

In these situations, you effectively want your factory to "scan existing entities" and look for an entity that matches the test's requested opts.

To do this, you can use the `useExisting` flag on `newTestInstance`, which is a lambda that returns "does the test's requested opts match this existing `PublisherType`"?:

```ts
export function newPublisherType(
  em: EntityManager,
  opts: FactoryOpts<PublisherType> = {},
): DeepNew<PublisherType> {
  return newTestInstance(
    em,
    {},
    { useExisting: (opts, existing) => existing.name === opts.name },
  );
}
```

The benefit of using `useExisting` is that the `existing` param will already be typed to your given entity type (i.e. `PublisherType`), and the `opts` param will be the "post-resolution" opts, i.e. instead of "maybe object literals or maybe object instances", they will be object instances (basically `OptsOf<PublisherType>`), which simplifies the lambda's matching logic.


