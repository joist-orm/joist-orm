---
title: GraphQL Filters
description: Documentation for Graphql Filters
sidebar:
  order: 4
---


### GraphQL-Compatible Filters

Joist's `find` supports the standard "filter as object literal" pattern, i.e.

```typescript
const authors = em.find(Author, { age: { gte: 20 } });
```

And the generated `AuthorFilter` type that drives this query is fairly picky, i.e. `age: null` is not a valid query if the age column is not null.

This works great for TypeScript code, but when doing interop with GraphQL (i.e. via types generated by graphql-code-generator), Joist's normal `AuthorFilter` typing is "too good", i.e. while GraphQL's type system is great, it is more coarse than TypeScript's, so you end up with things like `age: number | null | undefined` on the GQL filter type.

To handle this, Joist generates separate GraphQL-specific filter types, i.e. `AuthorGraphQLFilter`, that can fairly seamlessly integrate with GraphQL queries with a dedicated `findGql` query methods.

I.e. given some generated GraphQL types like:

```typescript
/** Example AuthorFilter generated by graphql-code-generator. */
interface GraphQLAuthorFilter {
  age?: GraphQLIntFilter | null | undefined;
}

/** Example IntFilter generated by graphql-code-generator. */
interface GraphQLIntFilter {
  eq?: number | null | undefined;
  in?: number[] | null | undefined;
  lte?: number | null | undefined;
  lt?: number | null | undefined;
  gte?: number | null | undefined;
  gt?: number | null | undefined;
  ne?: number | null | undefined;
}
```

Joist's `EntityManager.findGql` will accept the filter type as-is / "directly off the wire" without any cumbersome mapping:

```typescript
// I.e. from the GraphQL args.filter parameter
const gqlFilter: GraphQLAuthorFilter = {
  age: { eq: 2 },
};
const authors = await em.findGql(Author, gqlFilter);
```

Also note that while the `age: { eq: 2 }` is a really clean way to write filters by hand, it can be annoying to dynamically create, i.e. in a UI that needs to conditionally change the operator from "equals" to "not equals", because there is not a single key to bind against in the input type.

To make building these UIs easier, `findGql` also accepts a "more-boring" `{ op: "gt", value: 1 }` syntax. The value of the `op` key can be any of the supported operators, i.e. `gt`, `lt`, `gte`, `ne`, etc.
