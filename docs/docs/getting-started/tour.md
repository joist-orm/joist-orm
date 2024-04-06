---
title: Quick Tour
sidebar_position: 0
---

This page gives a quick overview/scan of "what using Joist looks like". Joist's docs dive into these features in more detail, and see [Installation](./installation.md) for a true "getting started".

With Joist, you start by creating/updating your database schema, using `node-pg-migrate` or whatever migration tool you like:

```bash
# Start your postgres database
docker-compose up db --wait
# Apply the latest migrations
npm run migrate
```

Then invoke Joist's code generation:

```bash
npm run joist-codegen
```

To automatically get super-clean domain objects created (see [Code Generation](../goals/code-generation.md)):

```typescript
// src/entities/Author.ts
export class Author extends AuthorCodegen {
  // ...empty placeholder for your custom methods/business logic...
}

// src/entities/AuthorCodegen.ts
export class AuthorCodegen {
  // ...all the boilerplate fields & m2o/o2m/m2m relations generated for you...
  readonly books: Collection<Author, Book> = hasOne(...);
  get firstName(): string { ... }
  set firstName(): string { ... }
}
```

Joist generates both sides of relations, and will keep them automatically in sync (see [Relations](../modeling/relations.md)):

```typescript
const a1 = em.load(Author, "a:1", "books");
// Create a new book for a1
const b1 = new Book(em, { title: "b1", author: a1 });
// a1.books already has b1 in it, so your view of data is always consistent
expect(a1.books.get.includes(b1)).toBe(true);
```

You can create your own derived relations for common paths in your domain:

```typescript
class Author extends AuthorCodegen {
  // Use hasManyThrough for simple paths that include everything
  readonly reviews: Collection<Author, Review> = hasManyThrough((a) => a.books.reviews);
  
  // Use hasManyDerived to do filtering if needed
  readonly publicReviews: Collection<Author, Review> = hasManyDerived(
    { books: "reviews" },
    (a) => a.flatMap(a.books.get).flatMap(b => b.reviews.get).filter(r => r.isPublic)
  );  
}
```

Or derived fields that will be reactively calculated (and updated in the database) when their dependencies change (see [Reactive Fields](../modeling/reactive-fields)):

```typescript
class Author extends AuthorCodegen {
  readonly numberOfBooks: ReactiveField<Author, number> =
    hasReactiveField(
     "numberOfBooks",
     ["books"],
     (a) => a.books.get.length,
    );
}

// Now we can filter/sort by numberOfBooks in queries b/c its a column in the db
const prolificAuthors = await em.find(Author, { numberOfBooks: { gt: 100 } });
```

You write validation rules that can be per-field, per-entity or even _reactive across multiple entities_, i.e. in `Author.ts` (see [Validation Rules](../modeling/validation-rules.md)):

```typescript
import { authorConfig as config } from "./entities";

export class Author extends AuthorCodegen {}

// Required rules for `NOT NULL` columns are automatically added in AuthorCodegen

// Anytime a book is associated/disassociated to/from this author, run this rule
config.addRule("books", (author) => {
  if (author.books.get.length > 10) {
    return "Too many books";
  }
});
```

You load/save entities via a per-request `EntityManager` that acts as a [Unit of Work](../advanced/unit-of-work.md) and on `em.flush` will batch any changes made during the current request in an atomic transaction, only after running all validation rules & updating any derived values (see [Entity Manager](../features/entity-manager.md)):

```typescript
const a1 = em.load(Author, "a:1");
a1.firstName = "Allen";
a2.lastName = "Zed";
// Runs validation against all created/updated entities, calls lifecycle hooks,
// updates derived values, and issues bulk INSERTs/UPDATEs in a transaction
await em.flush();
```

To avoid tedious `await` / `Promise.all`, you can use deep load a subgraph via populate hints (see [Load-Safe Relations](../goals/load-safe-relations.md)):

```typescript
// Use 1 await to preload a tree of data
const loaded = await a1.populate({
  books: { reviews: "comments" },
  publisher: {},
});

// No more await Promise.all
loaded.books.get.forEach((book) => {
  book.reviews.get.forEach((review) => {
    console.log(review.name);
  });
})
```

Loading any references or collections within the domain model is guaranteed to be N+1 safe, regardless of where the `populate` / `load` calls happen within the code-path (see [Avoiding N+1 Queries](../goals/avoiding-n-plus-1s.md)).

To find entities, you can use an ergonomic `em.find` API that combines joins and conditions in a single "join literal" (see [Finding Entities](../features/queries-find.md)):

```typescript
const books = await em.find(
  Book,
  {
    author: { publisher: { name: "p1" } },
    status: BookStatus.Published,
  },
  { orderBy: { name: "desc" } }
);
```

Or if you have complex conditions, you can use dedicated conditions to do cross-table `AND`s and `OR`s (also see [Finding Entities](../features/queries-find.md)):

```typescript
const [p, b] = aliases(Publisher, Book);
const books = await em.find(
  Book,
  { as: b, author: { publisher: p } },
  {
    conditions: { or: [p.name.eq("p1"), b.status.eq(BookStatus.Published)] },     
    orderBy: { name: "desc" },
  }
);
```

For lower-level, complex queries that do sums, group bys, etc., Joist currently defers to existing query builder libraries like Knex.

You can test all of your behavior with integrated test factories (see [Test Factories](../testing/test-factories.md)):

```typescript
import {  newEntityManager } from "./setupTests";

describe("Author", () => {
  it("can have reactive validation rules", async () => {
    const em = newEntityManager();
    // Given the book and author start out with acceptable names
    const a1 = new Author(em, { firstName: "a1" });
    const b1 = new Book(em, { title: "b1", author: a1 });
    await em.flush();
    // When the book name is later changed to collide with the author
    b1.title = "a1";
    // Then the validation rule is ran even though it's on the author entity
    await expect(em.flush()).rejects.toThrow(
        "Validation error: Author:1 A book title cannot be the author's firstName",
    );
  });
})
```

And tweak your factories to provide "valid by default" data to keep your tests succinct:

```typescript
export function newAuthor(em: EntityManager, opts: FactoryOpts<Author> = {}): DeepNew<Author> {
  return newTestInstance(em, Author, opts, {
    // firstName has a unique constraint, so make it unique  
    firstName: `a${testIndex}`,
    // Authors should be popular by default, but only in tests, not prod
    isPopular: true,
  });
}
```

Finally, Joist has a number of other nifty features, like [Tagged Ids](../advanced/tagged-ids.md), automatic handling of [Soft Deletes](../advanced/soft-deletes.md), support for [Class Table Inheritance](../advanced/class-table-inheritance.md), and more.
