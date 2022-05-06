---
title: One to Manys
sidebar_position: 4
---

Joist's codegen will look for `o2m` "incoming" foreign keys like:

```console
                                       Table "public.books"
   Column   |           Type           | Collation | Nullable |              Default
------------+--------------------------+-----------+----------+-----------------------------------
 id         | integer                  |           | not null | nextval('books_id_seq'::regclass)
 author_id  | integer                  |           | not null |
 ...
Indexes:
    "books_pkey" PRIMARY KEY, btree (id)
    "books_author_id_idx" btree (author_id)
Foreign-key constraints:
    "books_author_id_fkey" FOREIGN KEY (author_id) REFERENCES authors(id) DEFERRABLE INITIALLY DEFERRED
```

And automatically include them in the `BookCodegen` file as a reference:

```typescript
export abstract class BookCodegen {
  readonly author: ManyToOneReference<Book, Author, never> = hasOne(authorMeta, "author", "books");
}
```

### Required vs. Optional

When `books.author_id` is `not null`, the reference is modeled as required, i.e. `ManyToOneReference.get` returns `Author`, and cannot be `undefined`.

When `books.author_id` is `nullable`, the refernece is modeling as optional, i.e. `ManyToOneReference.get` returns `Author | undefined`, and so can be `undefined`.

### Unloaded vs. Loaded

Because the `author_id` column exists directly on the `books` table, some methods are available immediately:

```typescript
const b = await em.load(Book, "b:1");
console.log(b.author.id, b.author.isSet);
```

But accessing the `Author` entity itself requires a populate hint:

```typescript
const b = await em.load(Book, "b:1", "author");
console.log(b.author.get.firstName);
```

### In Sync Relations

Joist will keep both sides of a m2o/o2m relationship sync, i.e.:

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
