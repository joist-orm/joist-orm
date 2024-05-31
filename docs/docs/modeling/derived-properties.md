---
title: Derived Properties
sidebar_position: 5
---

In Joist, Derived Properties are values that can be calculated/derived from other data within your domain model, for example:

* Deriving an Author's `fullName` from their `firstName` and `lastName`
* Deriving an Author's `numberOfBooks` from their `books` collection

Derived Properties **are not stored in the database**, but are calculated on-the-fly when accessed. Joist also supports [Reactive Fields](./reactive-fields), which are similar to Derived Properties but **are stored in the database**.

## Sync Properties

Synchronous properties calculate their value from other values immediately available on the same entity; because of this, they can always be accessed, and are just getters:

```ts
class Author {
  get fullName(): string {
    return this.firstName + (this.lastName ? ` ${this.lastName}` : "");
  }
}
```

## Async Properties

Asynchronous Properties calculate their value from the entity and other related child/parent entities.

For example, to implement an `Author`'s `numberOfBooks` property that requires counting the Author's `books` collection, use `hasAsyncProperty` with a populate hint stating it depends on the `books` collection:

```typescript
export class Author {
  readonly numberOfBooks: AsyncProperty<Author, number> = hasAsyncProperty(
    // Declare the relations to load
    "books",
    // Only `a.books` will be marked as loaded
    (a) => { a.books.get.length }
  );
}
```

Because this calculation fundamentally requires having the `books` loaded, it is marked as `async` and requires loading with a populate hint to access:

```typescript
// Load an author without any populate hints
const a1 = await em.load(Author, "a:1");
// `.get` is not available, so `numberOfBooks` requires an await
const num1 = await a1.numberOfBooks.load();

// Load the author with `numberOfBooks` populated
const a2 = await em.load(Author, "a:1", "numberOfBooks");
// `.get` is now available and can be called immediately
const num2 = a2.numberOfBooks.get;
```

Like populate hints, `hasAsyncProperty`s can used nested hints:

```typescript
export class Author {
  readonly latestComments: AsyncProperty<Author, Comment[]> = hasAsyncProperty(
    // Pass a nested load hint
    { publisher: "comments", comments: {} },
    // `a` will have the deep relations loaded
    (a) => [...(a.publisher.get?.comments.get ?? []), ...a.comments.get],
  );
}
```

## Reactive Getters

If you want to access derived properties, like the `fullName` getter in the first example, from [Reactive Fields](./reactive-fields), Joist needs to know which specific fields `fullName` depends.

You can do this by using `hasReactiveGetter`, which declares the business logic's dependencies:

```typescript
class Author {
  readonly fullName: ReactiveGetter<Author, string> = hasReactiveGetter(
    "fullName",
    // Declare the other fields we depend on
    ["firstName", "lastName"],
    // `a` will be limited to using only `firstName` and `lastName`
    a => a.firstName + (a.lastName ? ` ${a.lastName}` : ""),
  );
}
```

Now, even though `Author.fullName` itself is not stored in the database, if any __other__ reactive values want to depend on `Author.fullName`, Joist will know when the `fullName` value becomes dirty, and those downstream values should be recalculated.

`ReactiveGetter`s are limited to depending on fields directly on the entity itself, which means they can be accessed at any time, without being loaded:

```typescript
// Load the author, without any populate hint
const a = await em.load(Author, "a:1");
// We can still call the fullName logic
console.log(a.fullName.get);
```

## Reactive Async Properties

Similar to Reactive Getters, if you have a [Reactive Field](./reactive-fields) that wants to depend on an Async Property, you need to declare the property's **field-level** dependencies by using `hasReactiveAsyncProperty`:

```typescript
export class Author {
  readonly numberOfBooks: AsyncProperty<Author, number> =
   hasReactiveAsyncProperty(
     // Now this is a field-level reactive hint
     { books: "title" },
     // `a` can only access fields declared by the hint
     (a) => a.books.get.filter((b) => b.title !== undefined).length,
   );
}
```

This is similar to regular `hasAsyncProperty`s, except that the hint declares the specific fields that the lambda uses, and the lambda will be restricted from using any field not declared in the hint. 

