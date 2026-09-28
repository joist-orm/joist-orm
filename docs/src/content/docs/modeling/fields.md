---
title: Fields
description: Documentation for Fields
sidebar:
  order: 2
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

### String Trimming and Coercion

Joist applies reasonable/opinionated defaults to handling string values, specifically:

- Leading/trailing spaces are trimmed
- Empty string `""` is replaced with `undefined` (becomes `null` in the db)

This is to avoid "silly mistakes" like a `first_name=""` or `first_name=' bob'` getting into the database, and throwing off business logic, i.e. that might otherwise have detected `first_name=bob` as a duplicate (but missed `" bob"`), or `first_name=""` as a missing required field.

If you want to disable this behavior, setting `DEFAULT=''` on the database column will give Joist the hint that, for this column, it's actually desired to let the empty string value be saved to the database, so we will keep empty strings, and also disable the leading/trailing space trimming.

If you need finer-grained control over this behavior, it could be configurable via the `joist-config.json` file, we just have not implemented that yet.

### Type Checked Construction

The non-null `Author.firstName` field is enforced as required on construction:

```typescript
// Valid
em.create(Author, { firstName: "bob" });
// Not valid
em.create(Author, {});
// Not valid
em.create(Author, { firstName: null });
// Not valid
em.create(Author, { firstName: undefined });
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

See [Partial Update APIs](/features/partial-update-apis) for more details.

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

## Lazy Fields

Sometimes a table has a large column—a big `jsonb` blob, or a large `text` document—that you only occasionally need, and that would be wasteful to fetch on every `em.load` / `em.find`.

You can mark such a column as `lazy` in `joist-config.json`:

```json
{
  "entities": {
    "Author": {
      "fields": {
        "bulkData": { "lazy": true }
      }
    }
  }
}
```

Instead of a plain getter/setter, Joist generates the column as a relation-like `LazyField`, and **excludes it from the entity's default `SELECT`**:

```ts
// This code is auto-generated
class AuthorCodegen {
  readonly bulkData: LazyField<Author, Object | undefined> = hasLazyField();
}
```

So loading an `Author` no longer fetches `bulk_data`:

```ts
// SELECT id, first_name, ... FROM authors WHERE id = ANY($1)  -- note: no bulk_data
const author = await em.load(Author, "a:1");
```

### Loading the value

Like other relations, a `LazyField` is not `.get`-able until it's been loaded. You can load it on demand with `.load()`:

```ts
// SELECT id, bulk_data FROM authors WHERE id = ANY($1)
const data = await author.bulkData.load();
```

`.load()` batches across entities, so loading the same lazy field for a page of authors is a single query.

Or you can populate it up front, and then access it synchronously via `.get`:

```ts
const author = await em.load(Author, "a:1", "bulkData");
// Now available synchronously
console.log(author.bulkData.get);
```

Accessing `.get` before the field is loaded throws, the same as an unloaded [`AsyncProperty`](/modeling/relations).

### Reading & writing

New entities keep their value in memory, so there's nothing to lazy-load:

```ts
const author = em.create(Author, { firstName: "a1", bulkData: { ... } });
// Readable immediately, without a `.load()`
author.bulkData.get;
```

You can set the value with `.set()` (or via `em.create` / `set` opts), and it is persisted on the next `em.flush`:

```ts
author.bulkData.set({ ... });
await em.flush();
```

Lazy columns are also excluded from the batched `UPDATE` that Joist issues for changed entities, and are instead written by a targeted `UPDATE` for only the entities that actually changed them. This means updating some _other_ field on an entity whose lazy column was never loaded will not accidentally overwrite it.

### Required lazy fields

A `lazy` column can be `not null`, in which case it is required on `em.create`, just like any other required field:

```ts
// Not valid — bulkData is required
em.create(Author, { firstName: "a1" });
// Valid
em.create(Author, { firstName: "a1", bulkData: { ... } });
```

The required validation is lazy-aware: it will not force-load (or falsely fail) the column when you flush an unrelated change to an entity that never loaded it.

:::note

You can `.set()` a lazy field without loading it first—including `.set(undefined)` to unset it—i.e. a "blind overwrite" that avoids fetching a large blob just to replace it. Because the current database value is unknown, Joist always treats a set on an unloaded field as a change, and `changes.bulkData.originalValue` will be `undefined`.

:::

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
