---
title: Field Logging
sidebar_position: 1
---

Joist provides field logging to visualize when/why fields are being set on entities.

## Usage

Field logging is currently enabled on an individual `EntityManager` instance:

```ts
import { FieldLogger} from "joist-orm";
// This will log any field set field sets on this EntityManager
em.setFieldLogging(new FieldLogger());
```

This will produce output like:

```
a#1.firstName = a1 at newAuthor.ts:13
a#1.age = 40 at newAuthor.ts:13
b#1.title = title at newBook.ts:9
b#1.order = 1 at newBook.ts:9
b#1.author = Author#1 at newBook.ts:9
b#1.notes = Notes for title at defaults.ts:28
```

Where `a#1` is the tagged id of a new/unsaved `Author` instance, and `b#` is the tagged if of a new/unsaved `Book` instance.

The `at (file):(line)`, which should help track down which hook or method is setting the field.

:::info

The code that determines the correct `at (file):(line)` to output is currently a heuristic; if you see incorrect or missing file/line information, please file an issue. Thank you!

:::

### Filtering by Entity

If you want to log only sets for a specific entity type, you can pass a `watches` argument to the `FieldLogger` constructor:

```ts
em.setFieldLogging(new FieldLogger(
  [{ entity: "Author" }],
));
```

### Filtering by Entity and Field

If you want to log only sets for a specific entity *and* field name, you can pass a `watches` argument to the `FieldLogger` constructor:

```ts
em.setFieldLogging(new FieldLogger(
  [{ entity: "Author", fieldNames: ["firstName"] }],
));
```

### Enabling Breakpoints

If you're running code in debug mode, you can also tell Joist to trigger a breakpoint, whenever a field is set:

```ts
em.setFieldLogging(new FieldLogger(
  [{ entity: "Author", fieldNames: ["firstName"], breakpoint: true }],
));
```

## Colorized Output

Currently, the `FieldLogger` always output colorized output, similar to Joist's other logging output.

This makes for the best experience with running/debugging tests, like in Jest, which is currently the primary use case for Joist's logging.
