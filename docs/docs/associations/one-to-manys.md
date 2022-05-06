---
title: Many To Ones
sidebar_position: 2
---

Joist's codegen will look for `m2o` foreign keys like:

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

And automatically include them in the "other sides" `AuthorCodegen` file as a collection:

```typescript
export abstract class AuthorCodegen {
  readonly books: Collection<Author, Book> = hasMany(bookMeta, "books", "author", "author_id");
}
```

### Unloaded vs. Loaded

Because the `authors` table is the "other side" of the relationship, very few methods are available on `Collection` when unloaded.

To be useful, the collection must be loaded with a populate hint:

```typescript
const a = await em.load(Author, "a:1", "books");
console.log(a.books.get.length);
console.log(a.books.get[0].title);
```

### In Sync Relations

Joist will keep both sides of a m2o/o2m relationship sync, i.e.:

```typescript
// Load the author with the books collection loaded
const a = await em.load(Author, "a:1", "books");
// Load a book, and add it to our collection
const b = await em.load(Book, "b:1");
a.books.add(b);
// This will print true
console.log(b.author.get === a);
```
