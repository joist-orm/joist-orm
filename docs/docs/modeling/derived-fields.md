---
title: Derived Fields
sidebar_position: 7
---

Derived fields are field values (i.e. primitives) that can be calculated from other data within your domain model.

There are two axis by which to categorize derived fields:

- Synchronous vs. Asynchronous

  Synchronous derived fields only rely on other fields/columns within the same entity (i.e. an `Author`s initials only require knowing the same `Author`'s `firstName` and `lastName`), so do not need to load any other entities to calculate their value.

  Async derived values do rely on fields from other entities (i.e. an `Author`'s number of books requires loading the `author.books` one-to-many collection), and so need to load references/collections before calculating their value.

- Persisted vs. Unpersisted

  Persisted derived fields have their latest value stored in the database, typically for quick access on summary screens, filtering, or exposing the values to external systems like a data warehouse.

  Unpersisted derived fields are not stored in the database, and have their value recalculated every time they're accessed.

And so there are 4 combinations (async vs. sync `x` persisted vs. unpersisted), and Joist has an approach for modeling each combination.

## Synchronous, Unpersisted Fields

For synchronous, unpersisted fields, you can just implement these as getters in your domain objects:

```typescript
export class Author {
  /** Implements the business logic for an unpersisted derived value. */
  get fullName(): string {
    return this.firstName + (this.lastName ? ` ${this.lastName}` : "");
  }
}
```

## Synchronous, Persisted Fields

For synchronous, persisted fields, there will be a column in the database to hold the value, i.e. `authors.initials`, which you can mark as `sync` in `joist-codegen.json`:

```json
{
  "entities": {
    "Author": {
      "fields": {
        "initials": { "derived": "sync" }
      }
    }
  }
}
```

This will cause the `Author.initials` field to not have a setter, only an `abstract` getter than you must implement:

```typescript
export class Author {
  /** Implements the business logic for a (synchronous) persisted derived value. */
  get initials(): string {
    return (this.firstName || "")[0] + (this.lastName !== undefined ? this.lastName[0] : "");
  }
}
```

This getter will be automatically called by Joist during any `INSERT` or `UPDATE` of `Author`, to determine the latest value.

Because of this, synchronous persisted derived fields should be cheap to calculate.

## Asynchronous, Unpersisted Fields

For async, unpersisted fields, you can use `hasAsyncProperty`:

```typescript
export class Author {
  /** Example of an async property that can be loaded via a populate hint. */
  readonly numberOfBooks: AsyncProperty<Author, number> = hasAsyncProperty("books", (a) => {
    return a.books.get.length;
  });
}
```

Because it's async, the property must be loaded with a populate hint:

```typescript
const a = await em.load(Author, "a:1", "numberOfBooks");
console.log(a.numberOfBooks.get);
```

## Asynchronous, Persisted Fields

For async, persisted fields, there will be a column in the database to hold the value, i.e. `authors.number_of_books`, which you can mark as `async` in `joist-codegen.json`:

```json
{
  "entities": {
    "Author": {
      "fields": {
        "numberOfBooks": { "derived": "async" }
      }
    }
  }
}
```

And then implement it in the `Author` domain model:

```typescript
import { DerivedAsyncProperty, hasDerivedAsyncProperty } from "joist-orm";

class Author extends AuthorCodegen {
  readonly numberOfBooks: DerivedAsyncProperty<Author, number> = hasDerivedAsyncProperty(
    "numberOfBooks",
    "books",
    (author) => author.books.get.length,
  );
}
```

Joist will call this lambda:

1. When the `Author` is initially created
2. When the `Author` is updated
3. Whenever one of the `Author`'s books changes

For example, in this scenario:

```typescript
const a1 = await em.load(Author, "a:1");
const a2 = await em.load(Author, "a:2");
```
