---
title: FAQ
position: 10
---

## What databases does Joist support?

Currently only Postgres; see [support other databases](https://github.com/joist-orm/joist-orm/issues/636).

## Why are relations modeled as objects?

In Joist, relations are modeled as objects, i.e. `Author.books`, is not a raw array like `Book[]`, but instead a `Collection<Author, Book[]>` that must have `.load()` and `.get` called on it.

This can initially feel awkward, but it allows for a more powerful and flexible API, where relations can be lazily loaded, which is often how business logic wants to interact with the domain model--a continual incremental loading of data as needed.

## Why must properties be explicitly typed?

When declaring custom properties on entities, currently the fields must be explicitly typed, i.e. the `Collection<Author, BookReview>` in the following example is required:

```typescript
export class Author extends AuthorCodegen {
  readonly reviews: Collection<Author, BookReview> = hasManyThrough((author) => author.books.reviews);
}
```

Obviously as TypeScript fans, we'd love to have these field types inferred, and just do `readonly reviews = hasManyThrough`.

Unfortunately, given how interconnected the types of a domain model are, and how sophisticated custom properties can rely on cross-entity typing, attempting to infer the field types quickly leads to the TypeScript compiler failing with cyclic dependency errors, i.e. the `Author`'s fields can only be inferred if `Book` is first typed, but `Book`'s fields can only be inferred if `Author` is first typed.

And adding explicit field types short-circuits these cyclic dependency.


