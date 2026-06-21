---
title: Scope Queries
description: Documentation for reusable scope queries
sidebar:
  order: 3.5
---

Scope queries let you name and compose common `em.find` filters directly on entity classes, i.e. after declaring them on the `Author` entity:

```ts
export class Author extends AuthorCodegen {
  static adult = scope({ age: { gte: 18 } });
  static active = scope({ deletedAt: null });
  static popular = scope((a) => a.isPopular.eq(true));
}
```

You can re-use them throughout your codebase:

```ts
await Author.adult.find(em);
await Author.adult.popular.find(em);
await Author.named("a").adult.find(em);
```

Scopes provide a typed API for build reusable snippets of `where`, `conditions`, `orderBy`, `limit`, `offset`, and `softDeletes`.

Internally, scopes are basically syntax-sugar for Joist's regular [em.find](./queries-find), so they share the same semantics and filter syntax.

:::tip[info]

Joist's scopes are heavily inspired by Rails scopes, but are strongly-typed and adapted to fit into Joist's conventions.

For example, Joist's `EntityManager` is fundamental to its Unit of Work & Identity Caching features, so Joist's scopes always require a `.find(em)` to know which `em` to use for loading/caching the entities.

:::

## Declaring Scopes

Scopes are created in an entity file like `Author.ts` by importing the corresponding `<entity>Scope` function from `./entities` and then, just for convention, renaming it to `scope`:

```ts
import {
  AuthorCodegen,
  authorConfig as config,
  authorScope as scope,
  type AuthorScope,
} from "./entities";

export class Author extends AuthorCodegen {
  // Now invoke `scope(...)` to create the static scope fields
  static adult = scope({ age: { gte: 18 } });
  static active = scope({ deletedAt: null });
  static popular = scope((a) => a.isPopular.eq(true));
}
```

The `authorScope as scope` import is already pre-typed for the `Author`, so any filters to `scope(...)` will be type-checked to ensure they use the same fields and operators as `em.find(Author, ...)`.

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

## Chaining

Scopes can be chained together `AND` semantics:

```ts
// Find both >18 _and_ popular authors
await Author.adult.popular.find(em);
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

Repeated root-level object filters are ANDed instead of simply object-spread together:

```ts
await Author.senior.where({ age: { gte: 18 } }).find(em);
```

For complex nested relation filters where repeated object keys would be ambiguous, prefer a single combined object filter for that relation.

## Invocation Methods

Scopes execute through "terminal" invocation methods:

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

## Codegen

Joist generates a scope function and scope types in each `<Entity>Codegen.ts` file:

```ts
export interface AuthorScopes {
  adult: AuthorScope;
  active: AuthorScope;
  popular: AuthorScope;
  named: (prefix: string) => AuthorScope;
}

export type AuthorScope = Scope<Author, AuthorScopes>;

export const authorScope = newScopeFn<Author>("Author");
```

You should not edit this generated file directly. Add static scope properties to your user-owned `Author.ts`, then run codegen so Joist refreshes the generated `AuthorScopes` interface.

Codegen discovers scope declarations with a syntax-only scan. To be discovered, a scope must be a static property with an explicit scope type:

```ts
static adult: AuthorScope = scope({ age: { gte: 18 } });
static named: (prefix: string) => AuthorScope = scope.fn((prefix) => (a) => a.firstName.like(`${prefix}%`));
```

Static methods are not discovered:

```ts
// Not discovered by codegen
static named(prefix: string): AuthorScope {
  return scope((a) => a.firstName.like(`${prefix}%`));
}
```

## When To Use Scopes

Use scopes when a filter becomes a named domain concept:

```ts
await Author.active.adult.popular.find(em);
```

For one-off filters, keep using `em.find` directly:

```ts
await em.find(Author, { age: { gte: 18 }, isPopular: true });
```
