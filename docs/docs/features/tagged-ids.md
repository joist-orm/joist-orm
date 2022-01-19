---
title: Tagged Ids
sidebar_position: 3
---

Joist automatically "tags" entity ids, which means prefixing them with a per-entity identifier.

For example, this code prints `"a:1"` instead of `1`:

```typescript
const a = await em.findOneOrFail(Author, { firstName: "first" });
// Outputs `a:1`
console.log(a.id);
```

Even though in the database the `authors.id` column is still an auto-increment integer and, for this Author, the database value really is `1`.

### Rationale

There are a few reasons for this feature:

- Avoiding "Wrong Id" Bugs
- Easier debugging
- Convenient for GraphQL integration

#### Avoiding "Wrong Id" Bugs

Knowing the entity type for each id eliminates a class of bugs where ids are passed incorrectly across entity types.

For example, a bug like:

```typescript
const id = someAuthor.id;
// ...lots of lines of code go by...
// Oops, I used an "author id" to find a book...
const book = em.load(Book, id);
```

Frustratingly, often these "wrong id" bugs will actually work during local testing, because every table only has a few rows of `id 1`, `id 2`, so it's easy to have `id 1` taken from the `authors` table and accidentally work when looking it up in the `books` table.

Note that, within backend code, Joist's entities also use strongly-typed ids (i.e. `Author.id` returns an `AuthorId`) to help prevent this with static type checking, but typed ids only prevent "wrong id" bugs that happen internally in the backend code (so, technically within our above example, we could get a compile error that `id` needs to be a `BookId`, which is great).

So tagged ids extends "typed ids"-style protection to API calls, i.e. if a client calls the API for "author `a:1`" and then makes a subsequent API call that accidentally uses `a:1` as a book id, Joist will throw a runtime error that it expected a `b:...` prefixed id.

#### Easier Debugging

It makes debugging easier because seeing ids like `a:1` in the logs, you immediately know which entity that was for, without having to also prefix your logging statements with `authorId=${...}`, or when the `id` is in JSON payloads.

#### Convenient for GraphQL Integration

In GraphQL, there is a dedicated `ID` type for id fields. It is not required to use, i.e. you can have `id: Integer!` in a GraphQL schema, but the `ID` type is encouraged/more idiomatic because it is opaque, meaning it hides the `id`'s implementation details from the client.

I.e., to an external client, it shouldn't really matter if your internal id is "a number" or "a uuid" or "a string", and so having this `ID` type is how GraphQL represents that opaqueness (pragmatically, the GraphQL `ID` type ends up being mapped to string in client languages like TypeScript or Go, since a string value can effectively encode/represent other types like a number, or a uuid, albeit with some overhead).

So while Joist is technically GraphQL-agnostic, if you are implementing a GraphQL system (which is what drove Joist's original development), the GraphQL layer already wants "the id is a string", so it is convenient if the `Author` entity's `id` is already a string, as then your resolver layer doesn't have to constantly map back/forth from integers to strings for output, and strings to `parseInt`-d integers for input.

Joist does all of that internally, i.e. "string/number mapping" between the API/entity domain layer and the database columns.

### But I'm Not Using GraphQL

Even if you're not using GraphQL, both benefits/rationale of:

- Id implementations should be opaque to external clients, and
- Tagged ids prevent "wrong id" bugs

Are applicable to any system, so ideally you could apply the "id is a string" approach to your REST or GRPC or other APIs.

That said, if you have an existing `number`-based API that you can't change, Joist provides `deTagId`, `deTagIds`, and `tagId` methods to convert to/from tagged ids to the actual number value.

### Running SQL Queries

When writing raw SQL queries, you can get the numeric value using `deTagId`

```typescript
  const query = someKnexQuery();
  query.whereIn("books.id", deTagId(getMetadata(Book), bookId));
```

Note that `deTagId` accepts the `Book` entity as its 1st parameter because it still applies the tagged id runtime check, i.e. ensure that `bookId` starts with `b:...`.

If you need to detag a value without knowing the entity type, you can use `unsafeDeTagIds`.

### Tag Assignment

For the tag names, when you add a new table, Joist guesses a tag name to use by abbreviating the table name, i.e. `book_reviews` is `br` or `foo_bar_zazzes` is `fbz`.

If there is a collision, i.e. the `br` abbreviation is already taken by an existing table in `joist-codegen.json`, then Joist will use the full entity name, i.e. `bookReview`.

The guessed tag name is then stored `joist-codegen.json`, where you can easily change it if Joist initially guesses wrong.

However, once you have a given tagged id deployed in production, you should probably never change it (i.e. change the `bookReview` tag to `bkr`), because even though Joist internally would immediately start using the new tag value (after the change is deployed), if any other external systems have copies of your ids (like you've stored `bookReview:1` in an external/3rd party system), those externally-stored ids will now be incorrect, and Joist will be unload to load them.

### Untagged Id Fallback

If you do happen to given Joist untagged ids, it will still work, for example:

```typescript
const id = "1";
// This will work, the `a:` prefix is not strictly required
const a = await em.load(Author, id);
```
