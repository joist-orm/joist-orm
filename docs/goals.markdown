# Goals

The high-level goal of Joist is to bring ActiveRecord-esque productivity to TypeScript/Node projects.

Obviously this is a lofty goal, and Joist has only just started down that road, but that is the standard Joist strives for.

## Schema-Driven Code Generation

Joist generates your domain objects/classes from your database schema, i.e. for a given `authors` table, Joist will generate an `Author` type with all of the respective fields (`first_name`, `last_name`) and collections (`author.books` loads/joins the `books` rows for that author id).

This means you're domain model is extremely clean, i.e. `Author.ts` starts out:

```typescript
export class Author extends AuthorCodegen {}
```

Which is "Rails-ish" clean & minimal.

The code generation is run continually, i.e. after every migration/schema change instead of a 1-time scaffolding, so you never have to maintain a tedious/error-prone mapping from your schema to your object model. Similar to "evergreen" browsers, this is "evergreen" code generation.

To keep your `Author` type as clean as possible, and not overwrite any custom business logic you've added, the boilerplate of getters/setters/collections are isolated into "codegen" base classes, i.e. `AuthorCodegen.ts`, that are always overwritten.

This approach (continual, verbatim mapping of the database schema to your object model) assumes you have a modern/pleasant schema to work with, i.e. you don't have to map esoteric 1980s-style database column names to modern getter/setters, and you don't need your object model to look dramatically different from your database tables. These are ActiveRecord-esque assumptions. If you do need either of these things, Joist will not work for you.

The upshot of this approach is that it provides a Rails-style development experience where, after creating an `authors` table in the database, the programmer has a very clean/nearly empty `Author.ts` file and has to do basically no boilerplate other work. There are no annotations to write or keep up to date.

If you do need some customizations, Joist's opinion/approach is that those are best handled by declarative rules. I.e. instead of making a decision that "our `timestamptz` columns need to be mapped like `X` in our objects", and then having to re-type out `@Column(whateverType = Date)` (say ~1-3 lines of annotations) for all 10/20/100+ date fields in your schema, you should make that decision once, and then apply it via a config file that says "map all of our dates this `X` way".

(Joist's codegen is still WIP, so we don't have these customization hooks defined yet, but they will exist soon.)

## Guaranteed N+1 Safe

Accidentally triggering N+1s is a very common pitfall of ORMs, because the ORM's "pretending to be in memory objects" mental model can be a leaky abstraction: you can access 1,000 actually-in-memory objects very quickly in a `for` loop, but you can't access 1,000 _not_-actually-in-memory objects in a `for` loop.

Somewhat ironically/coincidentally (given the years of callback hell that Node/JS initially had to suffer through), Node/JS's single-threaded model is a boon to N+1 prevention because it forces all blocking I/O calls to be "identifiable", i.e. they _always_ require a callback or a promise.

The innovative [DataLoader](https://github.com/graphql/dataloader) library provides a convention for "recognizing" multiple blocking calls that happen within a single tick of the event loop, which is where N+1s usually sprout from, and combining them into batch calls.

Joist is built on DataLoader from the ground up, and nearly all SQL operations (i.e. `EntityManager.load`, `EntityManager.populate`, `EntityManager.find`, loading entity references/collections like `author.books.load()`, etc.) are all automatically batched, so N+1s should essentially never happen.

## All Relations are Async/Await (w/Type-safe Escape Hatch)

Joist takes the strong opinion that any operation that _might_ be lazy loaded (like accessing an `author.books` collection that may or may not already be loaded in memory) _must_ be marked as `async/await`.

Other ORMs in the JS/TS space often fudge this, i.e. they might model an `Author` with a `books: Book[]` property where you can get the pleasantness of accessing `author.books` without `await`s/`Promise.all`/etc. code--as long as whoever loaded this `Author` instance ensured that `books` was already fetched/initialized.

This seems great in the short-term, but Joist asserts its dangerous in the long-term, because code written to rely on the "`author.books` is a `Book[]`" assumption is now coupled to `author.books` being pre-fetched and _always_ being present, regardless of the caller.

This sort of implementation detail is easy to enforce when the synchronous-assuming (i.e. `for (book in author.books)`) is 5 lines below the "load author with a `books` preload hint" in the same file. However it's very hard to enforce in a large codebase, when business logic and validation rules can be triggered from multiple operation endpoints. And, so when `author.books` is _not_ loaded, it will at best cause a runtime error ("hey you tried to access this unloaded collection") and at worst cause a very obscure bug (by returning a falsely empty collection or unset reference).

Essentially this approach of having non-async collections creates a contract ("`author.books` must somehow be loaded") that is not present in the type system, so now the programmer/maintainer must remember and self-enforce it.

So Joist does not do that, all references/collections are "always `async`".

..._that said_, writing business logic across a few collections that you "know" are in memory but have to use promises anyway is extremely tedious.

So, Joist has a way to explicitly mark subsets of fields, on subsets of object instances, as preloaded and so safe to synchronously access.

This looks like:

```typescript
// Note the `{ author: "publisher" } preload hint
const book = await em.populate(originalBook, { author: "publisher" });
// The `populate` return type is a "special" `Book` that has `author` and `publisher` marked as "get-safe"
expect(book.author.get.firstName).toEqual("a1");
expect(book.author.get.publisher.get.name).toEqual("p1");
```

Where `originalBook`'s references (`book.author`) could _not_ call `.get` (only `.load` which returns a `Promise`), however, the return value of `em.populate` uses mapped types to transform only the fields listed in the hint (`author` and the nested `author.publisher`) to be safe for synchronous access, so the calling code can now call `.get` and avoid the fuss of promises (only for this section of `populate`-blessed code).

Most of Joist's `EntityManager` take a `populate` parameter to help you return data both a) already loaded from the database, and b) _marked in the type system as loaded_ to achieve the pleasantness of synchronous access without the risks of mis-modeling references as always/naively loaded.

As one more helpful feature, you can also navigate across multiple levels of the object graph with a single async call using `Entity.load`, i.e.:

```typescript
// await way
const allAuthorReviews = (await Promise.all(await author.books.load()).map(b => b.comments.load())).flat();
// lens navigation way
const allAuthorReviews = await author.load(a => a.books.comments);
```

Here `a.books.comments` acts similar to a [lens](https://medium.com/@dtipson/functional-lenses-d1aba9e52254), and defines a (type safe) path that `load` then recursively/asynchronously navigates for you, with the convenience of only having a single `await` call in your code.

## Best-in-Class Performance

Joist aims for best-in-class performance by performing all `INSERT`, `UPDATE`, `DELETE`, and even `SELECT` operations in bulk.

If you save 100 new authors, that is 1 SQL `INSERT` statement. If you update 500 books, that is 1 SQL `UPDATE` statement.

If you have a Unit of Work that has 100 new authors and 500 new books, there will be 1 SQL `INSERT` statement for the authors, and 1 SQL `INSERT` statement for the books.

This is dramatically different than other ORMs that generally issue 1 SQL statement per entity _instance_ instead of 1 SQL statement per entity _table_ (technically Joist is 1 SQL statement per entity type and operation, i.e. inserting authors and updating authors and deleting authors are separte statements).

Note that this capability, especially bulk updates, currently requires a Postgres-specific `UPDATE` syntax, but that is part of the pay-off for Joist's "unapologetically Postgres-only (for now)" approach.

## Fast Unit Tests

A common fault of ORMs is the quickiness of their unit tests (not the ORM project's unit tests, like Joist's internal test suite, but the unit tests that users of Joist write for their own business logic using their own entities).

It's common for test execution times to be "okay" with a small schema of ~5-10 tables, but then to steadily degrade over time. For the "original Joist" (written in Java), this actually was the founding impetus because Hibernate, the Java ORM dejour of the time, a schema with 500 tables would take 30 seconds just to create the initial `Session` object, let alone run any actual unit test behavior.

Joist (both "original/Java Joist" and now joist-ts) take the hard-line approach that test time should be _constant_ with schema size. Tests on a 500-table schema should run just as quickly as a 20-table schema.

Obviously this will not be _exactly_ true in practice, but that is the guiding principle.

An example of this is how Joist exercises database resets: in general, between tests you need to `TRUNCATE` every entity table and reset it's primary key counter. Instead of issuing 1 `TRUNCATE` statement per table, Joist creates a `flush_database()` stored procedure at the very end of the "apply change migrations" build step, which internally has the "`N` number of tables" `TRUNCATE` statements. So now unit tests' `beforeEach` can issue a single wire call to get to a clean state before running.

## Unit of Work

(navigate between entities as a consistent graph)

## Small & simple codebase

Adopting (or writing from scratch) a new piece of infrastructure code like an ORM has pros/cons, one of the large cons being lack of a large base of contributors or committers to help maintain the project.

To help mitigate this risk, Joist strives to be a small codebase, such that users of Joist should ideally be able to debug/maintain/support Joist on their own if necessary.

This is achieved by:

1. Cutting scope, i.e. focusing only on Postgres
2. Having only one way of doing things, i.e. Joist does not provide multiple/optional Repository-style APIs vs EntityManger-style APIs
   - Relatedly, currently there are very few config options, although these will grow slightly over time (i.e. to support user-defined types)
3. Leveraging DataLoader, i.e. a lot of Joist's ROI in terms of providing generally fancy/high-performance auto-batching and pre-loading features with a relatively simple implementation comes from building on top of DataLoader

(Granted, this may change at some point, if Joist becomes popular enough to, say, tackle supporting multiple relational databases, or whatever misc feature, with the help/long-term support from multiple contributors.)

