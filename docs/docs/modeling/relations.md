---
title: Relations
sidebar_position: 2
---

Relations are relationships between entities in your domain model, for example an `Author`'s list of `Book`s or an `Author`'s current `Publisher`.

Joist's `joist-codegen` step automatically discovers the relations from your database schema (based on foreign keys) and generates either `Reference`s (for relations that point to a single other entity) or `Collection`s (for relations that point to multiple other entities).

Two common themes for all of Joist's relations are that:

1. They are by default unloaded, and require `await author.book.load()` calls to load, _but_ also all support preloading via populate hints, see [load safe relations](../goals/load-safe-relations.md) for more.

2. Joist always keeps "both sides" of relationships in sync, for example if you add a `Book` to an `Author`, that `Author`'s list of books will automatically include that `Book`.

   This is a big quality-of-life win, as business logic (validation rules, rendering logic) will always see the latest state of relations, and not have to worry about running against now-stale data.

### Reading Relations

In other ORMs you may be used to checking for the existings of a relation by checking for it's presence, e.g. `if (book.author) { ... }`. In Joist, all relations are always present, but may not be set to a value. To check if a relation is set use `isSet`, for example:

```typescript
const b1 = await em.load(Book, "b:1");

// Always returns truthy
if (b1.author) {
  ...
}

// Returns true if the author is set
if (b1.author.isSet) {
  ...
}
```

If you want to read the id of a relation without loading it, you can do so via the `id` field:

```typescript
const b1 = await em.load(Book, "b:1");

// The id of the author is available without loading the author
const authorId = b1.author.id;
```

## Many To One References

Joist looks for "outgoing" (many-to-one) foreign keys like `books.author_id` pointing to `books.id` and automatically includes a `ManyToOneReference` in the `BookCodegen` file:

```typescript
export abstract class BookCodegen {
  readonly author: ManyToOneReference<Book, Author, never> = hasOne(authorMeta, "author", "books");
}
```

Accessing the `author` field requires either calling `.load()` or a populate hint:

```typescript
// Unloaded author field
const b1 = await em.load(Book, "b:1");
const a1 = await b1.author.load();
console.log(a1.firstName);

// Preloaded author field
const b2 = await em.load(Book, "b:2", "author");
console.log(b2.author.get.firstName);
```

:::info

If `books.author_id` is `not null`, then the reference will be required, i.e. `someBook.author.get` will return `Author`, otherwise it will be optional, and `someBook.author.get` will return `Author | undefined`.

:::

## One To Many Collections

Joist also looks for "incoming" foreign keys, like `Author` being "pointed at" by the `books.author_id` column and automatically generates a one-to-many `hasMany` collection as the "other side" in `AuthorCodegen.ts`:

```typescript
export abstract class AuthorCodegen {
  readonly books: Collection<Author, Book> = hasMany(bookMeta, "books", "author", "author_id");
}
```

When unloaded, `Collection`s support adding and removing:

```typescript
const a = await em.load(Author, "a:1");
a.books.add(someBook);
a.books.remove(otherBook);
```

But accessing the contents of the collection requires being loaded, again either with a `.load()` call or a populate hint:

```typescript
// Unloaded Author.books collection
const a1 = await em.load(Author, "a:1");
const books = await a1.books.load();
console.log(books.length);

// Preloaded Author.books collection
const a2 = await em.load(Author, "a:2", "books");
console.log(a2.books.get.length);
console.log(a2.books.get[0].title);
```

If a one-to-many collection is loaded, it can also be set, like `a1.books.set([b1, b2])`. Besides updating the value of `a1.books.get`, both the `b1.author` and `b2.author` references will be updated to `a1`.

:::info

If `Author.ts` has a `cascadeDelete("books")` _and_ `Book.ts.` has a `cannotBeUpdated("author")` rule, then Joist will consider the book to be "fully owned" by the `Author`, and if any existing book is left out of the `a1.books.set` call, it will be implicitly deleted via `em.delete`.

The rationale is that this makes calls like `parent.lineItems.set(...)`, that purposefully omit an existing child, "just work" by assuming the intent is that we no longer want that child to exist.

Currently, this behavior is not configurable (it relies on the convention of both the cascade delete + `cannotBeUpdated` rule), and also is only invoked by the `a1.books.set` side of the relation; i.e. if `b1.author.set(undefined)` is called, then `b1` won't be implicitly deleted, and instead a regular "`author` is required" validation error will be thrown.

Also note that Joist's `em.createOrUpdatePartial` API supports an `op` parameter to more explicitly control child collection behavior, see [Saving Parents with Children](https://joist-orm.io/docs/features/partial-update-apis#saving-parents-with-children).

:::

## One To One Reference

Joist distinguishes "incoming" foreign keys with a unique constraint as a one-to-one relationship rather than one-to-many and instead automatically generates a `hasOneToOne` reference as the "other side" rather than `hasMany`:

```typescript
export abstract class AuthorCodegen {
  readonly image: OneToOneReference<Author, Image> = hasOne(imageMeta, "image", "author", "author_id");
}
```

These references work similarly to a `hasOne` reference, but have less information available to them when in an unloaded state (such as checking if the reference is set without loading it). Additionally, they are always assumed to be nullable.

## Many to Many Collection

Joist will skip generating full entity classes for any tables it considers to be a "join table" between two other entities. Instead, it will generate matching `hasManyToMany` collections on each of the entities pointed to by the foreign keys on the join table:

```typescript
export abstract class BookCodegen {
  readonly tags: Collection<Author, Tag> = hasManyToMany("authors_to_tags", "tags", "author_id", tagMeta, "authors", "tag_id");
}
```

These collections work similarly to a `hasMany` collection. When determining if a table is a "join table", joist checks if the table has a single primary key column, two foreign key columns, an optional `created_at` column, and no other columns. Joist also requires that the foreign keys are both `not null` and that the table has a unique constraint on the pair of foreign keys.

## Polymorphic References

Polymorphic references model an entity (i.e. `Book`) that has a single logical field that can be set to multiple (i.e. poly) _types_ of other entities, but _only one such entity at a time_ (i.e. a reference b/c it points to only one other entity).

For example maybe a `Book` has a single logical `publisher` field that can either be a `CorporatePublisher` entity (a row in the `corporate_publishers` table) or a `SelfPublisher` entity (a row in the `self_publishers` table).

The simplest way to model this `Book` scenario would be having two foreign keys, a `books.corporate_publisher_id` and `books.self_publisher_id`, and then having your application's business logic "just know" that it should enforce only one of these keys being set at a single time.

Polymorphic references allow you to tell Joist about this "single logical field that could be two-or-more different types", and it will do the "can only be set at once" handling for you.

### Implementation

Polymorphic references have two components:

- In the domain model, they are a single logical field (i.e. `Book.publisher`).

  The field type is `PolymorphicReference<BookPublisher>`, where `BookPublisher` is a code generated type union of each potential type, i.e. Joist will create:

  ```typescript
  export type BookPublisher = CorporatePublisher | SelfPublisher;
  ```

  In the `BookCodegen.ts` file.

- In the database schema, they are multiple physical columns, one per "other" entity type (i.e. `books.publisher_corporate_publisher_id` and `books.publisher_self_publisher_id`)

### Usage

To use polymorphic references, there are two steps:

1. Create the multiple physical foreign keys in your schema, all with a similar `publisher_*_id` naming convention.

2. In `joist-config.json`, add a new `publisher` relation that is marked as `polymorphic`:

   ```json
   {
     "entites": {
       "Comment": {
         "relations": { "publisher": { "polymorphic": "notNull" } },
         "tag": "comment"
       }
     }
   }
   ```

   Joist with then use the `publisher` name to scan for any other `publisher_`-prefixed foreign keys and automatically pull them in as components of this polymorphic reference.

## Renaming Relations

Joist makes a best guess for relation names, based on the foreign key's column name and the table it points to (i.e. the "other side" of `books.author_id` should be called `Author.books`), but this is not always perfect.

Sometimes a table will have two incoming foreign keys that cause a naming collision, or you just want a different name (self-referential foreign keys like `authors.mentor_id` are particularly hard for Joist to guess good names for).

In these circumstances, you can specify which field names to use directly in the database schema. Joist uses `pg-structure`'s [`commentData`](https://www.pg-structure.com/nav.02.api/classes/dbobject.html#commentdata) convention (which is basically a JSON payload in the column's `COMMENT` metadata) to look for two properties:

- `fieldName` for renaming a m2o reference, and
- `otherFieldName` for renaming the opposing m2o/m2m/o2o relation

Setting this `commentData` structure by hand can be tedious, but Joist's `joist-migration-utils` package provides both a `renameRelation` function (for renaming fields of existing columns) and a `foreignKey` helper (for renames fields on new columns) that allow easily setting the `fieldName` and `otherFieldName` keys.

:::info

Why `COMMENT` metadata? Putting field names in the `COMMENT` metadata is somewhat unconventional, but it has a few advantages:

1. It follows Joist's overall philosophy of "the database is the source of truth", and

2. Previously we put renames in the `joist-config.json` file, but that meant having to know/guess the wrong/unintuitive name, just to map it over to the correct name. Which was confusing and also did not handle collisions.

  With the `COMMENT` approach, the `joist-config.json` now has only the correct/best field name for the rest of the config options you might want to specify on the relation.

:::

## Consistent Relations

Joist keeps both sides of m2o/o2m/o2o relationships in sync, i.e.:

```typescript
// Load the author with the books collection loaded
const a = await em.load(Author, "a:1", "books");
// Load a book, and set the author
const b = await em.load(Book, "b:1");
b.author.set(a);
// This will print true
console.log(a.books.get.includes(b));
```

If the `Author.books` collection is not loaded yet, then the `b.author.set` line does not cause it to become loaded, but instead will remember "add `b`" as a pending operation, to apply to `a.books`, should it later become loaded within the current `EntityManager`.

## Custom Relations

Besides the core relations discovered from the schema's foreign keys, Joist lets you declare additional relations in your domain model.

:::tip

These custom relations are great for defining relationships between _entities_ in your domain model, like how `Author` might relate to `BookReview`.

If you'd like to define custom _non-entity_ fields, like derived numbers or strings, see [Derived Fields](./derived-properties.md).

:::

### hasOneThrough

`hasOneThrough` defines a shortcut from your entity to a single other entity, for example if asking for a `BookReview`'s author (via the `Book`) is very common, you can define a `BookReview.author` relation:

```typescript
export class BookReview extends BookReviewCodegen {
  // use never if Author will always be set, or undefined if it might be unset
  readonly author: Reference<BookReview, Author, never> = hasOneThrough((review) => review.book.author);
  // Paths can be arbitrarily long
  readonly publisher: Reference<BookReview, Publisher, never> = hasOneThrough((review) => review.book.author.publisher);
}
```

With this alias defined, you can refactor code to be more succinct:

```typescript
// Using the core relations
const br1 = await em.load(BookReview, { book: { author: "publisher" } });
console.log(`br1 publisher:` + br1.book.get.author.get.publisher.get);

// Using the hasOneThrough alias
const br2 = await em.load(BookReview, "publisher");
console.log(`br2 publisher:` + br2.publisher.get);
```

Both of these approaches have the same runtime behavior, i.e. under the hook `br2.publisher.get` is actually executing `review.book.get.author.get.publisher.get`.

:::info

Note that currently `hasOneThrough` and `hasManyThrough` load all the entities on the path between the current entity and the target(s), i.e. the above example pulls all the review's books, the book's authors, and the author's publisher into memory.

We have an issue tracking optimizing this to avoid loading entities, see [Issue 524](https://github.com/joist-orm/joist-orm/issues/524).

:::

### hasManyThrough

`hasManyThrough` is very similar to `hasOneThrough` but for collections of multiple entities:

```typescript
export class Publisher extends PublisherCodegen {
  readonly reviews: Collection<Publisher, BookReview> = hasManyThrough((p) => p.authors.books.bookReviews);
}
```

The behavior is the same as `hasOneThrough`:

```typescript
// Using the core relations
const p1 = await em.load(Publisher, { authors: { books: "reviews" } });
console.log(`p1 reviews:` + p1.authors.get.flatMap((a) => a.books.get.flatMap((b) => b.reviews.get)));

// Using the hasManyThrough alias
const p2 = await em.load(Publisher, "reviews");
console.log(`p2 reviews:` + p2.reviews.get);
```

### hasOneDerived & hasManyDerived

`hasOneDerived` and `hasManyDerived` are very similar to `hasOneThrough` and `hasManyThrough`, but allow a lambda to filter the results.

For example, maybe `Publisher.reviews` should only be `public` reviews:

```typescript
class BookReview extends PublisherCodegen {
  readonly reviews: Collection<Publisher, BookReview> = hasManyDerived(
    { authors: { books: "reviews" } },
    (p) => p.authors.get
      .flatMap(a => a.books.get.flatMap(b => b.reviews.get))
      .filter(br => br.isPublic)
  );
}
```

