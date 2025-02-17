---
title: Evolution of Defaults
slug: evolution-of-defaults
authors:
  - name: Stephen Haberman
    url: https://github.com/stephenh
    image_url: https://github.com/stephenh.png
tags: []
---

Joist's mission is to model your application's business logic, with first-class support for domain modeling features & concepts.

A great example of this is Joist's support for something as simple as default values (i.e. the `Author.status` field should default to `Active`).

Specifically, we can observe how Joist's support for default values has grown from "the simplest thing possible" to a more robust, first-class feature over time.

### Version 1. Schema Defaults

Joist's initial defaults support was purposefully "as simple as possible", and limited to `DEFAULT`s declared in the database schema, i.e. an `is_archived` field that defaults to `FALSE`, or a `status_id` that defaults to `DRAFT`:

```sql
CREATE TABLE example_table (
    id SERIAL PRIMARY KEY,
    is_archived BOOL DEFAULT false,
    status_id INTEGER DEFAULT 1,
);
```

Joist's codegen would recognize these, and "apply them immediately" when creating an entity:

```ts
const a = em.create(Author, {});
expect(a.status).toBe(AuthorStatus.Draft); // already Draft
expect(a.isArchived).toBe(false); // already false
```

This was super-simple, and had a few pros:

* Pro: The `status` is immediately within the `em.create`
  - I.e. you don't have to wait for an `em.flush` to "see the database default"
  - Any business logic can immediately start using the default
* Pro: No duplication of "draft is the default" between the database schema & TypeScript code
* Con: Only supports static, hard-coded values 
  - Ideally we'd like to write lambdas to calculate defaults, based on business logic

### Version 2. beforeCreate hooks

Being limited to static `DEFAULT` values is not great, so the first way of implementing more complicated "dynamic defaults" was using Joist's `beforeCreate` hooks:

```ts
/** Any author created w/non-zero amount of books defaults to Published. */
config.beforeCreate("books", a => {
  if (a.status === undefined) {
    a.status = a.books.get.length > 0 ? AuthorStatus.Published : AuthorStatus.Draft;
  }  
})
```

This was a quick-win b/c Joist already supported `beforeCreate` hooks, but had a few cons:

* Pro: Supports arbitrary business logic
  - The load hint easily enables cross-entity calculations
* Con: The default logic isn't ran until `em.flush`
  - Harder for business logic to rely on
  - Creates inconsistency between "hard-coded defaults" (applied immediately in `em.create`) and "dynamic defaults" (applied during `flush`)
* Con: Susceptible to hook ordering issues
  * If our default's value depends on *other* defaults, it is hard to ensure the other "runs first"
* Con: Boilerplate/imperative (not really a first-class feature)
  * The code has to 1st check if `a.status` is already set (not a huge deal, but boilerplate)
  * There is nothing in the code/API that identifies "this is a default", instead we just have an adhoc pattern of "this is how our app sets defaults"
* Con: Caused duplication with test factories
  * Our test factories often wanted "the same defaults" applied, but Joist's factories are synchronous, which meant any logic that was "set in `beforeCreate`" wouldn't be seen right away.
  * To work around this, we often "wrote twice" default logic across our entities & test factories--not great!

### Version 3: Adding setDefault

We lived with the Version 1 & 2 options for several years, because they were "good enough", but for the 3rd version, we wanted to start "setting defaults" on the road to being "more than just good enough".

Specifically, we wanted a first-class, idiomatic way to "declaratively specify a field's default value" instead of the previous "manually check the field in a `beforeCreate` hook".

So we added `config.setDefault`, which accepts the field name, it's dependencies (if any), and a lambda that would calculate the default value:

```ts
/** Calculate the Author.status default, based on number of books. */
config.setDefault("status", "books", a => {
  return a.books.get.length > 0 ? AuthorStatus.Published : AuthorStatus.Draft;
})
```

This was a great start, but we pushed it out knowingly half-baked:

* Pro: Provided scaffolding of a better future
  - Gave an idiomatic way to "declare defaults"
* Con: `setDefault` lambdas were still not invoked until `em.flush`
  * So we still had the "write defaults twice" problem with test factories 
* Con: The dependencies weren't actually used yet

### Version 4: Dependency Aware

After having the `setDefault` API in production for a few months, the next improvement was to capitalize on "knowing our dependencies" and allow defaults to depend on other defaults.

For example, maybe our `Author.status` default needs to know whether any of the books are published (which itself is a default):

```ts
// In `Author.ts`
config.setDefault("status", { books: "status" }, a => {
  const anyBookPublished = a.books.get.some(b => b.status === BookStatus.Published);
  return anyBookPublished ? AuthorStatus.Published : AuthorStatus.Draft;
})

// In `Book.ts`
config.setDefault("status", {}, b => {
  // Some business logic that dynamically determines the status
  return BookStatus.Published;
});
```

Now, if both a `Book` and an `Author` are created at the same time, `em.flush` will ensure that the `Book.status` is calculated before invoking the `Author.status` default--_we've solved our ordering issue!_

This was a major accomplishment--cross-entity defaults had been a thorn in our side for years.

(Fwiw we readily admit this is a rare/obscure need--in our domain model of 100s of entities, we have only ~2-3 of these "cross-entity defaults", so we want to be clear this is not necessarily a "must have" feature--but, when you need it, it's extremely nice to have!)

* Pro: Finally unlocked cross-entity defaults
* Con: Still have the "write defaults twice" problem with factories

### Version 5: Teaching Factories!

The next DX iteration was solving the duplication of "factories want the defaults too!".

Looking more closely at this issue, Joist's test factories are synchronous, which means we can create test data easily without any `await`s:

```ts
// Given an author
const a = newAuthor(em);
// And a book 
const b = newBook(em, { author: a });
// And setup something else using b.title
// ...if there is "default title logic", it will not have ran yet, which
// can be confusing for tests/other logic expecting that behavior 
console.log(b.title);
```

The lack of `await`s is very nice! But it does mean, if we really wanted `b.title` to *immediately* reflect its production default, we had recode the default logic into the `newBook` factory:

```ts
export function newBook(em: EntityManager): DeepNew<Book> {
  return newTestInstance(em, Book, {
    title: "recode the default here",
  });
}
```

As before, for a while this was "good enough"--but finally in this iteration, we taught the factories to leverage their "each test's data is already in memory" and just invoke the defaults immediately during the `newTestInstance` calls.

This works even for `setDefault`s that use load hints, like "author status depends on its books":

```ts
// In `Author.ts`
config.setDefault("status", { books: "status" }, a => {
  const anyBookPublished = a.books.get.some(b => b.status === BookStatus.Published);
  return anyBookPublished ? AuthorStatus.Published : AuthorStatus.Draft;
})
```

In production, Joist can't assume "the author's books are already in-memory", so `em.flush` would first load / `await` for the `a.books` to be loaded, and then invoke the lambda.

However, because our tests know that `a.books` is already in memory, they can skip this `await`, and immediately invoke the lambda.

* Pro: We finally can remove the factory's "write it twice" defaults

### Version Next: findOrCreates

Always looking ahead, the next itch we have is that, currently, default lambdas that call async methods like `em.find` or `em.findOrCreate` are still skipped during `newTestInstance` and only run during `em.flush`.

Which means, for these defaults, we still have remnants of the "write it twice" defaults anti-pattern--albeit very few of them!

We should be able to lift this restriction as well, with a little bit of work.

## Slow Grind to Perfection

Stepping back, besides a "walk down memory lane", the larger point of this post is just to highlight Joist's journey of continually grinding through DX polish--we're about five years into [Joel's Good Software Takes 10 Years](https://www.joelonsoftware.com/2001/07/21/good-software-takes-ten-years-get-used-to-it/). :-)

Of course, it'd be great for this evolution to happen more quickly--i.e. if we had a dependency-aware, factory-aware, amazing `setDefault` API from day one.

But, often times jumping to an abstraction can be premature, and result in a rushed design--so sometimes it doesn't hurt to "sit with the itch" for a little while, evolve it through multiple iterations of "good enough", until finally a pleasant/robust solution emerges.

And, perhaps most pragmatically, small iterations helps spread the implementation out over enough hack days that it can actually get shipped. :-)
