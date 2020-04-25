
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
