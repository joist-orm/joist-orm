---
title: Pruning in Joist's Query DSL
slug: blog/pruning-query-dsl
date: 2026-08-24
authors: shaberman
tags: []
_excerpt: How Joist prunes unused conditions and relationship paths to simplify dynamic queries.
---

## Introduction

This post explains pruning, a novel feature of the `em.find` query DSL in Joist, an [entity-based](/modeling/why-entities/) ORM for TypeScript.

Specifically, we show how ergonomic pruning is for "semi-dynamic" endpoints that return the same kind of data on every request, such as `GET /authors`, but vary their filters, joins, and `WHERE` clauses according to the request parameters.

A quick example of Joist's query DSL for `GET /authors` is:

```typescript
// Supports multiple parameters, for example:
// - `GET /authors?firstName=a1`
// - `GET /authors?publisherId=1`
// - `GET /authors?publisherName=p1`
async function getAuthors(params: {
  firstName?: string;
  publisherId?: string;
  publisherName?: string;
}): Promise<Author[]> {
  // Each variable is `string | undefined`, depending on what is sent
  const { firstName, publisherId, publisherName } = params;
  // We pass all 3 into `em.find` and it "just works"
  return em.find(Author, {
    firstName,
    publisher: { id: publisherId, name: publisherName },
  });
}
```

Read on to learn how it works and how it compares with other query DSLs in the JavaScript and TypeScript ecosystem.

## Query DSL Context

A key feature of any ORM, whether it uses a Knex-style query builder or a Joist-style [domain model](https://joist-orm.io/modeling/why-entities/), is its query API: the DSL (domain-specific language) used to find rows in the database.

An ORM's query DSL is usually one of its defining features. For query-builder libraries such as Knex, Drizzle, and Kysely, it is essentially the entire product, so query DSLs are a common area of exploration and innovation that can make or break the ergonomics of the library.

These DSLs can be as simple as "slightly decorated" SQL strings in [postgres.js](https://github.com/porsager/postgres):

```ts
const rows = await sql`SELECT * FROM users WHERE name = ${name}`;
```

They can also use fluent, method-chaining APIs such as Knex, Kysely, or Drizzle:

```ts
// Knex
await knex("users").where("name", "=", name);
// Kysely
await db.selectFrom('users').where('name', '=', name).execute();
// Drizzle
await db.select().from(users).where(eq(users.name, name));
```

Joist's own `em.find` uses a POJO-style API:

```ts
const authors = await em.find(Author, { name });
```

Each ORM generally tries to provide "the most idiomatic query DSL possible," but this can become a contentious topic because the interpretation of "idiomatic" depends on:

- What "looks idiomatic" in the host programming language

  That is, an idiomatic TypeScript DSL differs from an idiomatic Java DSL, which in turn differs from an idiomatic Go DSL.

  In my opinion, this is why Prisma's circa-2021 experiment with a Rust-based engine shared by TypeScript and Go clients was quizzical from the start: Go and TypeScript differ sharply in taste and style.

- What "looks idiomatic" depends on where the ORM sits on the "driver => query builder => domain model" spectrum.

  That is, what looks idiomatic for a low-level node-postgres or postgres.js driver differs from what looks idiomatic for a higher-level Active Record or entity-based ORM such as MikroORM or Joist.

- What "looks idiomatic" is fundamentally a personal judgment call.

  (...except on Reddit, where the only correct answer is "raw SQL." 💀)

That disclaimer aside, we'll argue that Joist is idiomatic for an ORM at the domain-model end of the spectrum by examining two query patterns:

1. Static queries: the query shape is always exactly the same, differing only in parameter values.
2. Dynamic queries: the query shape varies, with different relationship paths and conditions.

Here, "shape" means which columns and conditions the query uses and which tables or relationship paths it traverses.

## Static Queries

A static query is one that always uses exactly the same tables and conditions.

An example would be a `GET /oldBooks?authorId=1` endpoint that, for a given author, returns all books that are at least 10 years old.

Although the value of `authorId` may change, the query's structure (tables and conditions) does not.

We'll use this endpoint signature:

```ts
type OldBookParams = { authorId: string };

// `GET /oldBooks?authorId=1`
declare function getOldBooks(params: OldBookParams): Promise<Book[]>;
```

For brevity, these signatures use `Book` and `Author` throughout the post. postgres.js, Knex, Drizzle, and Prisma return row or record objects; MikroORM and Joist return hydrated entity instances.

First, postgres.js:

```ts title="postgres.js"
async function getOldBooks(params: OldBookParams): Promise<Book[]> {
  const { authorId } = params;
  // Driver-style "just a string"
  return await sql<Book[]>`
    SELECT b.* FROM books b
    WHERE b.author_id = ${authorId}
    AND b.published_at <= ${tenYearsAgo}
  `;
}
```

Next, Knex:

```ts title="Knex"
async function getOldBooks(params: OldBookParams): Promise<Book[]> {
  const { authorId } = params;
  // Knex/Kysely-style chained methods
  return await knex
    .select('b.*')
    .from('books as b')
    .where('b.author_id', '=', authorId)
    .where('b.published_at', '<=', tenYearsAgo);
}
```

Next, Drizzle:

```ts title="Drizzle"
async function getOldBooks(params: OldBookParams): Promise<Book[]> {
  const { authorId } = params;
  return await db
    .select()
    .from(books)
    .where(and(
      eq(books.authorId, authorId),
      lte(books.publishedAt, tenYearsAgo),
    ));
}
```

Next, MikroORM:

```ts title="MikroORM"
async function getOldBooks(params: OldBookParams): Promise<Book[]> {
  const { authorId } = params;
  return await em.find(Book, {
    author: authorId,
    publishedAt: { $lte: tenYearsAgo },
  });
}
```

Finally, Joist:

```ts title="Joist"
async function getOldBooks(params: OldBookParams): Promise<Book[]> {
  const { authorId } = params;
  return await em.find(Book, {
    author: authorId,
    publishedAt: { lte: tenYearsAgo },
  });
}
```

MikroORM and Joist take a fundamentally different approach: the query condition is a POJO literal. This is more succinct but also more limited because their `em.find` APIs return entities rather than arbitrary projected row shapes.

For these initial static-query examples, in my opinion the queries are all fairly simple/standard and could each be considered idiomatic in their own way.

## Dynamic Queries

Let's move on to dynamic queries, whose relationship paths and conditions vary according to endpoint parameters or other business logic.

The example here is a `GET /authors` endpoint that always returns authors but can filter them by attributes of their publisher, books, or book reviews.

We'll use the following type for the `getAuthors` query parameters. Each property is optional, indicating that clients may omit it:

```typescript
type AuthorsParams = {
  /** Return authors that match this name. */
  name?: string;
  /** Return authors whose publisher has this name. */
  publisherName?: string;
  /** Return authors whose publisher has this status. */
  publisherStatus?: string;
  /** Return authors with at least one book of this status. */
  bookStatus?: number;
  /** Return authors with a rating-3 review when true or a rating-1 review when false. */
  highRating?: boolean;
};
```

> _Disclaimer: "Return authors with a publisher of this name" is not elegant API design; I'm using it only as an ad hoc example of a dynamic endpoint._

For this new endpoint, let's see how we would implement the query in each library.

The biggest difference is that we now have to integrate the conditional query shape into each library's syntax.

```ts title="postgres.js"
async function getAuthors(filter: AuthorsParams): Promise<Author[]> {
  const { name, publisherName, publisherStatus, bookStatus, highRating } = filter;
  return await sql<Author[]>`
    SELECT DISTINCT a.*
    FROM authors a
      ${publisherName !== undefined || publisherStatus !== undefined
        ? sql`JOIN publishers p ON a.publisher_id = p.id`
        : sql``}
      ${bookStatus !== undefined || highRating !== undefined
        ? sql`JOIN books b ON a.id = b.author_id`
        : sql``}
      ${highRating !== undefined
        ? sql`JOIN book_reviews br ON b.id = br.book_id`
        : sql``}
    WHERE 1 = 1
      ${name !== undefined ? sql`AND a.name = ${name}` : sql``}
      ${publisherName !== undefined ? sql`AND p.name = ${publisherName}` : sql``}
      ${publisherStatus !== undefined ? sql`AND p.status = ${publisherStatus}` : sql``}
      ${bookStatus !== undefined ? sql`AND b.status_id = ${bookStatus}` : sql``}
      ${highRating !== undefined ? sql`AND br.rating = ${highRating ? 3 : 1}` : sql``};
  `;
}
```

A few notes:

- We include a dummy `1 = 1` so that all our conditional predicates can always use an `AND` prefix.

  Without this workaround, we would have to track which predicate comes first so that only subsequent predicates receive an `AND` prefix, which would be even more tedious. Disclaimer: this workaround was ChatGPT's idea. 😅

- Each conditional join check needs to know not only whether filters from its table are in use (if `bookStatus` is used, include `books`) but also whether filters from downstream tables are in use (if `highRating` is used, include `books` so that the `book_reviews` join works).

Next is Knex, which should be representative of method-chaining-style query builders:

```ts title="Knex"
async function getAuthors(filter: AuthorsParams): Promise<Author[]> {
  const { name, publisherName, publisherStatus, bookStatus, highRating } = filter;
  // Start building the query
  const query = knex<Author>('authors as a').select('a.*').distinct();
  // Add conditional JOINs
  if (publisherName !== undefined || publisherStatus !== undefined) {
    query.join('publishers as p', 'a.publisher_id', '=', 'p.id');
  }
  if (bookStatus !== undefined || highRating !== undefined) {
    query.join('books as b', 'a.id', '=', 'b.author_id');
  }
  if (highRating !== undefined) {
    query.join('book_reviews as br', 'b.id', '=', 'br.book_id');
  }
  // Add conditional WHERE clauses
  if (name !== undefined) query.where('a.name', name);
  if (publisherName !== undefined) query.where('p.name', publisherName);
  if (publisherStatus !== undefined) query.where('p.status', publisherStatus);
  if (bookStatus !== undefined) query.where('b.status_id', bookStatus);
  if (highRating !== undefined) query.where('br.rating', highRating ? 3 : 1);
  return await query;
}
```

Next is Drizzle. Its `and` helper omits `undefined` conditions, but the joins still need to be added conditionally:

```ts title="Drizzle"
import { type SQL, and, eq, getTableColumns } from 'drizzle-orm';

async function getAuthors(filter: AuthorsParams): Promise<Author[]> {
  const { name, publisherName, publisherStatus, bookStatus, highRating } = filter;
  const conditions: Array<SQL | undefined> = [
    name !== undefined ? eq(authors.name, name) : undefined,
    publisherName !== undefined ? eq(publishers.name, publisherName) : undefined,
    publisherStatus !== undefined ? eq(publishers.status, publisherStatus) : undefined,
    bookStatus !== undefined ? eq(books.statusId, bookStatus) : undefined,
    highRating !== undefined ? eq(bookReviews.rating, highRating ? 3 : 1) : undefined,
  ];
  const query = db
    .selectDistinct({ ...getTableColumns(authors) })
    .from(authors)
    .$dynamic();
  if (publisherName !== undefined || publisherStatus !== undefined) {
    query.innerJoin(publishers, eq(authors.publisherId, publishers.id));
  }
  if (bookStatus !== undefined || highRating !== undefined) {
    query.innerJoin(books, eq(authors.id, books.authorId));
  }
  if (highRating !== undefined) {
    query.innerJoin(bookReviews, eq(books.id, bookReviews.bookId));
  }
  return await query.where(and(...conditions));
}
```

Next is Prisma, using its typed relation filters. This version never passes an explicit `undefined`, so it also works with Prisma's `strictUndefinedChecks` option:

```ts title="Prisma"
async function getAuthors(filter: AuthorsParams): Promise<Author[]> {
  const { name, publisherName, publisherStatus, bookStatus, highRating } = filter;
  const where: Prisma.AuthorWhereInput = {};
  if (name !== undefined) {
    where.name = name;
  }
  if (publisherName !== undefined || publisherStatus !== undefined) {
    const publisher: Prisma.PublisherWhereInput = {};
    if (publisherName !== undefined) publisher.name = publisherName;
    if (publisherStatus !== undefined) publisher.status = publisherStatus;
    where.publisher = { is: publisher };
  }
  if (bookStatus !== undefined || highRating !== undefined) {
    const book: Prisma.BookWhereInput = {};
    if (bookStatus !== undefined) book.status = bookStatus;
    if (highRating !== undefined) {
      book.bookReviews = { some: { rating: highRating ? 3 : 1 } };
    }
    where.books = { some: book };
  }
  return await prisma.author.findMany({ where });
}
```

MikroORM also uses a typed conditions object, which must be built conditionally:

```ts title="MikroORM"
import { type FilterQuery } from '@mikro-orm/core';

async function getAuthors(filter: AuthorsParams): Promise<Author[]> {
  const { name, publisherName, publisherStatus, bookStatus, highRating } = filter;
  const where: FilterQuery<Author> = {};
  if (name !== undefined) {
    where.name = name;
  }
  if (publisherName !== undefined || publisherStatus !== undefined) {
    const publisher: FilterQuery<Publisher> = {};
    if (publisherName !== undefined) publisher.name = publisherName;
    if (publisherStatus !== undefined) publisher.status = publisherStatus;
    where.publisher = publisher;
  }
  if (bookStatus !== undefined || highRating !== undefined) {
    const book: FilterQuery<Book> = {};
    if (bookStatus !== undefined) book.status = bookStatus;
    if (highRating !== undefined) {
      book.reviews = { $some: { rating: highRating ? 3 : 1 } };
    }
    where.books = { $some: book };
  }
  return await em.find(Author, where);
}
```

:::tip

MikroORM treats `undefined` as `null` by default, so the explicit checks above are necessary to build the `where` clause correctly.

However, I learned while writing this post that MikroORM has an `ignoreUndefinedInQuery: true` configuration option (see its [documentation](https://mikro-orm.io/docs/configuration#ignoring-undefined-values-in-find-queries)) that recursively removes `undefined` values and can make this particular example more succinct.

That said, it is not the same as Joist's usage-based pruning of conditions and relationship paths (which we'll see next).

:::

Finally, here's Joist's dynamic version, which is noticeably simpler:

```ts title="Joist"
async function getAuthors(filter: AuthorsParams): Promise<Author[]> {
  const { name, publisherName, publisherStatus, bookStatus, highRating } = filter;
  return await em.find(Author, {
    name,
    publisher: { name: publisherName, status: publisherStatus },
    books: {
      status: bookStatus,
      reviews: {
        rating: highRating === undefined ? undefined : highRating ? 3 : 1,
      },
    },
  });
}
```

After all that code, **notice how few conditionals are in the Joist snippet** compared with the other examples. 🎉

This is the pruning feature at work. Let's look at how it works.

## Joist's Trick: Usage Tracking

Joist's insight is that, for most dynamic-query use cases, the _maximal structure_ of the query remains essentially static, just like the static queries in the previous section, and then _individual parts within that structure_ are turned on or off according to the input.

Several of the other query DSLs can omit individual "leaf" predicates that are `undefined` (Drizzle supports `undefined` conditions, Prisma omits them by default or uses `Prisma.skip`, and MikroORM can opt into similar behavior). However, these DSLs generally do not remove both unused conditions _and now-unused relationship paths_ from one stable nested query shape, so application code still handles that boilerplate with `if` statements, ternaries, or conditional method chaining.

Joist instead determines which conditions and relationship paths to retain by tracking the usage of each one.

To do that, Joist leverages one of JavaScript's core [wat](https://www.destroyallsoftware.com/talks/wat)-isms: "Oh no, both `null` and `undefined`?!? 😱" For `em.find`:

- Any condition with `null`, such as `firstName: null`, becomes `IS NULL`.
- Any condition with `undefined`, such as `firstName: undefined`, is unused.
- Any relationship path referenced only by unused conditions is also unused.

After dropping all unused conditions and relationship paths, Joist generates SQL that contains only the necessary predicates and traversals.

Here are some conditions that are pruned or retained based on their runtime values:

```ts title="Joist"
// Given two variables, e.g. from incoming query parameters
const firstName = undefined;
const publisherId = null;
// When this `em.find` call executes, each condition is...
await em.find(Author, {
  name: { eq: undefined }, // pruned
  lastName: { in: undefined }, // pruned
  age: { gte: undefined }, // pruned
  firstName, // pruned
  ssn: null, // not pruned
  publisher: { id: publisherId }, // not pruned
});
```

:::tip[Info]

Speaking of this "wat", Joist also leverages `null` vs. `undefined` for [partial-update APIs](/features/partial-update-apis/), where `{ lastName: undefined }` means "leave the `lastName` field alone," while `{ lastName: null }` means "unset it."

This works well with web frameworks and GraphQL mutation inputs: when a `SaveAuthor` command is deserialized, `lastName: undefined` means "the caller did not send this field" and `lastName: null` means "they really want it unset".

Ngl I've grown to really liking `null` vs. `undefined` as a tool to use when designing JavaScript/TypeScript libraries, and would miss when moving to other languages. 

:::

## Complex Conditions

So far we've looked at how Joist prunes its `em.find` "inline conditions," which are predicates contained directly in the object literal passed to `em.find`; all of them become top-level `AND` conditions in the query.

For complex `AND` and `OR` expressions, Joist has a `conditions` property that accepts `{ and: [...] }` and `{ or: [...] }` structures. These also support pruning:

```ts title="Joist"
const [a, b] = aliases(Author, Book);
// Find authors matching either a.lastName or b.title.
await em.find(
  Author,
  // This second argument is the "join literal" that declares the maximal
  // relationship structure rooted at the `authors` table.
  {
    // `as` binds the `authors` table to `a` for use in conditions below.
    as: a,
    // Inline conditions become top-level AND conditions.
    firstName: { eq: "bob" }, // not pruned
    // The books path remains because b.title is used below. Joist may
    // implement this collection filter as a correlated EXISTS subquery.
    books: { as: b },
  },
  // This third argument contains complex AND/OR expressions.
  {
    conditions: {
      or: [
        a.lastName.eq(undefined), // pruned
        b.title.eq("foo"), // not pruned
      ],
    },
  },
);

// Here is the same query without inline comments.
await em.find(
  Author,
  { as: a, firstName: { eq: "bob" }, books: { as: b } },
  { conditions: { or: [a.lastName.eq(undefined), b.title.eq("foo")] } },
);
```

As the comments indicate, a call to `.eq`, `.in`, or `.gt` on a column alias such as `a.lastName` or `b.title` is pruned when its argument is `undefined`.

If an `{ or: [...] }` or `{ and: [...] }` list is empty because all its conditions were pruned, the `OR` or `AND` clause is also pruned.

Putting it all together:

- The second `em.find` argument is a "join literal" that declares the maximal query structure: all relationship paths and conditions that might be used.
- The join literal can contain simple inline conditions.
- The third argument's `conditions` property can contain complex conditions.
- Any unused condition or relationship path is pruned.

And that's it.

This setup lets Joist handle logic that application code would otherwise implement with repetitive language-level conditionals.

## Production Query Examples

To show how succinct Joist queries are in practice, here are two queries copied from our production codebase.

Both are GraphQL query resolvers because our primary codebase is a GraphQL monolith, but the patterns apply equally to REST endpoints, gRPC services, and other APIs.

The first resolver implements `query { items }` with a filter; `ItemFilter` defines five optional fields that clients can combine freely:

```graphql title="GraphQL"
# E.g., `query { items(filter: { version: 2 }) { name } }`
input ItemFilter {
  id: [ID!]
  version: [Int!]
  costCode: [ID!]
  isSelection: Boolean
  status: [ItemStatus!]
}
```

Its `em.findGql` call is a **one-liner** 🎉:

```ts title="Joist"
export const items: Pick<QueryResolvers, "items"> = {
  items(root, { filter }, { em }) {
    const { costCode, version = [1], ...other } = filter ?? {};
    return em.findGql(Item, { ...other, costCode: { id: costCode, version } }, { orderBy: { name: "ASC" } });
  },
};
```

The second example is a similar query for the `CostCode` entity, but it uses an `OR` for the `tradePartnerIds` condition:

```ts title="Joist"
export const costCodes: Pick<QueryResolvers, "costCodes"> = {
  costCodes(root, { filter }, { em }) {
    const { tradePartnerIds, version = [1], ...others } = filter ?? {};
    const [c, cco, bc] = aliases(Commitment, Commitment, BidContract);
    return em.findGql(
      CostCode,
      {
        // Pass along most of our filters 1:1
        ...others,
        version,
        // The WHERE for tradePartnerIds returns "cost codes relevant to the
        // given trade partners". This requires several relationships/joins,
        // which we declare and then rely on Joist to prune if not provided.
        items: {
          projectItems: {
            commitmentLineItems: {
              commitment: { as: c },
              changeOrder: { commitment: { as: cco } },
            },
          },
          bidItems: {
            bidContractLineItems: { revision: { bidContract: { as: bc } } },
          },
        },
      },
      {
        conditions: {
          // If tradePartnerIds was provided, filter by those IDs.
          or: [
            c.tradePartner.in(tradePartnerIds),
            cco.tradePartner.in(tradePartnerIds),
            bc.tradePartner.in(tradePartnerIds),
          ],
        },
        orderBy: { number: "ASC" },
      },
    );
  },
};
```

This query is not a one-liner 😅, but it is still relatively clean: the join literal defines the static structure, and the `or: [...]` expression makes `tradePartnerIds` conditional without cluttering the code.

It is also worth calling out the easy-to-miss `...others` spread, which sends the remaining directly mapped GraphQL filters to Joist for default handling.

This highlights a key Joist principle: most API fields map directly to database fields. Therefore:

- Common one-to-one cases should be succinct and boilerplate-free.
- One-off cases should remain possible without fighting the framework.

## Disclaimer

Joist's `em.find` DSL has one major limitation: it always returns entities, such as `Author` or `Book`, rather than arbitrary projected row shapes.

This means it does not currently support arbitrary SQL queries that use features such as `SUM` and `GROUP BY` to return arbitrary [POJOs](https://masteringjs.io/tutorials/fundamentals/pojo).

This does not mean that applications cannot use those SQL features--we of course have a small percentage queries that need them, and currently we just use a lower-level query builder such as Knex for those queries.

I.e. we're not dogmatic about "Joist _must do everything_" (...but maybe someday 😅🤞).

Historically, this has just been a pragmatic/ROI decision: because of Joist's focus on entities, literally 95% of our codebase's queries are all `em.find`s (yes we counted 🤣), and so we've not yet prioritized a low-level SQL builder.

See [Issue #188](https://github.com/joist-orm/joist-orm/issues/188) for tracking that idea, which we're optimistic will be able to leverage the same core `alias` and usage-tracking/pruning features of the `em.find` API.

## Conclusion

Personally, I feel like "building _dynamic_ queries" is often overlooked when ORM authors design query DSLs, almost as if they were an afterthought.

My admittedly anecdotal evidence for this is:

1. Dynamic queries can be painful in some ORMs.

   The postgres.js, Knex, Drizzle, Prisma, and MikroORM examples all show how dynamic queries can expand query-construction code with boilerplate, particularly around conditional relationship paths/joins.

   To me, this is a tell that the scenario was not treated as a first-class problem when the DSL was designed.

2. ORM tutorials and overviews often omit examples of how to add three or four relationship paths conditionally, relegating the topic to FAQs or leaving users to work it out themselves.

Granted, Joist might have gotten lucky in knowing "this is a problem to solve" because idiomatic GraphQL queries frequently have optional filters, which made this an acute pain point for us while developing our primary codebase.

But we also took our time designing the `em.find` API, refining it over several years of day-to-day/in-the-weeds feature development, before ending up at its current form.
