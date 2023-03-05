---
title: Making Queries
sidebar_position: 2
---

Joist has several ways to query entities, and which to use depends on how much control you need over the query.

## Philosophy

Joist's primary focus is not "_never_ having to hand-write SQL", so it is not a full-fledged query builder (like [Knex](https://knexjs.org/) or [Kelsey](https://github.com/koskimas/kysely)); instead it focuses on robust domain modeling, with validation rules, reactive derived values, etc.

So it's expected to, for sufficiently advanced/complicated queries, use a 3rd party query builder in addition to Joist, as covered in Approach 3.

## Approaches

Loading entities is a core feature of ORMs, and Joist supports several ways of doing this:

### 1. Object Graph Navigation

This is the bread & butter of ORMs, and involves just "walking the graph" from some entity you already have, to other entities that are related to it. Examples are:

```ts
// Calling .load() methods directly
const author = await book.author.load();
// Using a lens
const reviews = await publisher.load(p => p.books.reviews);
// Using populate + gets
const loaded = author.populate({ books: "reviews" });
loaded.books.get.flatMap(b => b.reviews.get);
```

This pattern will likely be **~90% of the queries** in your app, and are so pervasive/ergonomic that you likely won't even think of them as "making SQL queries".

* Pro: The most succinct way of loading entities.
* Pro: Joist guarantees these will not N+1, even if called in a loop.
* Pro: Works with non-database/domain model-only relations like Joist's `hasOneDerived`, `hasOneThrough`, `AsyncProperties`, etc.
* Con: Generally object graph navigation loads all entities within the sub-graph you're walking, i.e. you can't say "return only _out of stock_ books" (see `find` queries next)

### 2. Find Queries

`EntityManager.find` queries are a middle-ground that allow database-side filtering of rows, and so return only a subset of data (instead of the full subgraph like approach 1). Examples are:

```ts
const r1 = await em.find(Book, { author: { firstName: "b1" } });
const r2 = await em.find(Publisher, { authors: { firstName: "b1" } });
const r3 = await em.find(Author, { firstName: { like: "%a%" } });
const r4 = await em.find(Author, { publisher: p1 });
```

If object graph navigation is ~80-90% of your application's queries (because they are all implicit), `find` queries will likely be **~10% of your queries**.

See [Find Queries](./find-queries.md) for more documentation and examples.

* Pro: Still succinct because joins are implicit in the object literal
* Pro: Supports `WHERE`-based filtering/returning a subset of entities
* Con: Not as N+1 safe as approach 1; Joist currently _attempts_ to de-N+1 these queries, but it's not perfect. See [this issue](https://github.com/stephenh/joist-ts/issues/441) for details.
* Con: Cannot use domain model-level relations like Joist's `hasOneDerived`, `hasOneThrough`, `AsyncProperties`, etc.
* Con: Loads only full entities, not cross-table aggregates/group bys/etc.

### 3. Other Query Builders

For query that grow outside of what `em.find` can provide, then it's perfectly fine to use a 3rd-party query builder like [Knex](https://knexjs.org/) or [Kelsey](https://github.com/koskimas/kysely).

Knex would be a natural choice, because Joist uses Knex as an internal dependency, but Kelsey would be fine too.

In particular, any queries that need to:

* Do group bys/aggregates
* Select custom fragments of data (not just an entity)

Are best done via Knex or Kysely.

#### `buildQuery`

Joist does provide a `buildQuery` method that allows blending approaches 2 and 3: you can pass an `em.find` join literal to `buildQuery`, and get back a Knex `QueryBuilder` with all the joins added, to which you can do your own further joins or filters.

```ts
const query = buildQuery(knex, Book, {
  where: { author: [a1, a2] },
});
// Use knex methods to continue building the query0
query.whereNotNull("parent_bill_id");
// Then load the entities with the customizing query
const books = await em.loadFromQuery(Book, query);
```

:::tip

The first three options all focus on loading *entities*, which your code will then iterate over to perform business/view logic.

If you need to load bespoke, non-entity fragments of data across several tables (i.e. with aggregates/group bys/etc.), that is currently not a feature that Joist provides, but you're free to use a raw query builder, which is fourth option in the above list.

:::


