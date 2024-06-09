---
title: FAQ
position: 10
---

## Why use Entities & Mutable Classes?

See [Why Entities](/docs/modeling/why-entities), and the "Why Classes" and "Why Mutability" sections.

A tldr is that we think mutable entities is the most ergonomic way to indicate "this how you would like the world to look" (i.e. "I want two new books, this old book archived, and the author's name changed"), by making potentially multiple mutations to the entity graph.

After which, Joist's `em.flush` will ensure this "new proposed graph", as an aggregate, in still valid, and then commit all your changes to the database atomically.

Also note that `em.flush` enforces "temporary immutability" during its lifecycle, specifically when running validation rules, by "locking" the entities to ensure they are not further mutated while being validated.

(In a way, you can think of Joist's entities as an [Immer](https://immerjs.github.io/immer/) for your data model--i.e. the database itself progresses through a series of atomic, immutable states (transactions), and Joist's entities are just an ergonomic way to declare what you want the next state to be.)

## What databases does Joist support?

Currently only Postgres; see [support other databases](https://github.com/joist-orm/joist-orm/issues/636).

## Why are relations modeled as objects?

In Joist, relations are modeled as wrapper objects, i.e. `Author.books` is not a raw array like `Book[]`, but instead a `Collection<Author, Book[]>` that must have `.load()` and `.get` called on it.

This can initially feel awkward, but it provides a truly type-safe API, given that relations may-or-may not be loaded from the database, and instead are incrementally into memory.

This is often how business logic wants to interact with the domain model--a continual incremental loading of data as needed, as conditional codepaths are executed, instead of an endpoint/program exhaustively knowing up-front exactly what data will be necessary.

If performance is a concern (loading thousands of entities with many custom properties), Joist provides a [ts-patch transform](/docs/advanced/transform-properties) to rewrite the properties as lazy getters in production builds. 

## Can't I just use Zod for validations in my controller?

Zod works great for crossing the "untyped blob" to "typed POJO" divide, and Joist actually supports Zod for `jsonb` columns, which is a similar "untyped jsonb to typed POJO" use case.

However, Zod can only validate fields directly on the "typed input" itself--is this email field a valid email regex, is the required first name field filled in.

This is fine, but Zod can't validate all the *other* fields in your domain model that now might need revalidated--i.e. maybe the author's `age` field changed, so now validate that they're verified, or updating a purchase order line item's `amount` cannot make the total order's `amount` negative.

Joist's domain model makes it easy to declaratively setup these "cross-field", "cross-entity" business variants, that are more than just `z.string().max(20)`, and then ensure they are *always* enforced, regardless of which controller initiated the mutation.

:::tip

Joist works particularly well with GraphQL, because GraphQL servers handle the basic "untyped blob -> typed mutation" conversion & checks, similar to what Zod can provide, but they do it "for free" using the GraphQL schema.

Then each mutation can use the already-typed input POJO to update the domain model (typically through upsert-capable methods like `em.createOrUpdatePartial`), and then defer all "business variant" validations to the domain model itself.

In our experience, this split of responsibilities is very robust, and leads to small, idiomatic mutation resolvers, much inline with the Rails "fat model, skinny controller" pattern.

:::

## Does Joist over-fetch data from the database?

When Joist loads an entity, it does loads of the columns; we've found in practice, for relational databases that load the whole row from disk anyway, this is not a significant performance concern.

That said, all of Joist's "backend reactivity" features, like reactive validation rules & reactive fields, use field-level precision in whether they fire or not. For example, an `Author` rule that watches `{ books: title }` will not trigger when one of it's book changes its `book.status` value.

Also, if you have endpoints that require summarizing a lot of children data, Joist's [reactive fields](https://joist-orm.io/docs/modeling/reactive-fields#async-reactive-fields) are an extremely robust way for keeping materialized columns up-to-date (i.e. tracking `Bill.totalPaid` and `Bill.totalUnpaid` columns that sum child `BillLineItem` rows, for fast, easy sorting & filtering.

Finally, Joist does not have a dogmatic "all queries *must* be done via the ORM" stance. It's perfectly fine to use Joist's "object graph navigation" and `em.find` for 90-95% of your queries (that would be very boilerplate SQL queries), and then use a lower-level query builder for the remaining 10%.

:::tip

We do have an idea for [lazy column](https://github.com/joist-orm/joist-orm/issues/178) support, if you have particularly large columns that should not be fetched by default. We should be able to use Joist's existing "conditionally loaded relations" trick to apply ot "conditionally loaded columns", but have not implemented this yet.

:::

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


## Does Joist require `temporal-polyfill`?

No. Joist has optional support for the upcoming JS temporal API; you can opt-in to it by setting `temporal: "true"` in `joist-config.json`.

If you'd like to keep using `Date`, there are no runtime dependencies on `temporal-polyfill`, but if you get errors like:

```
node_modules/joist-orm/build/utils.d.ts:1:56 - error TS2307: Cannot find module 'temporal-polyfill' or its corresponding type declarations.

1 import type { Intl, Temporal, toTemporalInstant } from "temporal-polyfill";
```

Then you either need to enable `skipLibCheck: "true"` in your `tsconfig.json` (recommended, as this disables unnecessary type-checking of your dependency's `*.ts` code), or install `temporal-polyfill` as a `devDependency`.


## Can I customize the formatter?

Joist uses [ts-poet](https://github.com/stephenh/ts-poet) and [dprint-node](https://github.com/devongovett/dprint-node) to generate & format code, as dprint is significantly faster than Prettier when generating large amounts of code.

The ts-poet output attempts to be "prettier-ish", but if you'd like to customize it, you can create a `.dprint.json` file as per the [dprint docs](https://dprint.dev/setup/#hidden-config-file).
