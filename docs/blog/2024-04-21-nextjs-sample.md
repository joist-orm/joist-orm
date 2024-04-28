---
title: New NextJS Sample App
description: We've added a new NextJS sample app to the Joist repository.
slug: nextjs-sample-app
authors:
  - name: Stephen Haberman
    url: https://github.com/stephenh
    image_url: https://github.com/stephenh.png
tags: []
---

We've added a new [NextJS + Joist](https://github.com/joist-orm/joist-nextjs-sample/) sample app that shows how Joist can be used in a NextJS application, with several benefits:

- Automatic N+1 Prevention
- JSON Payload/Props Creation
- Optional Join-based Preloading

This post gives a short overview; if you'd like to watch a video, we also have a [YouTube video](https://youtu.be/H_qJdKUS9D0) that walks through the sample app.

## Two Render Tree Approaches

While building the sample app, we found two fundamental ways of structuring a NextJS app's render tree:

1. Fewer React Server Components, that prop drill data to the Client Components
   - Shown on the left, see `author-rcc-card.tsx` and `book-rcc-preview.tsx`
2. Mostly React Server Components, with Client Components only at the bottom
   - Shown on the right, see `author-rsc-card.tsx` and `book-rsc-preview.tsx`

<div style={{ padding: '24px' }}>
  <img src="/images/nextjs-sample-single-multiple-rscs.png" />
</div>

The top-level `Table` / `table.tsx` component renders each of these side-by-side, so we can see the differences, and observe some pros/cons of each approach.

- With mostly RSC components, it's easy to decompose data loading away from the top-level component.

  For example, the `AuthorRscCard` can make its own data loading calls, and even if it's render many pages on the page, Joist will de-dupe across the `N` sibling `AuthorRscCard`s, and batch into a single SQL call.

  ```tsx
  type AuthorCardProps = {
    /** RSCs can accept the domain model enities as a prop. */
    author: Author;
    addBook: (id: string) => Promise<void>;
  };

  /** The RSC version of AuthorCard can load it's own data. */
  export async function AuthorRscCard({ author, addBook }: AuthorCardProps) {
    // This will be auto-batched if many cards render at once
    const books = await author.books.load();
    // Or if you wanted a tree of data, this will also be auto-batched
    const loaded = await author.populate({ books: { reviews: "ratings" } });
    return <div>...jsx</div>;
  }
  ```

  This is nice because it allows the `AuthorRscCard` to be more self-sufficient, and allow the parent table component to be unaware of its children loading details.

- With mostly Client components, the opposite happens, and only the parent can make database / `EntityManager` calls, and so is responsible for loading all the data for its children, and passing it as JSON via props:

  ```tsx
  type AuthorCardProps = {
    /** RCCs must accept a POJO of `Author` + all nested data. */
    author: AuthorPayload;
    addBook: (id: string) => Promise<void>;
  };

  /** The RCC version of AuthorCard accepts the `AuthorPayload`. */
  export function AuthorRccCard({ author, addBook }: AuthorCardProps) {
    // can only use data already available on `author` 
  }
  ```

  Even though the up-front data load can become awkward, it does give more opportunities for optimizations; for example Joist can use join-based preloading to load a single tree of `Author` + `Book` + `Review` entities in a single SQL call, which is even better optimization than the "one query per layer" N+1 prevention of the RSC-based approach.

## Automatic N+1 Prevention

In either approach, Joist's N+1 prevention auto-batches database calls, even if they are made across separate component renders. I.e. in the RSC components:

- The top-level `Table` component makes 1 SQL call for all `Author` entities.
- All 2nd-level `AuthorRscCard` cards each make their own `author.books.load()` (or `author.populate(...)`) call, but because they're all rendered in the same event loop, Joist batches all the `load` calls into 1 SQL call
- Any 3rd-level components would have their `load` calls batched as well.

In the React Client Component approach, this auto-batching is admittedly not as necessary, assuming a singular top-level component, like `Table`, loads all the data at once anyway (although, as mentioned later, Joist can optimize that as well).

See the [Avoiding N+1s](/docs/goals/avoiding-n-plus-1s) section of our docs for more information.

## JSON Payload/Props Creation

Since the client components cannot make their own async data calls, the top-level `Table` components is responsible for loading all the data into a JSON payload, and passing it down to the children as props.

Joist entities have an easy way of doing this is, via a `toJSON` method that takes the shape of data to create:

```ts
// Define the shape of data to create
export const authorHint = {
  id: true,
  firstName: true,
  books: {
    id: true,
    title: true,
    reviews: ["id", "rating"],
  },
  customField: (a) => a.id + a.title,
} satisfies JsonHint<Author>;

// This typedef can be used in the client-side props, or to match any
// endpoint-based respones types like for REST/OpenAPI.
export type AuthorPayload = JsonPayload<Author, typeof authorHint>;

const payload = await a.toJSON(authorHint);
```

The `toJSON` implementation will:

- Load any relations that are not yet loaded from the database
- Output only the keys that are requested in the `authorHint`
- Call any lambdas like `customField` to generate custom values

As with previous examples, all data loading is N+1 safe, and also potentially join-based preloaded.

See the [toJSON](/docs/advanced/json-payloads) docs for more information.

:::info

This recursive `toJSON` payload generation is a relatively new feature of Joist, so if you have feature ideas that would make it more useful, please let us know!

:::

## Join-Based Preloading

The last optimization that Joist can do is join-based preloading, which can be used in either the RSC or RCC approach.

This is also a newer feature that requires opt-ing in to, but in `em.ts` you can add a `preloadPlugin`:

```ts
/** Returns this request's `EntityManager` instance. */
export const getEm = cache(() => {
  // Opt-in to preloading
  const preloadPlugin = new JsonAggregatePreloader();
  return new EntityManager({}, { driver, preloadPlugin });
});
```

This will allow Joist to load a deep tree/subgraph of entities in a single SQL call.

For example, normally a Joist `em.find` a call like:

```ts
const a = await em.find(
  Author,
  { id: 1 },
  {populate: { books: "reviews" } },
);
// Now access all the data in memory
console.log(a.books.get[0].reviews.get[0].rating)
```

Will issue three SQL calls:

```sql
SELECT * FROM authors WHERE id = 1;
SELECT * FROM books WHERE author_id = 1;
SELECT * FROM reviews WHERE book_id IN (1, 2, 3, ...);
```

But with the `preloadPlugin` enabled, it will use a single SQL call that uses `CROSS JOIN LATERAL` and `json_agg` to return the author's books, and the book's reviews (omitted for brevity) in a single row:

```sql
select a.id, _b._ as _b from authors as a
  cross join lateral
    -- create a tuple for each book, and aggregate then into an array of books
    select json_agg(json_build_array(_b.id, _b.title, _b.foreword, _b.author_id) order by _b.id) as _
    from books _b
    where _b.author_id = a.id
  ) _b
  where a.id = ? limit ?
```

:::info

Joist's join-based preloading is still a beta feature, so if you run into any issues, please let us know!

:::

## What about Complex Queries?

So far, our queries have focused on loading "just entities", and then putting those on the wire (or rendering them to HTML).

This is because Joist's focus is on building robust domain models, and specifically helping solve the "write-side" of your application's business logic (running the correct [validation rules](/docs/modeling/validation-rules), [lifecycle hooks](/docs/modeling/lifecycle-hooks), [reactive updates](/docs/modeling/reactive-fields)), and less so on the "read-side" of complex queries (i.e. that using aggregates using `GROUP BY`, multiple nested subqueries/projections/etc.).

As such, Joist does not yet have a sophisticated query builder that can create arbitrary SQL queries, like Kysley or Drizzle.

Instead, Joist encourages an approach that uses its robust write-side features to create materialized columns in the database, such that the majority of your pages/responses really can be served by "super simple `SELECT` statements", instead of using complicated queries to calculate aggregates on-the-fly.

Although you can of course use both approaches, and just use a lower-level query builder where needed.

## Sample App Feedback

Joist's roots come from the GraphQL world, so this sample app was our first foray into using it for a NextJS application. If we've missed any key features that would make it easier to use Joist in a NextJS app, please let us know!
