---
title: Relations
sidebar_position: 2
---

Relations are relationships between entities in your domain model, for example an `Author`'s list of `Book`s or an `Author`'s current `Publisher`. 

Joist's `joist-codegen` step automatically discovers the relations from your database schema (based on foreign keys) and generates either `Reference`s (for relations that point to a single other entity) or `Collection`s (for relations that point to multiple other entities).

Two common themes for all of Joist's relations are that:

1. They are by default unloaded, and require `await author.book.load()` calls to load, _but_ also all support preloading via populate hints, see [type safe relations](../goals/type-safe-relations.md) for more.

2. Joist always keeps "both sides" of relationships in sync, for example if you add a `Book` to an `Author`, that `Author`'s list of books will automatically include that `Book`.

   This is a big quality-of-life win, as business logic (validation rules, rendering logic) will always see the latest state of relations, and not have to worry about running against now-stale data.

## Many To One References

Joist looks for `m2o` "outgoing" foreign keys like `books.author_id` pointing to `books.id` and automatically includes a `ManyToOneReference` in the `BookCodegen` file:

```typescript
export abstract class BookCodegen {
  readonly author: ManyToOneReference<Book, Author, never> = hasOne(authorMeta, "author", "books");
}
```

### Optional vs. Required

If `books.author_id` is `not null`, then the reference will be required, i.e. `someBook.author.get` will return `Author`, otherwise it will be optional, and `someBook.author.get` will return `Author | undefined`.

### Loading

Accessing the `Author` entity from a `Book` requires either calling `.load()` or a populate hint:

```typescript
// Unloaded
const b1 = await em.load(Book, "b:1");
const a1 = await b1.author.load();
console.log(a1.firstName);

// Preloaded
const b2 = await em.load(Book, "b:2", "author");
console.log(b2.author.get.firstName);
```

## One To Many Collections

Joist looks for "incoming" `m2o` foreign keys like `books.author_id` pointing to `author.id` and automatically generates a `hasMany` collection on the "other side" in `AuthorCodegen.ts`:

```typescript
export abstract class AuthorCodegen {
  readonly books: Collection<Author, Book> = hasMany(bookMeta, "books", "author", "author_id");
}
```

### Loading 

When unloaded, `Collection`s only support adding and removing:

```typescript
const a = await em.load(Author, "a:1");
a.books.add(someBook);
a.books.remove(otherBook);
```

To access the collection, it must have `.load()` called or be loaded with a populate hint:

```typescript
// Unloaded
const a1 = await em.load(Author, "a:1");
const books = await a1.books.load();
console.log(books.length);

// Preloaded
const a2 = await em.load(Author, "a:2", "books");
console.log(a2.books.get.length);
console.log(a2.books.get[0].title);
```

## Polymorphic References

Polymorphic references model an entity (i.e. `Book`) that has a single logical field that can be set to multiple (i.e. poly) _types_ of other entities, but _only one such entity at a time_ (i.e. a reference b/c it points to only one other entity).

For example maybe a `Book` has a single logical `publisher` field that can either be a `CorporatePublisher` entity (a row in the `corporate_publishers` table) or a `SelfPublisher` entity (a row in the `self_publishers` table).

The simplest way to model this `Book` scenario would be having two foreign keys, a `books.corporate_publisher_id` and `books.self_publisher_id`, and then having your application's business logic "just know" that it should enforce only one of these keys being set at a single time.

Polymorphic references allow you to tell Joist about this "single logical field that could be two-or-more different types", and it will do the "can only be set at once" handling for you.

### Implementation

Polymorphic references have two components:

- In the domain model, they are a single logical field (i.e. `Book.publisher`).

  The field type is `PolymorphicReference<BookPublisher>`, where `BookPublisher` is a code generated type union of each potential type, i.e. Joist will create:

  ```typescript
   export type BookPublisher = CorporatePublisher | SelfPublisher;
  ```

  In the `BookCodegen.ts` file.

- In the database schema, they are multiple physical columns, one per "other" entity type (i.e. `books.publisher_corporate_publisher_id` and `books.publisher_self_publisher_id`)

### Usage

To use polymorphic references, there are two steps:

1. Create the multiple physical foreign keys in your schema, all with a similar `publisher_*_id` naming convention.  

2. In `joist-codegen.json`, add a new `publisher` relation that is marked as `polymorphic`:

   ```json
   {
     "entites": {
        "Comment": {
           "relations": { "publisher": { "polymorphic": "notNull" } },
           "tag": "comment"
        }
     }
   }
   ```
   
   Joist with then use the `publisher` name to scan for any other `publisher_`-prefixed foreign keys and automatically pull them in as components of this polymorphic reference.

## In Sync Relations

Joist keeps both sides of m2o/o2m/o2o relationships in sync, i.e.:

```typescript
// Load the author with the books collection loaded
const a = await em.load(Author, "a:1", "books");
// Load a book, and set the author
const b = await em.load(Book, "b:1");
b.author.set(a);
// This will print true
console.log(a.books.get.includes(b));
```

If the `Author.books` collection is not loaded yet, then the `b.author.set` line does not cause it to become loaded, but instead will remember "add `b`" as a pending operation, to apply to `a.books`, should it later become loaded within the current `EntityManager`.

## Custom Relations

Besides the core relations discovered from the schema's foreign keys, Joist lets you declare additional relations in your domain model.

### hasOneThrough

You can define common paths through your entity graph with `hasOneThrough`:

```typescript
export class BookReview extends BookReviewCodegen {
  readonly author: Reference<BookReview, Author, never> = hasOneThrough((review) => review.book.author);
}
```

The `hasOneThrough` DSL is built on Joist's `CustomReferences`, so will also work with `populate`, i.e.:

```typescript
const review = await em.load(BookReview, "1", { author: "publisher" });
expect(review.author.get.publisher.get.name).toEqual("p1");
```

### hasManyThrough

You can define common paths through your entity graph with `hasOneThrough`:

```typescript
export class BookReview extends BookReviewCodegen {
  readonly author: Reference<BookReview, Author, never> = hasOneThrough((review) => review.book.author);
}
```

The `hasOneThrough` DSL is built on Joist's `CustomReferences`, so will also work with `populate`, i.e.:

```typescript
const review = await em.load(BookReview, "1", { author: "publisher" });
expect(review.author.get.publisher.get.name).toEqual("p1");
```

### hasOneDerived

You can define a relation that is conditional with `hasOneDerived`:

```typescript
class BookReview extends BookReviewCodegen {
  readonly publisher: Reference<BookReview, Publisher, undefined> = hasOneDerived(
    {book: {author: "publisher"}},
    (review) => {
      // some conditional logic here, but review is loaded
      return review.book.get.author.get.publisher.get
    },
  );
}
```

This works a lot like `hasOneThrough`, but if useful for when you have conditional navigation logic, instead of a fixed navigation path.
