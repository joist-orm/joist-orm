---
title: Field Logging
description: Documentation for Field Logging
---

Joist provides field logging to visualize when/why fields are being set on entities.

## Usage

Field logging is currently enabled on an individual `EntityManager` instance:

```ts
// Logs all field sets on this EntityManager
em.setFieldLogging(true);
```

This will produce console output like:

```
a#1 created at newAuthor.ts:13
a#1.firstName = a1 at newAuthor.ts:13
a#1.age = 40 at newAuthor.ts:13
b#1.title = title at newBook.ts:9
b#1.order = 1 at newBook.ts:9
b#1.author = Author#1 at newBook.ts:9
b#1.notes = Notes for title at defaults.ts:28
```

Where `a#1` is the tagged id of a new/unsaved `Author` instance, and `b#` is the tagged id of a new/unsaved `Book` instance.

The `at (file):(line)`, which should help track down which hook or method is setting the field.

:::tip[Info]

The code that determines the correct `at (file):(line)` to output is currently a heuristic; if you see incorrect or missing file/line information, please file an issue. Thank you!

:::

### Filtering Shorthand

If you want to quickly setup field logging, we support a string "spec" shorthand:

```ts
// Single entity, multiple fields
em.setFieldLogging("Author.firstName,lastName");
// Multiple entities, breakpoints enabled
em.setFieldLogging(["Author.lastName", "Book.title!"]);
```

### Filtering by Entity & Fields

If you want to log only sets for a specific entity, or certain fields, you can pass a `watches` argument to the `FieldLogger` constructor:

```ts
em.setFieldLogging(new FieldLogger([
  // Log all field sets for Authors
  { entity: "Author" },
  // Log only title changes to Books
  { entity: "Book", fieldNames: ["title"] },
  // Log only instantiation of BookReview
  { entity: "BookReview", fieldNames: ["constructor"] },
]));
```

### Enabling Breakpoints

If you're running in debug mode, you can tell Joist to trigger a breakpoint on the field set:

```ts
// Use a ! shorthand in the spec string
em.setFieldLogging("Author.firstName!");
// Or pass `breakpoint: true` to the FieldLogger constructor
em.setFieldLogging(new FieldLogger(
  [{ entity: "Author", fieldNames: ["firstName"], breakpoint: true }],
));
```

And your debugger will stop anytime the `firstName` field is mutated.

This can be extremely useful for finding "who" is setting/changing a field in more complex/multi-step scenarios.

## Colorized Output

Currently, the `FieldLogger` always output colorized output, similar to Joist's other logging output.

This makes for the best experience with running/debugging tests, like in Jest, which is currently the primary use case for Joist's logging.
