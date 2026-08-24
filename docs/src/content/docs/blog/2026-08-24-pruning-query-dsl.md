---
title: Pruning in Joist's Query DSL
slug: blog/pruning-query-dsl
date: 2026-08-24
authors: shaberman
tags: []
_excerpt: ...
---

## Short Intro

This post explains the generally novel "pruning" feature of Joist's (an [entity-based](/modeling/why-entities/) ORM for TypeScript) `em.find` query DSL.

Specifically, we show how extremely ergonomic it is for "semi-dynamic" queries like endpoints that return the same basic data for each request (i.e. `GET /authors`), but use slightly different filters / joins / `WHERE` clauses based on the endpoint's params (sometimes `?firstName=a1`, sometimes `?publisherId=p1`).

A quick example of Joist's query DSL for a `GET /authors` is:

```typescript
// Returns authors for multiple paramters, i.e.
// - `GET /authors?firstName=a1
// - `GET /authors?publisherId=1`
// - `GET /authors?publisherName=p1`
async function getAuthors(params: AuthorsParams): Promise<Author[]> {
  // Each variable is `string | undefined`, depending on what is sent
  const { firstName, publisherId, publisherName  } = params;
  // We pass all 3 into `em.find` and it "just works"
  return em.find(Author, {
    firstName,
    publisher: { id: publisherId, name: publisherName },
  });
}
```

Read on for how it works & contrasts with other query DSLs in the JS/TS ecosystem.

## Longer Intro

A key feature of ORMs, whether Knex-style query builders or a Joist-style [domain models](https://joist-orm.io/modeling/why-entities/), is issuing queries: specifically the API or "DSL" (domain specific language) to "find rows" in the database.

An ORM's query DSL is usually one of it's most defining features (indeed for query-builder DSLs like Knex/Drizzle/Kesyey, that's really all the ORM is 😅), and so a common area of exploration & innovation, that can make-or-break the ergonomics of working with the ORM.

These DSLs can be as simple as "slightly decorated" SQL strings in [postgres.js](https://github.com/porsager/postgres):

```ts
const rows = await sql`SELECT * FROM users WHERE name = ${name}`;
```

To fluent "build SQL via method chaining" APIs like Knex or Kysely:

```ts
// Knex
await knex("users").where("name", "=", name);
// Kysely
await db.selectFrom('users').where('name', '=', name).execute();
// Drizzle
await db.select().from(users).where(eq(users.name, name));
```

To Joist's own `em.find`:

```ts
const authors = await em.find(User, { name });
```

Each ORM generally tries to provide "the most idiomatic query DSL possible", but of course this becomes a high-emotion topic because the interpretation of "idiomatic" depends on:

- What "looks idiomatic" in the host programming language

  I.e. an idiomatic DSL for TypeScript, looks different than an idiomatic DSL for Java, looks different than an idiomatic DSL for Golang.

  (In my opinion, this is why Prisma's circa-2021 experiment of a Rust-based engine to parlay into a "dual-language" TypeScript/Golang ORM was doomed from the start--the host languages of Golang & Typescript are extremely different in terms of taste & style.)

- What "looks idiomatic" depends on where the ORM sits on the "driver => query builder => domain model" spectrum.

  I.e. what looks idiomatic for a low-level node-pg/postgres.js driver will be different than a higher-level ActiveRecord/entity-based ORM like MikroORM or Joist. 

- What "looks idiomatic" is fundamentally a personal judgment call.

  (...except on Reddit, where only correct answer is "raw SQL". 💀)

That disclaimer aside, we'll make the case for Joist's claims to idiomacity, at least from where it sits on the "domain model" end of the ORM spectrum, through two patterns of queries:

1. Static Queries -- the query shape is always exactly the same, differing only in parameter values
2. Dynamic Queries -- the query shape is slightly different, with different joins and column conditions

Where by "shape" we mean "what columns are queried" and "what tables are joined".

## Static Queries

A static query is one that always uses exactly the same tables & conditions.

An example would be a `GET /oldBooks?authorId=1` endpoint that, for a given author, returns all books older than 10 years.

Although the `authorId` param might change, fundamentally the structure (tables and conditions) of the query will not.

We'll use this template of an endpoint implementation:

```ts
// `GET /oldBooks?authorId=1`
async function getOldBooks(params: { authorId: string }): Promise<Book[]> {
  // Add the ORM-specific impl here...
}
```

And then look at the query across a few different ORMs / DSL styles, first with postgres.js:

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

Or in Knex:

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

And Drizzle:

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

And MikroORM:

```ts title="MikroORM"
async function getOldBooks(params: OldBookParams): Promise<Book[]> {
  const { authorId } = params;
  return await em.find(Book, {
    author: authorId,
    publishedAt: { $lte: tenYearsAgo },
  });
}
```

And finally in Joist:

```ts title="Joist"
async function getOldBooks(params: OldBookParams): Promise<Book[]> {
  const { authorId } = params;
  return await em.find(Book, {
    author: authorId,
    publishedAt: { lte: tenYearsAgo },
  });
}
```

Both MikroORM and Joist share a fundamentally different "the query condition is a POJO literal" that is more succinct but also limiting b/c their `em.find` APIs are "only finding entities"--not doing arbitrary SQL statements.

For these initial "static queries" examples across the ORMs, in my opinion the queries are all pretty standard and could each be considered idiomatic in their own way.

## Dynamic Queries

Let's move on to dynamic queries, where, based on the params to our endpoint (or whatever business logic we're implementing), we have to _dynamically_ / _conditionally_ build up the query based on the input.

The example use case we'll use is a `GET /authors` endpoint, which always "returns authors", but can be queried with a variety of filter parameters--finding authors by attributes of their parent/publisher entity, or by attributes of their child/books entities.

We'll use this example typing of what the `getAuthors` query params might be, notice how each key is optional, denoting that clients may/may not set them:

```typescript
type AuthorsParams = {
  /** Return authors that match this name. */
  name?: string;
  /** Return authors who published with publishers of this name. */
  publisherName?: string;
  /** Return authors who published with publishers of this status. */
  publisherStatus?: string;
  /** Return authors with at least 1 book of this status. */
  bookStatus?: number;
  /** Return authors with at least 1 high-rated review, or a low-rated review when false. */
  highRating?: boolean;
};
```

> _Disclaimer: this "return authors with a publisher of this name" is not very pretty API design, I'm just using it as an adhoc example of a dynamic endpoint._

For this new endpoint, let's again see how we'd implement this query, across each of the ORMs.

Note that the biggest difference is that we'll now have to integrate this "conditional shape of the query" into each ORM's query syntax.

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

* We include a dummy `1 = 1` so that all our conditional predicates can always use an `AND` prefix.

  Without this hack, we'd have to dynamically track "what is the 1st predicate that needs `AND` added", which would be even more tedious (disclaimer: this hack was ChatGTP's idea 😅).

* Each conditional join check needs to know not just "are filters from my table in use" (i.e. if `bookStatus` is used, include `books`), but also "are filters from any tables *downstream of me* in use" (i.e. if `highRating` is used, include `books` so that the `book_reviews` join works).

Now Knex, which should be representative method-chaining style query builders:

```ts title="Knex"
async function getAuthors(filter: AuthorsParams): Promise<Author[]> {
  const { name, publisherName, publisherStatus, bookStatus, highRating } = filter;
  // Start building the query
  const query = knex<Author>('authors as a').distinct('a.*');
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

Now Prisma, using its typed relation filters:

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

MikroORM also uses a typed conditions object, which needs conditionally flushed out:

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

I discovered while writing this post that, by default, MikroORM treats `undefined` as `null` so this snippet above is necessary for the building `where` clause correctly.

However, they also have a `ignoreUndefinedInQuery: true` (see their [docs](https://mikro-orm.io/docs/configuration#ignoring-undefined-values-in-find-queries)) configuration flag that enables the same "pruning" capability we'll see in Joist's example below.

Joist & Mikro often share/swap innovations, so I'm not sure who "built this first" 😅 but it's great to see--my only nudge would be to flip the behavior to be the default, breaking changes be damned. 🙈

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

I know that we've seen a ton of code scroll by, but **stop and see how few conditionals are in the Joist snippet** compared to the other ORMs. 🎉

This is more pruning feature at work. Let's look at how it works.

## Joist's Trick: Usage Tracking

Joist's realization is that, for a majority of even "dynamic query" use cases, the _maximal structure_ of the query is still essentially static (just like the static queries from the previous section), but *parts within the structure* are "turned on/off" based on conditional input.

Most query DSLs cannot "turn on/off" parts of the query, making our own code handle this boilerplate via _language-level_ conditionals: `if` checks, ternaries, or altering the method chains (often the most complicated, in my experience).

With Joist, it does the opposite, and figures out which joins & conditions to "turn on/off" based on tracking the "usage" of each join & conditional.

To do that, we leverage one of JavaScript's core [wat](https://www.destroyallsoftware.com/talks/wat)-isms of having "oh no, both `null` and `undefined`?!? 😱", where for `em.find`:

- any condition with `null` (like `firstName: null`) is `IS NULL`
- any condition with `undefined` (like `firstName: undefined`) is "unused"
- any join with "only unused conditions" is itself "unused"

After dropping all unused joins/conditions from a query, we send it off to the database, with only the necessary joins & conditions remaining. 

Here are some examples of conditions that are either pruned, or not pruned, based on the values at runtime:

```ts title="Joist"
// Given two variables i.e. from incoming query params
const lastName = undefined;
const publisherId = null;
// When we execute this em.find, each condition is...
await em.find(Author, {
  name: { eq: undefined }, // pruned
  statusId: { in: undefined }, // pruned
  age: { gte: undefined }, // pruned
  lastName, // pruned
  statusId: null, // not pruned
  publisher: { id: publisherId }, // not pruned
});
```

:::tip[Info]

Joist also leverages `null` vs. `undefined` for [partial-update APIs](/features/partial-update-apis/), where calling `createOrUpdatePartial` with `{ firstName: undefined }` means "leave the `firstName` field alone", and `{ firstName: null }` means "unset".

This ends up working out really well with most web frameworks, GraphQL mutations, etc. that will deserialize a `SaveAuthor` command with `firstName: undefined` for the "the caller did not send this field" behavior.

:::

## Complex Conditions

So far we've looked at how Joist prunes its `em.find` "inline conditions", which are predicates contained directly in object literal passed to `em.find`, all of which become top-level `AND`s in the query.

If we need complex `AND`s and `OR`s, Joist has a `conditions` property that accepts `{ and: [...] }` and `{ or: [...] }` data structures, and these also support pruning:

```ts title="Joist"
const [a, b] = aliases(Author, Book);
// Find authors with an OR across a.lastName/b.title
await em.find(
  Author,
  // This 2nd arg is the "joins literal" that defines
 // the structure of all joins, rooted from the `authors` table
  {
    // `as` binds the `authors` table to our `a` const defined
    // above for later usage in the ANDs/ORs
    as: a,
    // These are inline conditions that become top-level ANDs
    firstName: { eq: "bob" }, // not pruned
    // This joins into books, and may/may not be pruned
    // based on the `conditions` param below -- in this example,
    // `b.title` is always used below, so `books` is always joined
    books: { as: b },
  },
  // This 3rd arg has `conditions` for complex ANDs/ORs conditions
  {
    conditions: {
      or: [
        a.lastName.eq(undefined), // pruned
        b.title.eq("foo"), // not pruned
      ],
    },
  },
);

// That got long, here's the same query, without inline comments
await em.find(
  Author,
  { as: a, firstName: { eq: "bob" }, books: { as: b } },
  { conditions: { or: [a.lastName.eq(undefined), b.title.eq("foo")] } },
);
```

As indicated by the comments in the snippet, any `.eq` or `.in` or `.gt` method call on a column alias like `a.lastName` or `b.title` that receives `undefined` will be pruned.

If an `{ or: [...] }` or `{ and: [...] }` list is empty (because all conditions within the list have themselves been pruned), the `OR` / `AND` clause will also be pruned. 

Putting it all together:

* The 2nd `em.find` arg is a "join literal" that declares "the maximal query structure"--all joins and conditions that might potentially be used.
* The join literal can have "simple inline" conditions
* The `conditions` param can have "complex" conditions
* Any condition/join clause that is passed unused is pruned

And that's it.

This setup lets Joist drive the "turn on/off" logic that previously our own code had to do, with repetitive/boilerplate language-level constructs.

:::tip

Today, Joist's `em.find` knowingly only supports "finding entities" and not arbitrary SQL statements.

In theory the same pruning concept should be applicable to low-level SQL queries, which we're tracking in [#188](https://github.com/joist-orm/joist-orm/issues/188), but lacking this has not been a major pain point to our day-to-day feature development, so we've not prioritized it yet.

:::

## Production Query Examples

To show how succinct Joist queries are in practice, here are two queries copy/pasted from our production codebase.

As a disclaimer, these are both from GraphQL query resolvers, b/c our primary codebase is a GraphQL monolith, but the patterns apply equally to REST endpoints or gRPC etc.

The first is for a `query { items }` that accepts a filter, where the `ItemFilter` defines 5 optional keys that the client can use in any combination:

```graphql title="GraphQL"
# I.e. `query { items(filter: { version: 2 }) { name } }
input ItemFilter {
  id: [ID!]
  version: [Int!]
  costCode: [ID!]
  isSelection: Boolean
  status: [ItemStatus!]
}
```

And it's implemented by a **1-liner** in our resolver:

```ts title="Joist"
export const items: Pick<QueryResolvers, "items"> = {
  items(root, { filter }, { em }) {
    const { costCode, version = [1], ...other } = filter ?? {};
    return em.findGql(Item, { ...other, costCode: { id: costCode, version } }, { orderBy: { name: "ASC" } });
  },
};
```

The 2nd example is a similar "query for the `CostCode` entity with some filters", but has a `OR` for one of its conditions, the `tradePartnerIds`:

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
        // The `WHERE` for tradePartnerIds requires joining down into several tables, so
        // setup those joins here, and let them be pruned if tradePartnerIds isn't used.
        // Specifically trades have Purchase Orders (Commitments) & Bids that each "have
        // cost codes", so we want to join from the Cost Code down to the trades usage/exposure
        // to the cost codes, so we can show them only cost codes they care about.
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
          // If we have any trade partner ids, we need to filter by them
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

This query is not "a 1-liner", *but* hopefully we can still envision how relatively clean it is, in terms of setting up the "static structure" in the join literal, and then letting the `or: [...]` on `tradePartnerIds` drive the conditionality without cluttering up our code.

It's also worth calling out the easy-to-miss `...others`, which pass "the rest of the filters" that map 1:1 between the GraphQL filter and the database, on into Joist for default handling.

This highlights a key principle of Joist: 80-90% of your API (whether a REST endpoint, gRPC service, or GraphQL type) is usually 80-90% 1:1 with the database, and so:

- The 80-90% 1:1 cases should be as succinct/boilerplate-free as possible,
- The 10-20% one-off cases should be doable without "fighting the framework".

## Disclaimer

We quickly noted this earlier, but Joist's `em.find` DSL does have one large disclaimer: it only supports fetching entire entities (i.e. `Author`s or `Book`s).

Currently, we do not support truly arbitrary SQL with aggregates like `SUM`s, `GROUP BY`s, etc that return arbitrary [POJO](https://masteringjs.io/tutorials/fundamentals/pojo)s of data.

This doesn't mean "your app can't use those SQL keywords"--our apps ofc have queries that need these SQL features--it just means that we use a lower-level query builder like Knex.

This has been solely a pragmatic decision--given Joist's focus on entities, we have not yet prioritized a low-level SQL builder (see [issue #188](https://github.com/joist-orm/joist-orm/issues/188) tracking it), as `em.find` "fetching entities" is what 95% of our codebase's queries want to do anyway.

Currently, for the 5% of our SQL queries that need SUMs/aggregates/group bys, we just drop down to Knex, albeit usually after using Joist's `buildKnexQuery` utility to take the `em.find`-style joins/conditions and bootstrap an initial Knex `QueryBuilder`, which we then mutate as needed.

That said, the core idea of "usage tracking" and "condition & join pruning" can apply to low-level queries as well, and will definitely be used in Joist's low-level SQL builder, when it shows up. And we anticipate this leading to the same best-in-class, idiomatic queries that we have with `em.find` today.

## Conclusion

This wraps up the post.

Personally, I feel like "building _dynamic_ queries" is often overlooked by ORM authors when creating query DSLs--almost like an afterthought.

My evidence for this is:

1. Just how painful dynamic queries can be in some ORMs. 

   We saw in the postgres.js, Knex, Prisma, and MikroORM examples above, how this "blows up" the query creation code with boilerplate, particularly with joins.

   To me, this is a tell the scenario wasn't considered as a first-class problem to solve when designing the DSL.

2. ORM tutorials & overviews often don't include examples on "how do I conditionally add ~3-4 joins to this query", and relegate it to FAQs or users figuring it out on their own.

Joist might have gotten lucky, in that idiomatic GraphQL queries have "optional filters" all the time, so this was an acute pain point for us to solve.

But we also took our time in designing the `em.find` API, and really took several years of "building day-to-day features" to drive & curate the `em.find` API, to end up where we're at.

