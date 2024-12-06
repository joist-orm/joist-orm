---
title: Evolution of Defaults
slug: evolution-of-defaults
authors:
  - name: Stephen Haberman
    url: https://github.com/stephenh
    image_url: https://github.com/stephenh.png
tags: []
---

Joist's mission is to help you model your application's business logic, with first-class support for domain modeling concepts & features.

An example of this is Joist's support for something as simple as default values (i.e. the `Author.status` field should default to `Active`), and particularly observing how the feature of "set a default" evolved over time.

### Step 1. In the beginning: schema defaults

Joist's initial default value support was simple, and limited to whatever was declared as `DEFAULT`s in the database schema--which is just fine! This is a great place for simple/static defaults.

I.e. for a `status_id` column like:

```sql
CREATE TABLE example_table (
    id SERIAL PRIMARY KEY,
    status_id INTEGER DEFAULT 1,
);
```

`Author` entities get the default `status: 1` applied:

```ts
const a = em.create(Author, {});
console.log(a.status).toBe(AuthorStatus.Draft); // already Draft
```

This was an obvious approach, and had a few pros:

* Pro: The `status` can be set immediately within the `em.create`
* Pro: No duplication of "`status: Draft` is the default" between the database schema & TypeScript code
* Con: Only supports static values

### Step 2. Using beforeCreate hooks

Being limited to static values is not great, so the first way of implementing "setting a (more complicated) default" was using `beforeCreate` hooks:

```ts
/** Any author created w/non-zero amount of books defaults to Published. */
config.beforeCreate("books", a => {
  if (a.status === undefined) {
    a.status = a.books.get.length > 0 ? AuthorStatus.Published : AuthorStatus.Draft;
  }  
})
```

* Pro: Support for arbitrary business logic
* Con: Default isn't ran until `em.flush`
* Con: Susceptible to hook ordering issues
  * If our default's business logic, depends on the default logic of another entity's fields, it can be hard to ensure their's "runs first"
* Con: Boilerplate/imperative--not really a first-class feature
  * The code has to 1st check if `a.status` is already set (not a huge deal, but boilerplate)
  * There is nothing in the code/API that identifies "this is a default", instead we just have an adhoc pattern of "this is how our app sets defaults"

### Step 3: Adding a real API

We lived with the Step 1 & 2 options for several years, because they worked well enough, but finally wanted to make "setting defaults" a first-class feature.

The intended benefits for this were:

* Providing a first-class, idiomatic way to "set a default" instead of the "check the field in a `beforeCreate` hook"
* Eventually use the "set a default" awareness to drive documentation & tooling around field usage & dependencies
* Eventually provide "cross-default dependency tracking"

This step our `config.setDefault` method, which specified the field name, it's dependencies (if any), and a lambda that would calculate the default value:

```ts
config.setDefault("status", "books", a => {
  return a.books.get.length > 0 ? AuthorStatus.Published : AuthorStatus.Draft;
})
```

Initially the `setDefault` lambdas were invoked naively during `em.flush`, just like any other `beforeCreate` hook, but the API step us up for the next improvement.

### Step 4: Dependency Tracking

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

Now, if both a `Book` and an `Author` are created at the same time, `em.flush` will ensure that the `Book.status` is calculated before invoking the `Author.status` default--i.e. _we've solved our hook ordering issue_!

This was both a major accomplishment--cross-entity defaults had been a thorn in our side for several years at this point--while also admitting that, thankfully, this is a rare/somewhat obsecure need.

I.e. in our domain model of ~100s of entities, we have only ~2-3 of these "cross-entity defaults", so we want to be clear this is not necessarily a "must have" feature--but, when you need it, it's extremely nice to have!

### Factories Join the Party


### Future: Finds


### Slow Grind 

We used Joist for 4 years without cross-entity default dependency tracking, and it was fine, we didn't need it to ship features.

At first `beforeCreate` was enough, and for awhile `setDefault` was enough.
