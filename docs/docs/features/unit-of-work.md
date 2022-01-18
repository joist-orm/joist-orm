---
title: Unit of Work
sidebar_position: 1
---

Joist's `EntityManager` acts as a [Unit of Work](https://www.martinfowler.com/eaaCatalog/unitOfWork.html), which caches the entities that are currently loaded/being mutated.

For example, if you issue multiple `.find` calls:

```typescript
const a = await em.find(Author, { id: "a:1" });
const b = await em.find(Author, { id: "a:1" });
// Prints true
console.log(a === b);
```

Joist will issue 2 queries, one per `find` call (because the where clauses could be different), but when reading the query results, Joist will recognize that the 2nd `find` returns an already-loaded `Author#a:1` instance, and use that same instance.

This pattern generally makes reasoning about "what have I changed so far?", "what is the latest version of the entity?" easier, because when handling a given `POST` / API update, you don't have to worry about various parts of your code having stale/different versions of the `Author`.

### Not a Shared/Distributed Cache

Note that this is not a shared/second-level cache, i.e. a cache that would be shared across multiple requests to your webapp/API to reduce calls to the relational database.

An `EntityManager` should only be used by a single request, and so the cache is request scoped.

Granted, shared/second-level caches can be a good idea, but it means you have to worry about cache invalidation and staleness strategies, so for now Joist avoids that complexity.
