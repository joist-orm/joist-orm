---
title: Entity Cloning
description: Documentation for Entity Cloning
sidebar:
  order: 4
---

Joist supports cloning entities, to easily implement feature requests like "duplicate this author", or "duplicate this author and all of their books".

To clone an entity, call `em.clone` and pass a load-hint of the subgraph you want to be included in the `clone` operation.

For example, to clone an `Author` plus all of their `Book`s and all of the `Book`'s `BookReview`s, you can call:

```typescript
const a1 = await em.load(Author, "a:1");
const a2 = await em.clone(a1, { deep: { books: "reviews" } });
```

After the `em.clone` is finished:

* `a2` will be a copy of `a1` with all the same primitive field values, but a new primary key/new identity
* Each `Book` in `a1.books` will have a new `Book` instance created, and be correctly hooked up to `a2` instead of the original `a1`
* Each `BookReview` in each `a1.books.reviews` will have a new `BookReview` instance created, and again be correctly up to the right newly-created `Book` instance in `a2.books`

Besides setting the correct "parent" `book.author` to `a2` for each cloned child `Book`, any other references/FKs in the newly-created entities that happened to point to also-cloned input entities (like `a1.favoriteBook` pointing to `a1.books.get[0]`) are adjusted to point to the correct/corresponding newly-cloned output entity.

Basically Joist will keep the subgraph of cloned entities intact.

### Advanced Features

When calling `em.clone`, you can provide these config options to customize the behavior:

* `opts.deep` is the load hint from above, i.e. `{ books: "reviews" }`, that specifies the subgraph to clone.

* `opts.skipIf` returns `true` if an entity and its children should be skipped. It accepts either a shared function or a map of per-type predicates:

   ```ts
   // This will duplicate the author's books, but skip any book where the title includes `sea`
   const duplicatedBooks = await em.clone(
     author.books.get,
     { skipIf: { Book: (original) => original.title.includes("sea") } }
   );
   ```
  
* `opts.skip` skips copying the specified fields, i.e. `{ skip: ["notes", "reviewer"] }`.

* `opts.overrides` returns creation options for each original entity. It accepts either a shared function or a map of per-type callbacks. These options replace copied values before setters and synchronous defaults run:

   ```ts
   // This will duplicate the author's books, and assign them to a different author
   const duplicatedBooks = await em.clone(
     author.books.get,
     { overrides: () => ({ author: author2 }) }
   );
   ```

   Unlike reparenting in `postClone`, this never temporarily attaches the copied books to the source author, so its hooks and reactions are not triggered by that assignment. An explicit `undefined` clears a copied value and prevents its default from running.

   A shared callback runs for every entity in a deep clone, not just the roots. A per-type map applies options only to the matching entity types:

   ```ts
   const duplicatedAuthor = await em.clone(author, {
     deep: "books",
     overrides: { Book: () => ({ reviewer: undefined }) },
   });
   ```

* `opts.postClone` accepts both the original entity and its new clone after references have been remapped. It accepts either a shared function or a map of per-type callbacks. Use it for bookkeeping or assignments that need the clone itself:

   ```ts
   const originalToClone = new Map();
   const duplicatedBooks = await em.clone(author.books.get, {
     overrides: () => ({ author: author2 }),
     postClone: (original, clone) => {
       originalToClone.set(original, clone);
     },
   });
   ```

### Type-safe callbacks

Because `em.clone` is often used to clone a tree/subgraph of data, there are likely multiple entity types involved in a given clone, i.e. a single clone might create new `Book`s and new `Author`s.

This means the `em.clone` options like `skipIf`, `overrides`, and `postClone` will likely want to have per-type behavior, which Joist supports by passing maps/records of "entity name => lambda" for each one:

```ts
const copiedBooks = new Map<Book, Book>();
const copy = await em.clone(author, {
  deep: { books: "reviews" },
  skipIf: {
    Book: (original) => original.title === "Excluded",
  },
  overrides: {
    Book: (original) => ({ title: `${original.title} COPY` }),
  },
  postClone: {
    Book: (original, clone) => {
      copiedBooks.set(original, clone);
    },
    BookReview: (original, clone) => {
      clone.rating = original.rating + 1;
    },
  },
});
```

This allows each lambda to be strongly typed, i.e. the `Book` `skipIf` handler's `original` is already typed as `Book`, not a generic `Entity`. Override handlers return the matching entity's creation options, such as `Partial<BookOpts>`.
