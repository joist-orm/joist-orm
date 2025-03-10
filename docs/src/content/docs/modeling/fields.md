---
title: Fields
description: Documentation for Fields
---

Fields are the primitive columns in your domain model, so all of the (non-foreign key) `int`, `varchar`, `datetime`, etc. columns.

For these columns, Joist automatically adds getters & setters to your domain model, i.e. an `authors.first_name` column will have getters & setters added to `AuthorCodegen.ts`:

```ts
// This code is auto-generated
class AuthorCodegen {
  get firstName(): string {
    return getField(this, "firstName");
  }

  set firstName(firstName: string) {
    setField(this, "firstName", firstName);
  }
}
```

## Optional vs Required

Joist's fields model `null` and `not null` appropriately, e.g. for a table like:

```
                     Table "public.authors"
    Column    |           Type           | Nullable
--------------+--------------------------+----------+
 id           | integer                  | not null |
 first_name   | character varying(255)   | not null |
 last_name    | character varying(255)   |          |
```

The `Author` domain object will type `firstName` as a `string`, and `lastName` as `string | undefined`:

```typescript
class AuthorCodegen {
  get firstName(): string { ... }
  set firstName(firstName: string) { ... }
  get lastName(): string | undefined { ... }
  set lastName(lastName: string | undefined) { ... }
}
```

### Using `undefined` instead of `null`

Joist uses `undefined` to represent nullable columns, i.e. in the `Author` example, the `lastName` type is `string | undefined` instead of `string | null` or `string | null | undefined`.

The rationale for this is simplicity, and Joist's preference for "idiomatic TypeScript", which for the most part has eschewed the "when to use `undefined` vs. `null` in JavaScript?" decision by going with "just use `undefined`."

### Type Checked Construction

The non-null `Author.firstName` field is enforced as required on construction:

```typescript
// Valid
new Author(em, { firstName: "bob" });
// Not valid
new Author(em, {});
// Not valid
new Author(em, { firstName: null });
// Not valid
new Author(em, { firstName: undefined });
```

And for updates made via the `set` method:

```typescript
// Valid
author.set({ firstName: "bob" });
// Valid, because `set` accepts a Partial
author.set({});
// Not valid
author.set({ firstName: null });
// Technically valid b/c `set` accepts a Partial, but is a noop
author.set({ firstName: undefined });
```

### Partial Updates Semantics

While within internal business logic `null` vs. `undefined` is not really a useful distinction, when building APIs `null` can be a useful value to signify "unset" (vs. `undefined` which typically signifies "don't change").

For this use case, domain objects have a `.setPartial` that accepts null versions of properties:

```typescript
// Partial update from an API operation
const updateFromApi = {
  firstName: null
};
// Allowed
author.setPartial(updateFromApi);
// Outputs "undeifned" b/c null is still translated to undefined
console.log(author.firstName);
```

Note that, when using `setPartial` we have caused our `Author.firstName: string` getter to now be incorrect, i.e. for a currently invalid `Author`, clients might observe `firstName` as `undefined`.

See [Partial Update APIs](/docs/features/partial-update-apis) for more details.

## Protected Fields

You can mark a field as protected in `joist-config.json`, which will make the setter `protected`, so that only your entity's internal business logic can call it.

The getter will still be public.

```json
{
  "entities": {
    "Author": {
      "fields": {
        "wasEverPopular": { "protected": true }
      }
    }
  }
}
```

## Field Defaults

### Schema Defaults

If your database schema has default values for columns, i.e. an integer that defaults to 0, Joist will immediately apply those defaults to entities as they're created, i.e. via `em.create`.

This gives your business logic immediate access to the default value that would be applied by the database, but without waiting for an `em.flush` to happen.

### Dynamic Defaults

If you need to use `async`, cross-entity business logic to set field defaults, you can use the `config.setDefault` method:

```typescript
/** Example of a synchronous default. */
config.setDefault("notes", (b) => `Notes for ${b.title}`);

/** Example of an asynchronous default. */
config.setDefault("order", { author: "books" }, (b) => b.author.get.books.get.length);
```

Any `setDefault` without a load hint (the 1st example) must be synchronous, and will be *applied immediately* upon creation, i.e. `em.create` calls, just like the schema default values.

Any `setDefault` with a load hint (the 2nd exmaple) can be asynchronous, and will *not be applied until `em.flush()`*, because the `async` nature means we have to wait to invoke them.

:::tip[Info]

We could probably add an async `em.assignDefaults`, similar to `em.assignNewIds`, to allow code to trigger async default assignment, without kicking off an `em.flush`.

:::

### Hooks

You can also use `beforeCreate` hooks to apply defaults, but `setDefault` is preferred because it's the most accurate modeling of intent, and follows our general recommendation to use hooks sparingly.
