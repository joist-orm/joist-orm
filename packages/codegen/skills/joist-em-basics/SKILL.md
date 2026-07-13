---
name: joist-em-basics
description: Create, load, find, mutate, and save entities with Joist's EntityManager. Use when writing data-access or business logic in a Joist project — anything using em.create, em.load, em.find, em.flush, or walking the entity graph.
---

<!-- Managed by joist-codegen. Do not edit by hand; re-run codegen to update. -->

# Joist EntityManager basics

The `EntityManager` (`em`) is how entities are loaded from and saved to the
database. It is a Unit of Work: each request gets its own `em`, which tracks
the entities it has loaded/created and writes them all out on `em.flush()`.

Entities are always loaded/created _through_ the `em`, never via static methods
on the class (Joist is not ActiveRecord). IDs are tagged strings like `"a:1"`.

## Creating

`em.create` is synchronous and returns the new entity immediately:

```ts
const author = em.create(Author, { firstName: "a1" });
// Nested/related entities can be created inline
const author = em.create(Author, { firstName: "a1", address: { street: "123 Main" } });
```

## Loading by id

Use tagged ids. These throw if the id does not exist (except the `IfExists`
variants):

```ts
const a = await em.load(Author, "a:1");
const as = await em.loadAll(Author, ["a:1", "a:2"]);
const as = await em.loadAllIfExists(Author, ["a:1", "a:2"]); // skips missing ids
```

To eagerly load relations, pass a populate hint as the 3rd argument; the
returned entity is typed as "loaded" so the relations can be read synchronously:

```ts
const a = await em.load(Author, "a:1", { books: "reviews" });
a.books.get.flatMap((b) => b.reviews.get);
```

## Walking the graph

~90% of reads are just navigating relations from an entity you already have.
These are guaranteed N+1-safe, even in a loop:

```ts
const author = await book.author.load();        // load a single relation
const reviews = await publisher.load((p) => p.books.reviews); // lens
const loaded = await author.populate({ books: "reviews" });   // populate + .get
```

## Finding (filtered queries)

`em.find` issues a `SELECT` with a "join literal" of nested relations plus
inline `WHERE` conditions. It is batch/N+1-safe.

```ts
const books = await em.find(Book, { author: { firstName: "a1" } });
const recent = await em.find(Book, { publishedAt: { gte: jan1 } });
const some = await em.find(Author, { firstName: { in: ["a1", "a2"] } });

const one = await em.findOne(Book, { title: "b1" });        // undefined if none
const one = await em.findOneOrFail(Book, { title: "b1" });  // throws if none
const one = await em.findOrCreate(Author, { email: "a@b.com" });
```

`undefined` values are pruned (the condition and any now-unused join are
dropped), so filters compose cleanly. To filter for null, pass `null`
explicitly, e.g. `{ firstName: null }`. For `OR` / nested boolean logic, use
`alias`/`aliases` with a `conditions` argument. For aggregates or group-bys,
drop down to Knex/Kysely — Joist's `find` only returns whole entities.

## Mutating

Assign fields directly, or use `.set` for a batch of changes:

```ts
author.firstName = "a2";
author.set({ firstName: "a2", lastName: "b2" });
```

For partial/RPC-style updates (treating `null` as "unset"), and for
incrementally updating children, see the `joist-upsert` skill.

## Deleting

```ts
const a = await em.load(Author, "a:1");
em.delete(a);
```

## Saving with `em.flush()`

`em.flush()` is where everything happens. It is async and:

1. Runs lifecycle hooks and validation rules,
2. Opens a transaction,
3. Issues batched `INSERT`/`UPDATE`/`DELETE` (one batch per entity type),
4. Commits.

You don't write individual SQL statements — let Joist batch them. `flush` can
be called multiple times as you do more work:

```ts
const author = em.create(Author, { firstName: "a1" });
await em.flush();
author.firstName = "a2";
await em.flush();
```
