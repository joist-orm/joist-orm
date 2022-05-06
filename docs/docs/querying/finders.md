---
title: Finders
sidebar_position: 1
---

As a general rule of thumb, take a look at the unit tests in the [Joist repo](https://github.com/stephenh/joist-ts/blob/main/packages/integration-tests/src/EntityManager.test.ts).


### `#load`
Load an instance of a given entity and id

```ts
const em = newEntityManager();
const a = await em.load(Author, "a:1");
```
### `#loadAll`
Load a instances of a given entity and ids

```ts
const em = newEntityManager();
const a = await em.loadAll(Author, ["a:1", "a:2]);
```

### `#loadAllIfExists`
Load a instances of a given entity and ids if exists in cache

```ts
const em = newEntityManager();
const a = await em.loadAllIfExists(Author, ["a:1", "a:2]);
```

### `#loadFromQuery`
Load a instance of a given entity and Knex QueryBuilder

```ts
const em = newEntityManager();
const authors = await em.loadFromQuery(Author, knex.select("*").from("authors"));
```


### `#find`
Query an entity and given where clause

```ts
const em = newEntityManager();
const authors = await em.find(Author, { email: 'foo@bar.com });
```

You can also query based on an association

```ts
const books = await em.find(Book, { author: { firstName: "a2" } });
```

### `#findOne`

```ts
const em = newEntityManager();
const author = await em.findOne(Author, { email: 'foo@bar.com });
```

### `#findOneOrFail`

```ts
const em = newEntityManager();
const author = await em.findOneOrFail(Author, { email: 'foo@bar.com });
```

### `#findOrCreate`

```ts
const em = newEntityManager();
const author = await em.findOrCreate(Author, { email: 'foo@bar.com });
```
