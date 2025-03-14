---
title: Reactive Fields
description: Documentation for Reactive Fields
sidebar:
  order: 5
---

In Joist, Reactive Fields are values that can be calculated/derived from other data within your domain model, for example:

* Deriving an Author's `fullName` from their `firstName` and `lastName`
* Deriving an Author's `numberOfBooks` from their `books` collection

Reactive Fields **are stored in the database** (as regular primitive columns), and so not calculated on-the-fly when accessed. This makes them very quick to access, and amenable to filtering & sorting.

Joist also supports [Derived Fields](./derived-properties), which are similar to Reactive Fields but **are not stored in the database**.

## Always Up-to-Date

A key feature of Joist's Reactive Fields is that Joist will **automatically keep them up-to-date** as the data they depend on changes.

Joist accomplishes this by using each reactive field's declared dependencies (fields, relations, and nested relations--called its **reactive hint**) to watch for writes in other entities that affect the reactive field's value.

For example, given a Reactive Field `numberOfReviews` on `Author` with a dependency graph of `{ books: { reviews: { "title" }`, when an update occurs, Joist will automatically recalculate the reactive field's value and update the database, i.e.:

* If a `review.title` changes, Joist will walk from the BookReview to `Book` to `Author` and recalc `numberOfReviews`
* If a `BookReview` is created or deleted, Joist will walk from the Review to Book to `Author` and recalc `numberOfReviews`
* If a `Book` changes authors, Joist will walk from the Book to the old Author and new Author and recalc each `numberOfReviews`
* Etc.

Joist exhaustively handles any mutation in the graph by "walking backwards" from the write to any downstream values.

:::tip[Tip]

Joist's reactivity depends on all writes going through the domain model, i.e. not raw SQL updates to the database.

That said, if the underlying data does drift, or you've updated your reactive field's business logic and need it to be recalculated, you can call `em.recalc` on any entity, and all of its reactive fields will be recalculated and updated in the database.

:::


## Sync Reactive Fields

Synchronous reactive fields are just getters that calculate the field's value (and store it in the database column) from other fields on the entity itself.

After adding the column for a sync field to the database, i.e. an `authors.initials` column, you mark the field as `derived: "sync"` in `joist-config.json`: 

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
  /** Implements the business logic for a sync reactive value. */
  get initials(): string {
    return (this.firstName || "")[0] + (this.lastName !== undefined ? this.lastName[0] : "");
  }
}
```

This getter will be automatically called by Joist during any `INSERT` or `UPDATE` of `Author`, to determine the latest `initials` value to store in the database.

## Async Reactive Fields

For reactive fields that depend on other relations, we again have a column in the database to hold the value, i.e. `authors.number_of_books`, and then mark them as `derived: "async"` in `joist-config.json`:

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

And then implement the `numberOfFields` field in the `Author` domain model with the same name, but now instead of a getter, by calling the `hasReactiveField` function:

```typescript
import { ReactiveField, hasReactiveField } from "joist-orm";

class Author extends AuthorCodegen {
  readonly numberOfBooks: ReactiveField<Author, number> = hasReactiveField(
    "numberOfBooks",
    "books",
    (a) => a.books.get.length,
  );
}
```

Note that the `numberOfBooks` property **must be explicitly typed** as `ReactiveField` (not inferred, which unfortunately can cause cyclic compilation errors) with two generics: the entity itself, i.e. `Author`, and the property's type, i.e. `number`.

The `hasReactiveField` function takes three arguments:

* `fieldName` the name of the field in the entity and `joist-config.json`.
* `reactiveHint` any fields that should trigger recalculation of the reactive field.
  
   This can be a string (`"firstName"`), an array of strings (`["firstName", "books"]`), or an object literal of nested relationships (`{ books: { reviews: "title" } }`).

* `fn` the function that calculates the value of the derived field.

  This function will be called with the entity as the only argument. All the fields in the reactiveHint will be loaded before this function is called and can be accessed synchronously using `get`.

As described above, Joist will automatically call this lambda when:

1. The `Author` is initially created
2. Any `Book` is added/removed to the `books` collection

## Reactive Query Fields

Regular Reactive Fields load all the data declared by their reactive hint into memory. This is very similar to Joist's `em.populate` hints, and make it very easy to calculate values synchronously in regular TypeScript code.

However, a downside is if the hint references a lot of data, it may become too much to load into memory, for the lambda to loop over and calculate.

In these situations, you can use a `ReactiveQueryField`, which calculates its value using a SQL query.

```typescript
class Publisher {
  readonly numberOfBookReviews: ReactiveField<Publisher, number> = hasReactiveQueryField(
    "numberOfBookReviews",
    // this hint will recalc + be available on `p`
    "id",
    // this hint will recalc + not be available on `p`
    { authors: { books: "reviews" } },
    // findCount is N+1 safe
    (p) => p.em.findCount(BookReview, { book: { author: { publisher: p.id } } }),
  );
}
```

The `hasReactiveQueryField` takes four arguments:

* `fieldName` the name of the field in the entity and `joist-config.json`.
* `paramHint` a reactive hint of data that will be loaded into memory, similar to a regular `ReactiveField`.
* `dbHint` a reactive hint of data that will *not* be loaded into memory, but if it changes will still cause the field to be recalculated.
* `fn` the function that calculates the value of the derived field.

  This function will have access to the data in `paramHint`, and then should issue a database query that summarizes/queries against the fields in the `dbHint`.

A special aspect of `ReactiveQueryField`s is that Joist will defer running their query until any other WIP changes in the `EntityManager` have been flushed to the database. This ensures that the SQL query sees the latest data, and doesn't mistakenly calculate a stale value.

For example, a flow for the `numberOfBookReviews` above might be:

1. A `Publisher` already exists in the database
2. A request creates a new `BookReview` and call `em.flush`
3. During `em.flush`, Joist realises that the `Publisher.numberOfBookReviews` needs recalculated
4. Joist will first issue an `INSERT INTO book_reviews` for the `BookReview`
5. With the transaction still open, the `em.findCount` query runs and sees the updated count
6. Joist then issues an additional `UPDATE publishers` query to update the `Publisher`
7. The transaction is then committed

Note that this "issue a `SELECT` with a transaction open" is not normally how Joist operates, but it ensures the best transactional integrity of the `BookReview` and `Publisher` reactive field being updated atomically.

:::tip[Tip]

Currently, the `ReactiveQueryField`'s query is not limited (i.e. either by type-checking or runtime verification) to querying against **only** data described in the `dbHint`, but you should ensure that it does, as otherwise field value may drift from the value calculated by the query. 

:::
