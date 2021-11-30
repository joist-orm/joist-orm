---
title: Nullable Columns
sidebar_position: 1
---

Joist's domain objects automatically model `null` and `not null` columns appropriately.

I.e. for a table like:

```
                     Table "public.authors"
    Column    |           Type           | Nullable
--------------+--------------------------+----------+
 id           | integer                  | not null |
 first_name   | character varying(255)   | not null |
 last_name    | character varying(255)   |          |
```

The `Author` domain object will use `string` or `string | undefined`:

```typescript
class AuthorCodegen {
  get firstName(): string { ... }
  set firstName(firstName: string) { ... }
  get lastName(): string | undefined { ... }
  set lastName(lastName: string | undefined) { ... }
}
```

### Type Checking

The non-null `firstName` is enforced on construction:

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

### Partial Updates

Although `set` does accept a `Partial` (i.e. for updating an existing `Author` instance), so if you don't want to change `firstName`, you don't have to pass it to `set`:

```typescript
author.set({ lastName: "..." });
```
