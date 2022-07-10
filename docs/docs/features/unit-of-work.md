---
title: Unit of Work
sidebar_position: 1
---

Joist's `EntityManager` acts as a [Unit of Work](https://www.martinfowler.com/eaaCatalog/unitOfWork.html), which caches the entities that are currently loaded/being mutated for each request.

This means that entities must be loaded from the `EntityManager`, i.e. via `em.load(Author, 1)`, and not from methods on `Author`, i.e. like an ActiveRecord `Author.find_by_id(1)`, but there are four main reasons for this:

1. Per-request entity caching
2. Data consistency
3. Automatically batching updates
4. Automatically using transactions 

## Per-Request Entity Caching

Typically with Joist, one `EntityManager` is created per request, e.g. handling `POST /book/new` creates one `EntityManager` to (say) load `em.load` the new book's `Author` (from the post data), create a new `Book` instance, and then save it to the database by calling `em.flush()`.

Once created for a request, the `EntityManager` instance will cache each row it loads from the database, and not reload it, even if multiple `SELECT * FROM books WHERE ...` queries bring back "the same row" twice.

```typescript
const a = await em.find(Author, { id: "a:1" });
const b = await em.find(Author, { id: "a:1" });
const c = await em.load(Author, "a:1"); // no SQL call issued
const d = await book1.author.load(); // no SQL call issued
// All print true
console.log(a === b);
console.log(a === c);
console.log(a === d);
```

This caching avoids reloading the `Author` from the database if other code loads it (for example validation rules within `Book` or `Author` calling `book.author.load()` will avoid a `SELECT` call if the author for that `id` is already in the `EntityManager`).

This caching also works for references & collections: for example if two places both call `a1.books.load()`, because Joist has ensured there is only "one `a1` instance" for this request, we don't need to issue two `SELECT * FROM books WHERE author_id = 1` queries.

Granted, in simple endpoints with no abstractions or complicated business logic, this caching is likely not a big deal; but once a codebase grows and access patterns get complicated (i.e. in GraphQL resolvers or validation rules/business logics), not constantly refetching the same `Author id=1` row in the database is a nice win.

## Data Consistency

An additional upshot of entity caching (which focuses on avoiding reloads) is data consistency.

Specifically, because there is "only one instance" of an entity/row, any changes we've made to the entity are defacto by seen the rest of the endpoint's code.

Without this Unit-of-Work/`EntityManager` pattern, it's possible for code to have "out of date" versions of an entity.

```typescript
function updateAuthor(a) {
  a.firstName = "bob";
}

function outputAuthor(id) {
  // if this was like Rails ActiveRecord, we get a different view of author
  const a = Author.find_by_id(id)
  // Now we've output inconsistent/stale data
  console.log(a.firstName)
}

const a = Author.find_by_id(id)
updateAuthor(a)
outputAuthor(id)
```

With Joist, the `Author.find_by_id(id)` would be `em.load(Author, id)`, which means we'd get back the existing `a` instance, and so can fundamentally no longer accidentally see old/stale data.

This pattern generally makes reasoning about "what have I changed so far?", "what is the latest version of the entity?" much easier, because when handling a given `POST` / API update, you don't have to worry about various parts of your code having stale/different versions of the `Author`.

## Automatically Batching Updates

With Joist, each endpoint will generally make a single call to `EntityManager.flush` to save its changes.

This `em.flush` call can seem like extra work, but it means Joist can:

* Apply all validation rules to changed entities at once/in-parallel
* Issue batch `INSERT`/`UPDATE` commands for all changed entities

## Automatically Using Transactions

With `EntityManager.flush`, all `INSERT`s, `UPDATE`s, and `DELETE`s for a single request are automatically applied with a single transaction.

Without this `flush` pattern, endpoints need to explicitly opt-in to transactions by manually demarking when the transaction starts/stops, i.e. in Rails ActiveRecord:

```ruby
Account.transaction do
  balance.save!
  account.save!
end
```

And because it is opt-in, most endpoints forget/do not bother doing this.

However, transactions are so fundamental to the pleasantness of Postgres and relational databases, that Joist's assertion is that **transactions should always be used by default**, and not just opt-in.

## Note: Not a Shared/Distributed Cache

Note that, because it's intended to be used per-request, the `EntityManager` is not a shared/second-level cache, i.e. a cache that would be shared across multiple requests to your webapp/API to reduce calls to the relational database.

An `EntityManager` should only be used by a single request, and so the cache is request scoped.

Granted, shared/second-level caches can be a good idea, but it means you have to worry about cache invalidation and staleness strategies, so for now Joist avoids that complexity.
