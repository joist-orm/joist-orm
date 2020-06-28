# Misc Features

See [goals](./goals.markdown) for higher-level features like N+1 safety/etc.

### Appropriately Null/Not Null Properties

Null and not null columns are correctly modeled and enforced, i.e. a table like:

```
                                        Table "public.authors"
    Column    |           Type           | Collation | Nullable |               Default
--------------+--------------------------+-----------+----------+-------------------------------------
 id           | integer                  |           | not null | nextval('authors_id_seq'::regclass)
 first_name   | character varying(255)   |           | not null |
 last_name    | character varying(255)   |           |          |
```

Means the domain object `Author` will appropriately null/non-null properties:

```typescript
class AuthorCodegen {
  get firstName(): string
    return this.__orm.data["firstName"];
  }

  set firstName(firstName: string) {
    setField(this, "firstName", firstName);
  }

  get lastName(): string | undefined {
    return this.__orm.data["lastName"];
  }

  set lastName(lastName: string | undefined) {
    setField(this, "lastName", lastName);
  }
}
```

And the non-null `firstName` is also non-null on construction:

```typescript
new Author(em, { firstName: "is required" });
```

I.e. you cannot call `new Author()` and then forget to set `firstName`.

The appropriate null/non-null-ness is also enforced in the `Author.set` method:

```typescript
author.set({ firstName: "cannotBeNull" });
```

Although `set` does accept a `Partial`, so if you don't want to change `firstName`, you don't have to pass it to `set`:

```typescript
author.set({ lastName: "..." });
```

### `EntityManager.create` marks collections as loaded

The `EntityManager.create` method types the newly-created entity's collections as already loaded.

I.e. this code is valid:

```typescript
const author = em.create(Author, { firstName: "asdf " });
expect(author.books.get.length).toEqual(0);
```

Even though normally `books.get` is not allowed/must be a lazy `.load` call, in this instance `create` knows that the `Author` is brand new, so by definition can't have any existing `Book` rows in the database that might need to be looked up, so can turn the `books` collection into a loaded collection, i.e. with the `get` method available.

### Derived Columns

If you mark a field as derived in `joist-codegen.json`, it will not have a setter, only an `abstract` getter than you must implement, and that Joist will call to use as the column in the database.

```json
{
  "derivedFields": ["Author.initials"]
}
```

Note that this currently only works for primitive columns, and the getter must be synchronous.

### Protected Columns

If you mark a field as protected in `joist-codegen.json`, it will have a protected setter that only your entity's business logic can call. The getter will still be public.

```json
{
  "protectedFields": ["Author.initials"]
}
```

### Automatic Null Conversion

Joist generally prefers to use `undefined` where ever possible, i.e. columns that are `null` in the database are returned as `undefined`.

```typescript
// Given `authors` row id=1 has last_name=null
const author = em.load(Author, "1");
// Then the domain object treats it as `undefined`
expect(author.lastName).toBeUndefined();
```

And methods that allow setting `lastName` will accept `null` and convert it to `undefined`:

```typescript
const newLastName: string | undefined | null = null;
author.set({ lastName: newLastName });
// `lastName` is converted to `undefined`
expect(author.lastName).toBeUndefined();
```

And when saved to the database, `undefined`s are converted back into `null`s.

(Note that the `author.lastName` setter does not accept `null` because in TypeScript the types of getters and setters must be exactly the same, and so Joist can't "allow setting `null`" while "enforcing `null` will not be returned". Helper methods like `Entity.set` do not have this restriction, and so can accept `null`s and do the `null` to `undefined` conversion for callers.)

### Support for Partial Update Style APIs

A common pattern for APIs is to treat `null` and `undefined` differently, i.e. `{ lastName: null }` specifically means "unset the `lastName` property" while `firstName` being not present (i.e. `undefined`) means "do not change `firstName`".

These APIs can be difficult to map to Joist's opinionated approach of "required properties must never be passed as `null` or `undefined`", so Joist has two helper methods for building partial-update-style APIs: `EntityMangaer.createPartial` and `Entity.setPartial`.

I.e. for a non-null `firstName` and nullable `lastName` fields that both come in (from an RPC call or GraphQL mutation) as the "partial update" type of `string | null | undefined`, `Author.setPartial` allows directly passing both fields:

```typescript
const author = em.load(Author, "1");
const firstName: string | null | undefined = incomingFirstName;
const lastName: string | null | undefined = incomingLastName;
// Calling set is a compile error because set's firstName must be a string
// @ts-expect-error
author.set({ firstName, lastName });
// Call setPartial will compile
author.setPartial({ firstName, lastName });
}
```

And the runtime behavior is:

- `firstName: "foo"` will update `firstName`
- `firstName: undefined` will noop
- `firstName: null` will be a runtime error
- `lastName: "bar"` will update `lastName`
- `lastName: undefined` will noop
- `lastName: null` will unset `lastName` (i.e. set it as `undefined`)

The `EntityManager.createPartial` constructor method has similar semantics.

Arguably the ideal partial-update type for `Author` in this scenario would be:

```typescript
interface AuthorInput {
  firstName: string | undefined;
  lastName: string | null | undefined;
}
```

Which would alleviate the need for `setPartial`, but it's sometimes hard to express this nuance in RPC/API type systems that generate the `AuthorInput` TypeScript type, i.e. in particular GraphQL's type system cannot express the difference between `firstName` and `lastName` with a partial-update style input type like:

```graphql
type AuthorInput {
  firstName: String
  lastName: String
}
```

There is also a `EntityManager.createOrUpdatePartial` method that will conditionally create-or-update an entity, while accepting partial-update/"`null`-means-unset" opts (and, per above, still apply runtime validation that no required fields are unset):

```typescript
// Partial-update-typed variables from incoming API call
const id: number | undefined | null = 0;
const firstName: string | undefined | null = "...fromApi...";
const mentorId: number | undefined | null = 1;
const newBooks: Array<{ title: string | undefined | null }> = [{ title: "...fromApi..." }];
await em.createOrUpdatePartial(Author, {
  id,
  firstName,
  mentor: mentorId,
  books: newBooks,
});
```

Note how, unlike the `create` and `set` methods that are synchronous and so only accept `Entity` values for opts like `mentor` and `books`, `createOrUpdatePartial` accepts partials of references/collections and will recursively `createOrUpdatePartial` nested partials into the appropriate new-or-found entities based on the presence of `id` fields.

This effectively mimicks Objection.js's [`upsertGraph`](https://vincit.github.io/objection.js/guide/query-examples.html#graph-upserts), with the same disclaimer that you should only pass trusted/white-listed keys to `createOrUpdatePartial` (i.e. keys from a validated/subset GraphQL input type) and not just whatever form fields the user has happened to HTTP POST to your endpoint.

### Fast database resets

To reset the database between each unit test, Joist generates a stored procedure that will delete all rows/reset the sequence ids:

```typescript
await knex.select(knex.raw("flush_database()"));
```

This is generated at the end of the `joist-migation-utils` set only if `ADD_FLUSH_DATABASE` environment variable is set, i.e. this function should never exist in your production database. It is only for local testing.

(Some ORMs invoke tests in a transaction, and then rollback the transaction before the next test, but this a) makes debugging failed tests extremely difficult b/c the data you want to investigate via `psql` has disappeared/been rolled back, and b) means your tests cannot test any behavior that uses transactions.)

### `EntityManager.refresh()`

The `EntityManager.refresh` method reloads all currently-loaded entities from the database, as well as any of their loaded relations (i.e. if you have `author1.books` loaded and a new `books` row is added with `author_id=1`, after `refresh()`, the `author1.books` collection will have the newly-added book in it.

This is primarily useful for unit tests, where you want to do behavior like:

```typescript
// Given an author
const a = em.create(Author, { ... });
// When we perform the business logic
// (...assumme this is a test helper method that invokes the logic and
// then calls EntityManager.refresh before returning)
await runBusinessLogic();
// Then we have a new book
expect(a.books.get.length).toEqual(1);
```

But `runBusinessLogic` is run it its own transaction/`EntityManager` instance (which is generally a good idea to avoid accidentally relying on the test's `EntityManager` state), but after `runBusinessLogic` completes, you want to see the latest & great version of `a`.

Without `EntityManager.refresh`, tests must jump through various hoops like managing `a1`/`a1Reloaded` variables.

### Unit of Work-Level Query Cache

If you issue the same `EntityManager.find(Entity, { ...where... })` call multiple times within a single unit of work, the database query will only be issued once, and then the cached value used for subsequent calls.

If you do an `EntityManager.flush`, that will reset the find cache b/c the commit may have caused the cached query results to have changed.

Note that this is not a shared/second-level cache, i.e. shared across multiple requests to your webapp/API, which can be a good idea but means you have to worry about cache invalidation and staleness strategies.

This cache is solely for queries issued with the current unit of work, and it is thrown away/re-created for each new Unit of Work, so there should not be any issues with stale data or need to invalidate the cache (beyond what Joist already does by invalidating it on each `EntityManager.flush()` call).

(Pedantically, currently Joist's Unit of Work does not currently open a transaction until `flush` is started, so without that transactional isolation, Joist's UoW find cache may actually be "hiding" changed results (between `find` 1 and `find` 2) than if it were to actually re-issue the query each time. That said, a) ideally/at some point Joist's UoW will use a transaction throughout, such that this isolation behavior of not noticing new changes is actually a desired feature (i.e. avoiding non-repeatable reads), and b) UoWs are assumed to be extremely short-lived, i.e. per request, so you should generally not be trying to observe changed results between `find` calls anyway.)

### Validation Rules

Entities can have validation rules added that will be run during `EntityManager.flush()`:

```typescript
class Author extends AuthorCodegen {
  constructor(em: EntityManager, opts: AuthorOpts) {
    super(em, opts);
  })
}

authorConfig.addRule((author) => {
  if (author.firstName && author.firstName === author.lastName) {
    return "firstName and lastName must be different";
  }
});

// Rules can be async
authorConfig.addRule(async (author) => {
  const books = await authorthis.books.load();
  // ...
});
```

If any validation rule returns a non-`undefined` string, `flush()` will throw a `ValidationErrors` error.

### Tracking Changed Properties

Entities track which of their properties have changed:

```typescript
const a1 = em.load(Author, "1");
expect(a1.changes.firstName.hasChanged).toBeFalsey();
a1.firstName = "a2";
expect(a1.changes.firstName.hasChanged).toBeTruthy();
expect(a1.changes.firstName.originalValue).toEqual("a1");
```

### Lifecycle Hooks

There are two lifecycle hooks: `beforeFlush` and `afterCommit`:

```typescript
class Author extends AuthorCodegen {
  constructor(em: EntityManager, opts: AuthorOpts) {
    super(em, opts);
  }
}

authorConfig.beforeFlush(async () => ...);

authorConfig.afterCommit(async () => ...);
```

### GraphQL-Compatible Filters

Joist's `find` supports the standard "filter as object literal" pattern, i.e.

```typescript
const authors = em.find(Author, { age: { gte: 20 } });
```

And the generated `AuthorFilter` type that drives this query is fairly picky, i.e. `age: null` is not a valid query if the age column is not null.

This works great for TypeScript code, but when doing interop with GraphQL (i.e. via types generated by graphql-code-generator), Joist's normal `AuthorFilter` typing is "too good", i.e. while GraphQL's type system is great, it is more coarse than TypeScript's, so you end up with things like `age: number | null | undefined` on the GQL filter type.

To handle this, Joist generates separate GraphQL-specific filter types, i.e. `AuthorGraphQLFilter`, that can fairly seamlessly integrate with GraphQL queries with a dedicated `findGql` query methods.

I.e. given some generated GraphQL types like:

```typescript
/** Example AuthorFilter generated by graphql-code-generator. */
interface GraphQLAuthorFilter {
  age?: GraphQLIntFilter | null | undefined;
}

/** Example IntFilter generated by graphql-code-generator. */
interface GraphQLIntFilter {
  eq?: number | null | undefined;
  in?: number[] | null | undefined;
  lte?: number | null | undefined;
  lt?: number | null | undefined;
  gte?: number | null | undefined;
  gt?: number | null | undefined;
  ne?: number | null | undefined;
}
```

Joist's `EntityManager.findGql` will accept the filter type as-is / "directly off the wire" without any cumbersome mapping:

```typescript
// I.e. from the GraphQL args.filter parameter
const gqlFilter: GraphQLAuthorFilter = {
  age: { eq: 2 },
};
const authors = await em.findGql(Author, gqlFilter);
```

### hasOneThrough

You can define common paths through your entity graph with `hasOneThrough`:

```typescript
export class BookReview extends BookReviewCodegen {
  readonly author: Reference<BookReview, Author, never> = this.hasOneThrough((review) => review.book.author);
}
```

The `hasOneThrough` DSL is built on Joist's `CustomReferences`, so will also work with `populate`, i.e.:

```typescript
const review = await em.load(BookReview, "1", { author: "publisher" });
expect(review.author.get.publisher.get.name).toEqual("p1");
```

### Cascading Deletions

You can have a parent cascade delete its children by doing:

```typescript
bookConfig.cascadeDelete("reviews");
```

You can also use database foreign key cascades, but using the domain-level `cascadeDelete` will mean that any application-layer hooks/validation logic/etc. that might need to run due to the review being deleted will be run during `em.flush()`.

Currently, Joist does not automatically cascade delete children; i.e. it could/may eventually use the database metadata of a foreign key with `ON CACADE DELETE` to know it should generate a `cascadeDelete(...)` in the base codegen file, but for now you have to manually specify any cascade deletions that you want.
