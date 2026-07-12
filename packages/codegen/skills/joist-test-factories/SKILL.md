---
name: joist-test-factories
description: Use when writing or refactoring Joist ORM tests with newTestInstance factories, DeepNew, run or makeRun, toMatchEntity, and nested Given graphs.
---

# Joist Test Factories

Write isolated, succinct tests that use Joist's factories for setup, retain
typed entity references through the action, and assert those same entities
with `toMatchEntity`.

Authoritative references:

- <https://joist-orm.io/testing/test-factories/>
- <https://joist-orm.io/testing/entity-matcher/>
- <https://joist-orm.io/testing/test-utils/>
- <https://joist-orm.io/goals/great-tests/>

## Non-Negotiable Rules

1. Create ordinary Given state with test factories. Never use the same function
   or API operation under test to arrange its own preconditions.
2. Set only fields and relationships that define the boundary case. Let the
   factories supply unrelated required values and dependencies.
3. Keep direct `const` references to entities that participate in the action or
   assertions.
4. Keep using the factory-created `DeepNew` graph after same-`EntityManager`
   actions or actions run through Joist's test `run` helper. Do not reload the
   same rows merely to assert against them.
5. Use `run` or the project's `makeRun` wrapper when production code needs an
   isolated `EntityManager`; it flushes Given state and mirrors the callback's
   flushed Joist writes into the original test graph.
6. Assert entity state and relationships with `toMatchEntity`.
7. Prefer focused tests for one behavior over a single scenario that exercises
   unrelated updates at several graph levels.

## Arrange, Act, Assert

Follow this shape:

```ts
it.withCtx("updates a book", async (ctx) => {
  const author = newAuthor(ctx.em, {
    books: [{ title: "Before" }],
  });
  const [book] = author.books.get;

  // updateBook owns and flushes its production unit of work.
  await run(ctx, (ctx) => updateBook(ctx, { id: book.id, title: "After" }));

  expect(author).toMatchEntity({ books: [{ title: "After" }] });
});
```

The factory owns setup defaults. `run` provides production isolation and
mirrors flushed writes. The callback still owns its production unit of work.
`toMatchEntity` owns entity-aware assertions.

## Factories Own Given State

Do not call the same code under test to arrange its own preconditions:

```ts
// Wrong: saveAuthor is both setup and the behavior under test.
const created = await saveAuthor(ctx, {
  firstName: "a1",
  books: [{ title: "Before" }],
});
const author = await created.author;
```

This couples setup to the behavior under test, can reproduce the same bug in
both phases, and loses the ergonomic `DeepNew` type.

Use a factory instead:

```ts
const author = newAuthor(ctx.em, {
  books: [{ title: "Before" }],
});
const [book] = author.books.get;
```

Factories are test-only tools. Never call them from production code.
Using another production API for Given state can be valid in an integration
test when that API's authorization, hooks, defaults, or events are part of the
scenario. This should be intentional, not the default way to create rows.

## Keep Given State Minimal

Every explicit factory option should answer: "Why does this test need this
value?"

```ts
// Wrong: most values are unrelated to changing one title.
const author = newAuthor(ctx.em, {
  firstName: "Ann",
  lastName: "Smith",
  age: 40,
  books: [
    {
      title: "Before",
      order: 1,
      published: false,
      reviews: [],
    },
  ],
});
```

```ts
// Right: only the value being changed is specified.
const author = newAuthor(ctx.em, {
  books: [{ title: "Before" }],
});
```

Specify additional values only when they establish the scenario. Examples:

- Two `{}` children establish collection cardinality.
- Distinct sort orders may be necessary for a parent/sort-order unique key.
- An initial value is necessary when the assertion proves that it changed.
- A relation override is necessary when the identity of that relation matters.

Do not copy production payloads into factory opts. Factory opts describe the
minimum database state before the action, not every field the action accepts.

## Build Graphs in One Factory Call

Prefer a top-level factory with nested opts when it clearly describes the
scenario:

```ts
const author = newAuthor(ctx.em, {
  books: [{ title: "First", reviews: [{ rating: 5 }] }, { title: "Second" }],
});
const [firstBook, secondBook] = author.books.get;
const [review] = firstBook.reviews.get;
```

This is usually clearer than creating each row separately and wiring every
required relation by hand. Separate factory calls are appropriate when the
test's behavior is specifically about how independently created entities
relate.

Factories recursively fill required primitives and relations. They also reuse
an obvious existing entity when exactly one candidate exists. Use factory
controls intentionally:

- Pass an entity directly to force a specific relation.
- Pass `{ use: entity }` to nominate an existing entity throughout a factory
  scope.
- Pass `{}` for a relation when a new related entity is required.
- Use `useFactoryDefaults: false` sparingly; frequent use means the factory
  defaults may be too opinionated.
- Use `useFactoryDefaults: "none"` only for tests explicitly exercising invalid
  or incomplete state.

## Retain Entity References

Immediately name entities used by the action or assertions:

```ts
const author = newAuthor(ctx.em, {
  books: [{}, {}],
});
const [updatedBook, deletedBook] = author.books.get;
```

Do not unnecessarily rediscover Given entities later by index, query, ID, or
mutation result. Newly created entities can come from the action result, and a
query result is appropriate when querying is the behavior under test.

For complicated cross-references in one factory graph, use factory IDs:

```ts
const author = newAuthor(ctx.em, {
  books: [
    { is: "b#1", title: "First" },
    { is: "b#2", prequel: "b#1", title: "Second" },
  ],
});
const [firstBook, secondBook] = author.books.get;

expect(secondBook).toMatchEntity({ prequel: firstBook });
```

The `factories` proxy is also available when direct relation destructuring is
awkward:

```ts
newAuthor(ctx.em, { books: [{}, {}] });
const { a1, b1, b2 } = factories;
```

The proxy resolves against the most recently used `EntityManager`, so avoid it
in tests with multiple active test entity managers.

Prefer ordinary named constants when the graph is small; they make the test's
roles clearer than numeric factory IDs.

## DeepNew Means Async-Free Graph Access

Follow the signature generated by the project's Joist version. Factories that
return `DeepNew<Entity>` provide the loaded graph ergonomics used here:

```ts
export function newAuthor(em: EntityManager, opts: FactoryOpts<Author> = {}): DeepNew<Author> {
  return newTestInstance(em, Author, opts, {});
}
```

`DeepNew` is a loadedness type for the factory-created graph, so setup and
assertions can use `.get` without `await`:

```ts
const author = newAuthor(ctx.em, { books: [{}] });
const [book] = author.books.get;

expect(author).toMatchEntity({ books: [book] });
```

Avoid this boilerplate:

```ts
const books = await author.books.load();
const reloadedAuthor = await ctx.em.load(Author, author.id);
const reloadedBooks = await reloadedAuthor.books.load();
```

`DeepNew` does not synchronize writes from another `EntityManager`. If a
relation was not part of the factory-created graph, use an intentional
populate, or use Joist's `run` helper when testing a separate production unit
of work. Do not silence a legitimate unloaded-relation boundary with arbitrary
test-only loads.

## Use run for Production Isolation

Joist's `run(ctx, fn)` executes `fn` with a fresh production-style context and
`EntityManager`. Before the callback, it flushes the test factory graph. As the
callback flushes Joist writes, `RunPlugin` mirrors those writes into the
original test `EntityManager`. It does not call `EntityManager.refresh`. The
callback result is also mapped back to entities from the original test
`EntityManager`.

```ts
const author = newAuthor(ctx.em, { books: [{ title: "Before" }] });
const [book] = author.books.get;

// updateBook must own and flush its production unit of work.
await run(ctx, (ctx) => updateBook(ctx, { id: book.id, title: "After" }));

expect(book).toMatchEntity({ title: "After" });
```

Many applications expose a project-specific helper created with `makeRun`,
such as `runMutation` or `runService`. Use that helper instead of manually
constructing a second `EntityManager`.

`run` deliberately does not flush the callback's `EntityManager`; production
code under test must own its normal unit-of-work boundary. Unflushed changes,
direct SQL, and writes outside Joist are not guaranteed to be mirrored into the
test graph.

Do not write:

```ts
const result = await runMutation(ctx, () => updateBookInput(book.id));
const savedBook = await result.book;
const books = await savedBook.author.load().then((author) => author.books.load());
```

Keep using `author` and `book`. They are the stable test references.

Call `em.flush()` directly only when the test intentionally needs a persistence
boundary and its helper does not provide one. Pure entity tests should usually
avoid unnecessary flushes.

## Register toMatchEntity

Examples assume `toMatchEntity` is imported from the `joist-orm/tests`
entry point and registered in the project's test setup:

```ts
import { toMatchEntity } from "joist-orm/tests";

expect.extend({ toMatchEntity });
```

Use the runner-specific setup and types from the installed Joist version.

## Assert with toMatchEntity

`toMatchEntity` provides `toMatchObject`-style subset assertions while
understanding Joist references, collections, properties, reactive fields, and
entity identity. It also produces concise entity IDs in diffs.

`toMatchEntity` synchronously unwraps loaded relations through `.get`; it does
not query or asynchronously load missing relations. Ensure the asserted graph
is loaded by the factory, an intentional populate, or `RunPlugin`.

```ts
expect(author).toMatchEntity({
  firstName: "Ann",
  books: [book],
});
expect(book).toMatchEntity({ title: "After" });
```

Pass retained entity constants directly for relationship identity. Use nested
object literals when the nested values themselves are the assertion:

```ts
expect(author).toMatchEntity({
  books: [{ title: "First" }, { title: "Second" }],
});
```

For a hard delete, assert both the surviving collection and deletion state
when deletion semantics matter:

```ts
expect(author).toMatchEntity({ books: [updatedBook] });
expect(deletedBook).toMatchEntity({ isDeletedEntity: true });
```

Do not map entity graphs into temporary POJOs just to use `toEqual`:

```ts
// Wrong.
expect((await author.books.load()).map((book) => ({ id: book.id, title: book.title }))).toEqual([
  { id: updatedBook.id, title: "After" },
]);
```

## Keep Tests Focused

One test should describe one coherent boundary. Split a large graph mutation
into separate tests when failures would otherwise have several unrelated
causes:

- Updating/deleting members of a parent collection.
- Updating/deleting grandchildren.
- Creating a new nested entity.
- Clearing a collection.
- Preserving an omitted relation.

Combining an update and delete can be appropriate when they jointly exercise
one incremental-collection contract. Avoid a kitchen-sink test that performs
step updates, ingredient updates, note updates, and several unrelated scalar
changes in one action.

Focused tests produce smaller Given graphs, clearer constants, and useful
failure messages.

## Factory Defaults

Customize a generated factory only for defaults that make entities valid by
default across the suite:

```ts
export function newAuthor(em: EntityManager, opts: FactoryOpts<Author> = {}): DeepNew<Author> {
  return newTestInstance(em, Author, opts, {
    age: 40,
  });
}
```

Use `testIndex` for deterministic unique values when a database unique
constraint requires them. Add collection defaults only for genuine suite-wide
validity rules, such as every valid author requiring at least one book.

Custom options such as `withSignedContract` can package a commonly repeated
graph, but use them sparingly. A reader should not need to inspect a factory to
understand the values directly asserted by the test.

If factory behavior is surprising, enable `useLogging: true` for that call or
temporarily enable global factory logging. Diagnose the factory scope and
reuse decisions instead of replacing factories with manual setup.

## Review Checklist

- Given state uses minimal factory opts and does not invoke the behavior under
  test.
- Important entities have direct, role-based `const` names.
- Separate production units of work use `run`/`makeRun` and flush normally.
- Assertions reuse loaded factory entities with `toMatchEntity`.
- No unnecessary reloads, `load()` calls, assertion awaits, or direct flushes
  remain.
- Each test covers one coherent boundary.
