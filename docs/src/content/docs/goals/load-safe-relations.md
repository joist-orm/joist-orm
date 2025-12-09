---
title: Load-Safe Relations
description: Documentation for Load-Safe Relations
sidebar:
  order: 4
---

Joist models all relations as async-by-default, i.e. you must access them via `await` calls:

```ts
const author = await em.load(Author, "a:1");
// Returns the publisher if already fetched, otherwise makes a (N+1 safe) SQL call 
const publisher = await author.publisher.load();
// Now the comments...
const publisherComments = await publisher.comments.load();
// Now the books...
const books = await author.books.load();
```

We call this "load safe", because the type system prevents you from accidentally accessing unloaded data, i.e. invoking `publisher.comments.length` before the `comments` are loaded, which in ORMs like TypeORM result in annoyingly-frequent runtime errors.

Joist's "async by default" / "load safe" approach solves this, but then to improve ergonomics and avoid tedious `await` or `Promise.all` calls, Joist also supports marking relations as explicitly loaded, to enable synchronous `.get`, non-`await`-d access:

```ts
// Preload publisher, it's comments, and books
const author = await em.load(Author, "a:1", { publisher: "comments", books: {} });
// Now these can all be syncronous--no awaits!
const publisher = author.publisher.get;
const publisherComments = publisher.comments.get;
const books = author.books.get;
```

## Background

One of the main DX affordances of ORMs is that relationships (relations) between tables in the database (i.e. foreign keys) are modelled as references & collections on the classes/entities in the domain model.

For example, in most ORMs a `books.author_id` foreign key column means the `Author` entity will have an `author.books` collection (which loads all books for that author), and the `Book` entity will have a `book.author` reference (which loads the book's author).

In all ORMs, these references & collections are inherently lazy: because you don't have your entire relational database in memory, objects start out with just a single/few rows loaded (i.e. a single `authors` row with `id=1` loaded as an `Author#1` instance) and then lazily loaded the data you need from there (i.e. you "walk the object graph" from that `Author#1` to the related data you need).

## Async By Default

Because of the inherently lazy nature of references & collections, Joist takes the strong, type-safe opinion that if they _might_ be unloaded, then they _must_ be marked as `async/await`.

For example, you have to access `author.books` via an `await`-d promise:

```typescript
const author = await em.load(Author, "a:1");
const books = await author.books.load();
```

And you must do this each time, even if technically in the code path that you're in, you "know" that `books` has already been loaded, i.e.:

```typescript
const author = await em.load(Author, "a:1");
// Call another method that happens to loads books
someComplicatedLogicThatLoadsBooks(author);
// You still can't do `books.get`, even though "we know" (but the compiler
// does not know) that the collection is technically already cached in-memory
const books = await author.books.load();
```

## But Async is Kinda Annoying

While Joist's "async by default" approach is the safest, it is admittedly tedious when you get to double/triple levels of `await`s, i.e. to go from an `Author` to their `Book`s to each `Book`'s `BookReview`s:

```typescript
const author = await em.load(Author, "a:1");
await Promise.all((await author.books.load()).map(async (book) => {
  // For each book load the reviews
  return Promise.all((await book.reviews.load()).map(async (review) => {
    console.log(review.name);
  })); 
}));
```

Yuck.

Given this complication, some ORMs in the JavaScript/TypeScript space sometimes fudge the "collections must be async" approach, and allow you to model collections as _synchronous_, i.e. you're allowed to do:

```typescript
const author = await em.load(Author, "a:1");
// I promise I loaded books
await author.books.load();
// Now access it w/o promises
author.books.get.length;
```

Which is nice! But the wrinkle is that we're now trusting ourselves to only access `books` _after_ an explicit `load`, and if we forget, i.e. when our code paths end up being complex enough that it's hard to tell, then we'll get a runtime error that `books.get` is not allowed to be called

Because of this lack of safety, Joist avoids this approach, and instead has something fancier.

## The Magic Escape Hatch

Ideally what we want is to have relations lazy-by-default, except when we've explicitly told TypeScript that we've loaded them. This is what Joist does.

In Joist, populate hints (which tell the ORM to pre-fetch data before it's actually accessed) also _change the type of the entity_, and mark relations that were explicitly listed in the hint as loaded.

This looks like:

```typescript
const book = await em.populate(
  originalBook,
  // Tell Joist we want `{ author: "publisher" } preloaded
  { author: "publisher" });
// The `populate` return type is now "special"/MarkLoaded `Book`
// that has `author` and `publisher` marked as "get"-able
expect(book.author.get.firstName).toEqual("a1");
expect(book.author.get.publisher.get.name).toEqual("p1");
```

Note that `originalBook`'s `originalBook.author` reference does _not_ have `.get` available (just the safe `.load` which returns a `Promise`); only the modified `Book` type returned from `em.populate` has the `.get` method added `author.book`.

:::tip[Tip]

You can avoid having two `originalBook` / `book` variables by passing populate hints directly to `EntityManager.load`, which will then return the appropriate `.get`-able references:

```typescript
const book = await em.load(
  Book,
  "a:1",
  { author: "publisher" });
expect(book.author.get.firstName).toEqual("a1");
expect(book.author.get.publisher.get.name).toEqual("p1");
```

:::


Joist's `populate` approach also works for multiple levels, i.e. our triple-nested `Promise.all`-hell example can be written with a single `await`

```typescript
const author = await em.load(
  Author,
  "a:1",
  { books: "reviews" },
);
author.books.get.forEach((book) => {
  book.reviews.get.forEach((review) => {
    console.log(review.name);
  });
})
```

## Load Hints as Backend Fragments

Joist's load hints can provide "GraphQL fragment like" encapsulation for helper methods that are invoked in one place, but have their data loaded in another.

For example, let's define a helper method that generates `Book` overviews, from a subgraph (fragment) of data:

```ts
function generateOverview(
  // define the subgraph of data we need
  book: Loaded<Book, { author: "publisher" }>   
): string {
  const { author } = withLoaded(book); 
  // Whatever the business logic is..., note we're allowed to synchronously
  // access anything in our Loaded subgraph
  return [
    book.title,
    author.firstName,
    author.publisher.get.name,
  ].join(",")
}
```

However, often times we end up having to "load the book data" far away from when `generateOverview` is actually invoked, like:

```ts
const books = await em.find(
  Book,
  { ...someConditions... },
  // remember to make the load hint here match `generateOverview`  
  { populate: { author: "publisher" } },
);

// ...
// a lot of code/business logic...
// ...

for (const book of books) {
  // Finally we call generateOverview
  generateOverview(book);
}
```

Note that Joist's type-safety will make sure the `generateOverview` call fails to type-check 💪, if the `em.find`'s `populate` type-hint drifts/does not overlap with the type declared by `generateOverview`.

Which is great, but in larger/more complex scenarios it can be tedious to keep these two in sync--the `generateOverview`'s type, and the `populate` load hint; when this happens, we can lean into TypeScript:

```ts
// Declare a const of the load type
const overviewHint = { author: "publisher" } satisifies LoadHint<Book>;
// And a type that uses the load hint, basically our fragment type
const OverviewBook = Loaded<Book, typeof overviewHint>;

// now generateOverview uses the type
function generateOverview(book: OverviewBook): string {
  // We can still access book.author/book.author.publisher synchronously
  return "...business logic...";
}

// And we reference the const in find our:
const books = await em.find(Book, {}, { populate: overviewHint });
```

This dries up our `em.find` call, and makes it much more declarative about who/why we're populating this data. And it helps `populate` hints from accumulating cruft over time, where their data was initially used, but now no longer necessary in the actual codepaths.

And because these `const`s and `type`s are "just regular TypeScript", we can compose them, i.e.:

```ts
// Defined by `BookView`
const bookViewHint = "author" satisfies LoadHint<Book>;

// Defined by `AuthorView` that wants to also call `BookView`
// but also render its own per-book data
const authorHint = {
  firstName: {},
  books: { ...bookViewHint, "title": {} },
} satisifes LoadHint<Author>;

type LoadedAuthor = LoadHint<Author, authorHint>;
```

Granted, you might have to deep merge sufficiently-complicated type hints--we don't yet have a utility method to do that, but probably should!

## Best of Both Worlds

This combination of "async by default" and "populate hint mapped types" brings the best of both worlds:

- Data that we are unsure of its loaded-ness, must be `await`-d, while
- Data that we (and, more importantly, the TypeScript compiler) are sure of its loaded-ness, can be accessed synchronously

