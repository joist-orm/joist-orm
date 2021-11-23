---
title: Idiomatic Not Null Support
sidebar_position: 1
---

Joist domain objects automatically model `null` and `not null` correctly.

I.e. for a table like:

```
                     Table "public.authors"
    Column    |           Type           | Nullable
--------------+--------------------------+----------+
 id           | integer                  | not null |
 first_name   | character varying(255)   | not null |
 last_name    | character varying(255)   |          |
```

The `Author` domain object will appropriately null/non-null properties:

```typescript
class AuthorCodegen {
  get firstName(): string {
    ...
  }

  set firstName(firstName: string) {
    ...
  }

  get lastName(): string | undefined {
    ...
  }

  set lastName(lastName: string | undefined) {
    ...
  }
}
```

The non-null `firstName` is enforced on construction:

```typescript
new Author(em, { firstName: "is required" });
```

I.e. you cannot call `new Author()` and then forget to set `firstName`.

The appropriate null/non-null-ness is also enforced in the `Author.set` method:

```typescript
author.set({ firstName: "cannotBeNull" });
```

Although `set` does accept a `Partial` (i.e. for updating an existing `Author` instance), so if you don't want to change `firstName`, you don't have to pass it to `set`:

```typescript
author.set({ lastName: "..." });
```
