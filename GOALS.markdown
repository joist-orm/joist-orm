
## Schema-Driven Code Generation

Joist generates your domain objects/classes from your database schema.

It does this continually, i.e. after every migration/schema change, so that you never have to maintain a tedious/error-prone mapping from your schema to your object model. It does this by isolating the "getter/setter/collection" boilerplate into "codegen" files, i.e. `AuthorCodegen.ts`, that are always overwritten, from the custom business logic that users write in the "real" `Author.ts` domain object files.

This approach (continual, verbatim mapping of the database schema to your object model) assumes you have a modern/pleasant schema to work with, i.e. you don't have to map esoteric 1980s-style database column names to modern getter/setters, and you don't need your object model to look dramatically different from your database tables. If you do need either of these things, Joist will not work for you.

The upshot of this approach is that it provides a Rails-style development experience where, after creating an `authors` table in the database, the programmer has a very clean/nearly empty `Author.ts` file and has to do basically no other work. There are no annotations to write or keep up to date.

If you do need some customizations, Joist's opinion is that those are best handled by declarative rules. I.e. instead of making a decision that "our `date` columns need to be mapped like `X` in our objects", and then having to re-type out `X` (say ~1-3 lines of annotations) for all 10/20/N+ date fields in your schema, you should make that decision once, and then apply it via a config file that says "map all of our dates this `X`".

(Joist's codegen is still WIP, so we don't have these customization hooks defined yet, but they will exist soon.)

## Gauranteed N+1 Safe

Accidentally triggering N+1s is a very common pitfall of ORMs, because the ORM's "pretending to be in memory objects" mental model can be a leaky abstraction: you can access 1,000 actually-in-memory objects very quickly in a `for` loop, but you can't access 1,000 _not_-actually-in-memory objects in a `for` loop.

Somewhat ironically/coincidentally (given the years of callback hell that Node/JS initially had to suffer through), Node/JS's single-threaded model is a boon to N+1 prevention because it forces all blocking I/O calls to be "identifiable", i.e. they _always_ require a callback or a promise.

The innovative [DataLoader](https://github.com/graphql/dataloader) library provides a convention for "recognizing" multiple blocking calls (that happen within a single tick of the event loop) and combining them into batch calls.

Joist is built on DataLoader from the ground up, and most SQL operations (i.e. `EntityManager.load`, `EntityManager.populate`, loading entity references/collections like `author.books.load()`, etc.) are all automatically batched (technically `EntityManager.find` is not batched, because the bespoke queries cannot be automatically aggregated/de-aggregated), so N+1s should essentially never happen.

## Async/Await All Relations (w/Escape Hatch)

Per this prior point, Joist takes the strong opinion that all "this _might_ be lazy loaded" operations _must_ be marked as `async/await`.

Other ORMs in the JS/TS space sometimes fudge this, i.e. they might model an `Author` with a `books: Book[]` property where you can get the pleasant-ness of accessing `author.books` without `await`s/`Promise.all`/etc. code.

This seems great in the short-term, but Joist asserts its dangerous in the long-term, because code written to use "`author.books` is a `Book[]` is now coupled to `author.books` being pre-fetched and _always_ being present, regardless of the caller.
 
This sort of implementation detail is easy to enforce when the `for (book in author.books)` is 5 lines below "load author with a `books` preload hint", however it's very hard to enforce in a large codebase, when business logic and validation rules can be triggered from multiple operation endpoints. And, so when `author.books` is not loaded, it will at best cause a runtime error ("hey you tried to access this unloaded collection") and at worst cause a very obscure bug (by returning an empty collection/unset reference and not telling the caller "this wasn't loaded").

Essentially this approach of having non-async collections creates a contract ("`author.books` must somehow be loaded") that is not present in the type system that now the programmer/maintainer must remember and self-enforce.

So Joist does not do that, all references/collections are "always `async`".

..._that said_, writing business logic across a few collections that you "know" are in memory but have to use promises anyway is extremely tedious.

So, Joist has a way to explicitly mark subsets of fields, on subsets of object instances, as preloaded and so safe to synchronously access.

This looks like:

```typescript
const book = await em.populate(originalBook, { author: "publisher" } as const);
expect(book.author.get.firstName).toEqual("a1");
expect(book.author.get.publisher.get.name).toEqual("p1");
```

Where `originalBook`'s references (`book.author`) could _not_ call `.get` (only `.load` which returns a `Promise`), however, the return value of `em.populate` uses mapped types to transform only the fields listed in the hint (`author` and the nested `author.publisher`) to be safe for synchronous access, so the calling code can now call `.get` and avoid the fuss of promises (only for this section of `populate`-blessed code).

## Best-in-Class Performance
 
Joist aims for best-in-class performance by performing all operations in bulk.

If you insert 100 authors, that is 1 SQL statement. If you update 500 books, that is 1 SQL statement.

If you have a Unit of Work that has 100 authors and 500 books, there will be 1 SQL statement for the authors, and 1 SQL statement for the books.

This is dramatically different than other ORMs that generally issue 1 SQL statement per entity _instance_ instead of 1 SQL statement per entity _type_ (technically Joist is 1 SQL statement per entity type and operation, i.e. inserting authors and updating authors and deleting authors are separte statements).

Note that this capability, especially bulk updates, currently requires a Postgres-specific `UPDATE` syntax, but that is part of the pay-off for Joist's "unapologetically Postgres-only" approach.

## Fast Unit Tests

A common fault of ORMs is the quickiness of their unit tests (not the ORM project's unit tests, like Joist's internal test suite, but the unit tests that users of Joist write for their own business logic using their own entities).

It's common for test execution times to be "okay" with a small schema of ~5-10 tables, but then to steadily degrade over time. For the "original Joist" (written in Java), this actually was _the_ founding impetus because Hibernate, the Java ORM dejour of the time, a schema with 500 tables would take 30 seconds just to create the initial session object, let alone run any actual unit test behavior.

Joist (both "original/Java Joist" and now joist-ts) take the hard-line approach that test time should be _constant_ with schema size. Tests on a 500-table schema should run just as quickly as a 20-table schema.

Obviously this will not be _exactly_ true in practice, but that is the guiding principle.

An example of this is how Joist exercises database resets: in general, between tests you need to `TRUNCATE` every entity table and reset it's primary key counter. Instead of issuing 1 `TRUNCATE` statement per table, Joist creates a `flush_database()` stored procedure at the very end of the "apply change migrations" build step, which internally has the "`N` number of tables" `TRUNCATE` statements. So now unit tests' `beforeEach` can issue a single wire call to get to a clean state before running.

## Unit of Work

(navigate between entities as a consistent graph)

## Small & simple codebase

(maintainable by a single engineer if needed)
