---
title: Finders
sidebar_position: 1
---

Joist's `EntityManager` has several methods for easily finding/loading entities.

:::info

As a disclaimer, Joist does not yet have a full-blown query builder API that can support arbitrary SQL. It's primary focus is providing a robust framework to your implement core domain model (validation rules, hooks, and core one-to-many, many-to-one, etc. relations), and defers complex querying to a dedicated query library.

That said, `EntityManager` has several methods (`find`, `findAll`, etc., documented below) that support common cases of finding entities by simple conditions and many-to-one joins, but for anything more complicated (one-to-many joins, many-to-many joins, or aggregates), for now the best practice is to use a dedicated query builder like Knex.

Currently, we suggest using Knex, because it's what Joist also uses internally.

:::

:::tip

Since these docs are still work-in-progress, you can also scan the unit tests in the [Joist repo](https://github.com/stephenh/joist-ts/blob/main/packages/integration-tests/src/EntityManager.test.ts) for examples of queries.

:::

### `#load`

Load an instance of a given entity and id.

This will return the existing `Author:1` instance if it's already been loaded from the database.

```ts
const em = newEntityManager();
const a = await em.load(Author, "a:1");
```

### `#loadAll`

Load multiple instances of a given entity and ids, and fails if any id does not exist.

```ts
const em = newEntityManager();
const a = await em.loadAll(Author, ["a:1", "a:2"]);
```

### `#loadAllIfExists`

Load multiple instances of a given entity and ids, and ignores ids that don't exist.

```ts
const em = newEntityManager();
const a = await em.loadAllIfExists(Author, ["a:1", "a:2"]);
```

### `#loadFromQuery`

Load multiple instances of a given entity from a Knex QueryBuilder.

```ts
const em = newEntityManager();
const authors = await em.loadFromQuery(Author, knex.select("*").from("authors"));
```

### `#find`
Query an entity and given where clause

```ts
const em = newEntityManager();
const authors = await em.find(Author, { email: "foo@bar.com" });
```

You can also query based on an association

```ts
const books = await em.find(Book, { author: { firstName: "a2" } });
```

### `#findOne`

```ts
const em = newEntityManager();
const author = await em.findOne(Author, { email: 'foo@bar.com" });
```

### `#findOneOrFail`

```ts
const em = newEntityManager();
const author = await em.findOneOrFail(Author, { email: "foo@bar.com" });
```

### `#findOrCreate`

```ts
const em = newEntityManager();
const author = await em.findOrCreate(Author, { email: "foo@bar.com" });
```
