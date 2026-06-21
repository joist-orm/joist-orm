---
title: Scope Queries
description: Documentation for reusable scope queries
sidebar:
  order: 3.5
---

Scope queries let you name and compose common `em.find` filters directly on entity classes.

They are inspired by Rails scopes, but they still use Joist's explicit `EntityManager` model:

```ts
await Author.adult.find(em);
await Author.adult.popular.find(em);
await Author.named("a").adult.find(em);
```

Internally, scopes compile down to Joist's regular [find query](./queries-find) shape. They are a reusable, typed way to build `where`, `conditions`, `orderBy`, `limit`, `offset`, and `softDeletes` options.

## Declaring Scopes

In your user-owned entity file, import the generated per-entity scope factory and generated scope type from `./entities`:

```ts
import {
  AuthorCodegen,
  authorConfig as config,
  authorScope as scope,
  type AuthorScope,
} from "./entities";

export class Author extends AuthorCodegen {
  static adult: AuthorScope = scope({ age: { gte: 18 } });
  static active: AuthorScope = scope({ deletedAt: null });
  static popular: AuthorScope = scope((a) => a.isPopular.eq(true));
}

config.placeholder();
```

The `authorScope as scope` import is already typed for `Author`, so the filter passed to `scope(...)` uses the same fields and operators as `em.find(Author, ...)`.

## Object Scopes

The simplest scope is just a find filter:

```ts
export class Author extends AuthorCodegen {
  static adult: AuthorScope = scope({ age: { gte: 18 } });
  static active: AuthorScope = scope({ deletedAt: null });
}
```

This is equivalent to reusing the same `em.find` filter each time:

```ts
await Author.adult.find(em);
```

## Alias-Condition Scopes

For filters that are easier to express with Joist aliases, pass a callback:

```ts
export class Author extends AuthorCodegen {
  static popular: AuthorScope = scope((a) => a.isPopular.eq(true));
}
```

The callback receives a typed alias for the entity and returns one condition or an array of conditions.

## Parameterized Scopes

Use `scope.fn` for scopes that take arguments:

```ts
export class Author extends AuthorCodegen {
  static named: (prefix: string) => AuthorScope = scope.fn((prefix) => (a) => a.firstName.like(`${prefix}%`));
}
```

Parameterized scopes are regular static properties whose type is a function returning `AuthorScope`.

```ts
await Author.named("a").find(em);
await Author.named("a").adult.find(em);
```

## Chaining

Scopes are immutable and chain with AND semantics:

```ts
await Author.adult.popular.find(em);
await Author.active.where({ firstName: "a1" }).find(em);
```

You can also define a scope in terms of another scope:

```ts
export class Author extends AuthorCodegen {
  static adult: AuthorScope = scope({ age: { gte: 18 } });
  static popular: AuthorScope = scope((a) => a.isPopular.eq(true));
  static popularAdult: AuthorScope = Author.popular.adult;
  static recentAdults: AuthorScope = Author.adult.orderBy({ createdAt: "DESC" });
}
```

Because scopes are immutable, chaining from `Author.adult` does not mutate the base `adult` scope.

## Builders

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

## Terminal Methods

Scopes execute through terminal methods:

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

Joist generates a scope factory and scope types in each `<Entity>Codegen.ts` file:

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
