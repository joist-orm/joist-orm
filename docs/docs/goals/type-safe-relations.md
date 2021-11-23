---
title: Type-Safe Relations
sidebar_position: 3
---

## All Relations are Async/Await (w/Type-safe Escape Hatch)

Joist takes the strong opinion that any operation that _might_ be lazy loaded (like accessing an `author.books` collection that may or may not already be loaded in memory) _must_ be marked as `async/await`.

Other ORMs in the JS/TS space often fudge this, i.e. they might model an `Author` with a `books: Book[]` property where you can get the pleasantness of accessing `author.books` without `await`s/`Promise.all`/etc. code--as long as whoever loaded this `Author` instance ensured that `books` was already fetched/initialized.

This seems great in the short-term, but Joist asserts its dangerous in the long-term, because code written to rely on the "`author.books` is a `Book[]`" assumption is now coupled to `author.books` being pre-fetched and _always_ being present, regardless of the caller.

This sort of implementation detail is easy to enforce when the synchronous-assuming (i.e. `for (book in author.books)`) is 5 lines below the "load author with a `books` preload hint" in the same file. However it's very hard to enforce in a large codebase, when business logic and validation rules can be triggered from multiple operation endpoints. And, so when `author.books` is _not_ loaded, it will at best cause a runtime error ("hey you tried to access this unloaded collection") and at worst cause a very obscure bug (by returning a falsely empty collection or unset reference).

Essentially this approach of having non-async collections creates a contract ("`author.books` must somehow be loaded") that is not present in the type system, so now the programmer/maintainer must remember and self-enforce it.

So Joist does not do that, all references/collections are "always `async`".

..._that said_, writing business logic across a few collections that you "know" are in memory but have to use promises anyway is extremely tedious.

So, Joist has a way to explicitly mark subsets of fields, on subsets of object instances, as preloaded and so safe to synchronously access.

This looks like:

```typescript
// Note the `{ author: "publisher" } preload hint
const book = await em.populate(originalBook, { author: "publisher" });
// The `populate` return type is a "special" `Book` that has `author` and `publisher` marked as "get-safe"
expect(book.author.get.firstName).toEqual("a1");
expect(book.author.get.publisher.get.name).toEqual("p1");
```

Where `originalBook`'s references (`book.author`) could _not_ call `.get` (only `.load` which returns a `Promise`), however, the return value of `em.populate` uses mapped types to transform only the fields listed in the hint (`author` and the nested `author.publisher`) to be safe for synchronous access, so the calling code can now call `.get` and avoid the fuss of promises (only for this section of `populate`-blessed code).

Most of Joist's `EntityManager` take a `populate` parameter to help you return data both a) already loaded from the database, and b) _marked in the type system as loaded_ to achieve the pleasantness of synchronous access without the risks of mis-modeling references as always/naively loaded.

As one more helpful feature, you can also navigate across multiple levels of the object graph with a single async call using `Entity.load`, i.e.:

```typescript
// await way
const allAuthorReviews = (await Promise.all(await author.books.load()).map((b) => b.comments.load())).flat();
// lens navigation way
const allAuthorReviews = await author.load((a) => a.books.comments);
```

Here `a.books.comments` acts similar to a [lens](https://medium.com/@dtipson/functional-lenses-d1aba9e52254), and defines a (type safe) path that `load` then recursively/asynchronously navigates for you, with the convenience of only having a single `await` call in your code.
