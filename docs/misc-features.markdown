
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

Will have properties like:

```typescript
class AuthorCodegen {
  get firstName(): string {
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

And `firstName` is enforced to be non-null on construction:

```typescript
new Author(em, { firstName: "is required" });
```

I.e. you cannot `new Author()` and then forget to set `firstName`.

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

Joist generally prefers to use `undefined` where ever possible, i.e. columns that are `NULL` in the database are returned as `undefined`.

That said, for converting input, each entity's `Opts` type accepts either `undefined` or `null`, which is useful when implementing APIs where `undefined` means "do not change" and `null` means "unset", i.e.:

```typescript
const author = em.load(Author, "1");
const firstName: string | null | undefined = ...;
if (firstName !== undefined) {
  author.set({ firstName });
  // author.firstName is now undefined
}
```

You can also do this by using the `ignoreUndefined` option of `set`:

```typescript
const author = em.load(Author, "1");
const firstName: string | null | undefined = ...;
author.set({ firstName }, { ignoreUndefined: true });
```

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
