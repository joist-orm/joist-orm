---
title: Scope Queries
description: Documentation for reusable scope queries
sidebar:
  order: 3.5
---

Scope queries let you name and compose common `em.find` filters for entity classes, i.e. after declaring them on the `Author` entity:

```ts
export class Author extends AuthorCodegen {
  static adult = scope({ age: { gte: 18 } });
  static active = scope({ deletedAt: null });
  static popular = scope((a) => a.isPopular.eq(true));
  static hasBooks = scope({ books: true });
  static booksReviewedBy = scope.fn((reviewer: Author) => ({ books: { reviewer } }));
}
```

You can re-use them throughout your codebase:

```ts
await Author.adult.find(em);
await Author.adult.popular.find(em);
await Author.named("a").adult.find(em);
await Author.hasBooks.find(em);
await em.find(Author, Author.adult);
await em.find(Book, { author: Author.adult });
```

Scopes provide a typed API for building reusable snippets of `where`, `conditions`, `orderBy`, `limit`, `offset`, and `softDeletes`.

Internally, scopes are basically syntax-sugar for Joist's regular [em.find](./queries-find), so they share the same semantics and filter syntax.

:::tip[info]

Joist's scopes are heavily inspired by Rails scopes, but are strongly-typed and adapted to fit into Joist's conventions.

For example, Joist's `EntityManager` is fundamental to its Unit of Work & Identity Caching features, so Joist's scopes always require a `.find(em)` to know which `em` to use for loading/caching the entities.

:::

## Declaring Scopes

Scopes are created in an entity file like `Author.ts` by importing the corresponding `<entity>Scope` function from `./entities` and then, just for convention, renaming it to `scope`:

```ts
import { AuthorCodegen, authorConfig as config, authorScope as scope, type AuthorScope } from "./entities";

export class Author extends AuthorCodegen {
  // Now invoke `scope(...)` to create the static scope fields
  static adult = scope({ age: { gte: 18 } });
  static active = scope({ deletedAt: null });
  static popular = scope((a) => a.isPopular.eq(true));
  static hasBooks = scope({ books: true });
  static booksReviewedBy = scope.fn((reviewer: Author) => ({ books: { reviewer } }));
}
```

And then **running joist-codegen** after each change to the scopes declarations.

The `authorScope as scope` import is already pre-typed for the `Author`, so any filters to `scope(...)` will be type-checked to ensure they use the same fields and operators as `em.find(Author, ...)`.

:::tip[Caution]

After each scope change to `Author.ts`, you should re-run `joist-codegen` to have the generated `AuthorScopes` type updated.

This "re-codegen after file change" workflow is not ideal, but it's necessary to achieve the recursive `Author.adult.active` ergonomics of Rails scopes, while still being type-safe.

:::

## Filter Scopes

The simplest scope is just a find filter:

```ts
export class Author extends AuthorCodegen {
  static adult = scope({ age: { gte: 18 } });
  static active = scope({ deletedAt: null });
}
```

## Alias-Condition Scopes

For filters that are easier to express with Joist aliases, pass a callback:

```ts
export class Author extends AuthorCodegen {
  static popular = scope((a) => a.isPopular.eq(true));
}
```

The callback receives a typed alias for the entity and returns one condition or an array of conditions.

## Parameterized Scopes

Use `scope.fn` for scopes that take arguments:

```ts
export class Author extends AuthorCodegen {
  static named = scope.fn((prefix) => (a) => a.firstName.like(`${prefix}%`));
}
```

Parameterized scopes are regular static properties whose type is a function returning `AuthorScope`.

```ts
await Author.named("a").find(em);
await Author.named("a").adult.find(em);
```

## Relation Filter Scopes

Scopes can include the same relation filters as `em.find`, including collection relations:

```ts
export class Author extends AuthorCodegen {
  // one-to-many: authors with at least one book
  static hasBooks = scope({ books: true });

  // one-to-many plus nested many-to-one: authors with a book reviewed by `reviewer`
  static booksReviewedBy = scope.fn((reviewer: Author) => ({ books: { reviewer } }));

  // many-to-many: authors with a tag named `tagName`
  static taggedWith = scope.fn((tagName: string) => ({ tags: { name: tagName } }));
}
```

The nested filter shape is identical to `em.find(Author, ...)`, so the same relation semantics apply to one-to-many, many-to-one, and many-to-many paths.

```ts
const reviewer = await em.load(Author, "a:1");

await Author.hasBooks.find(em);
await Author.booksReviewedBy(reviewer).find(em);
await Author.taggedWith("fiction").find(em);
```

## Chaining

Scopes can be chained together and will use `AND` semantics:

```ts
// Find both >18 _and_ popular authors
await Author.adult.popular.find(em);
// Find active _and_ firstName is a1
await Author.active.where({ firstName: "a1" }).find(em);
```

You can also define a scope in terms of another scope:

```ts
export class Author extends AuthorCodegen {
  static adult = scope({ age: { gte: 18 } });
  static popular = scope((a) => a.isPopular.eq(true));
  static popularAdult = Author.popular.adult;
  static recentAdults = Author.adult.orderBy({ createdAt: "DESC" });
}
```

## Additional Builders

Every scope also has builder methods for ad-hoc additions:

```ts
await Author.adult.where({ firstName: "a1" }).find(em);
await Author.adult.where((a) => a.age.lte(65)).find(em);
await Author.adult.orderBy({ createdAt: "DESC" }).limit(10).find(em);
await Author.adult.softDeletes("include").find(em);
```

If a single field has multiple filters chained together, they are `AND`-d together, i.e. this query will have two `age` conditions (one from `senior`, one inline) `AND` together:

```ts
await Author.senior.where({ age: { gte: 18 } }).find(em);
```

For collection relations, separate `.where` calls remain separate predicates. This finds authors that have a book titled `A` and also have a book titled `B`:

```ts
await Author.adult
  .where({ books: { title: "A" } })
  .where({ books: { title: "B" } })
  .find(em);
```

The two predicates do not need to match the same book row.

## Using Scopes With em.find

Scopes can also be passed directly to `em.find` anywhere Joist expects a filter for that entity. Root scopes can be simple field filters, include builder settings, or traverse relations:

```ts
const adults = await em.find(Author, Author.adult);
const recentAdults = await em.find(Author, Author.adult.orderBy({ createdAt: "DESC" }).limit(10));
const authorsWithBooks = await em.find(Author, Author.hasBooks);
const taggedAuthors = await em.find(Author, Author.taggedWith("fiction"));
```

They can also be used inside relation filters:

```ts
const booksByAdults = await em.find(Book, { author: Author.adult });
const booksByNamedAdults = await em.find(Book, { author: { firstName: "alice", and: Author.adult } });
```

When a relation filter already has sibling fields, put the scope under `and` or `or` to make the composition explicit.

## Invocation Methods

Scopes are executed by invoking any of the "terminal" methods:

```ts
const authors = await Author.adult.find(em);
const author = await Author.adult.findOne(em);
const required = await Author.adult.findOneOrFail(em);
const count = await Author.adult.findCount(em);
const ids = await Author.adult.findIds(em);
```

`find`, `findOne`, and `findOneOrFail` accept normal find options, including `populate`:

```ts
const authors = await Author.adult.find(em, { populate: "books" });
const author = await Author.adult.findOneOrFail(em, { populate: "books" });
```

## Codegen Details

To achieve the Rails-style fluent typing, Joist generates a scope function and scope types in each `<Entity>Codegen.ts` file:

```ts
export interface AuthorScopes {
  adult: AuthorScope;
  active: AuthorScope;
  popular: AuthorScope;
  hasBooks: AuthorScope;
  booksReviewedBy: (reviewer: Author) => AuthorScope;
  taggedWith: (tagName: string) => AuthorScope;
  named: (prefix: string) => AuthorScope;
}

export type AuthorScope = Scope<Author, AuthorScopes>;

export const authorScope = newScopeFn<Author>("Author");
```

You should not edit this generated file directly.

After adding `static` scope properties to your `Author.ts`, run `joist-codegen` so Joist refreshes the generated `AuthorScopes` interface.

## When To Use Scopes

Use scopes when a filter becomes a named domain concept:

```ts
await Author.active.adult.popular.find(em);
```

For one-off filters, keep using `em.find` directly:

```ts
await em.find(Author, { age: { gte: 18 }, isPopular: true });
```
