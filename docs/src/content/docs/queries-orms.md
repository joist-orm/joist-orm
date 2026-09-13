---
title: em.query vs. Other ORMs
description: The same group-by query written in Joist, Prisma, Drizzle, TypeORM, MikroORM, and Kysely
---

A scratch page comparing one `em.query` against the same query in other ORMs. The query is "the ten
largest first names, by book count, over authors of at least some age":

```sql
SELECT a.first_name AS name, COUNT(b.id) AS "bookCount"
FROM authors a
LEFT JOIN books b ON b.author_id = a.id
WHERE a.age >= $1
GROUP BY a.first_name
ORDER BY "bookCount" DESC
LIMIT 10;
```

## Joist

```ts
const [a, b] = tables(Author, Book);
const rows = await em.query({
  from: a,
  join: [{ left: b, on: b.author_id.eq(a.id) }],
  where: { and: [a.age.gte(minAge)] },
  groupBy: [a.first_name],
  select: { name: a.first_name, bookCount: b.id.count() },
  orderBy: { bookCount: "DESC" },
  limit: 10,
});
// { name: string; bookCount: number }[]
```

## Prisma

Prisma cannot express this. Its `groupBy` only groups by scalar fields of one model, and its `_count`
only counts rows of that model (or scalar non-nulls) — it cannot count a joined relation, and it
cannot group `Book` rows by `Author.firstName`. The equivalent is raw SQL:

```ts
const rows = await prisma.$queryRaw<{ name: string; bookCount: bigint }[]>`
  SELECT a.first_name AS name, COUNT(b.id) AS "bookCount"
  FROM authors a
  LEFT JOIN books b ON b.author_id = a.id
  WHERE a.age >= ${minAge}
  GROUP BY a.first_name
  ORDER BY "bookCount" DESC
  LIMIT 10`;
```

The closest type-safe Prisma is a _different_ query — one row per author, instead of one row per
first name:

```ts
const authors = await prisma.author.findMany({
  where: { age: { gte: minAge } },
  select: { firstName: true, _count: { select: { books: true } } },
  orderBy: { books: { _count: "desc" } },
  take: 10,
});
// { firstName: string; _count: { books: number } }[]
```

Two authors named "Bob" stay two rows here, where the Joist query merges them.

## Drizzle

```ts
const bookCount = count(books.id);

const rows = await db
  .select({ name: authors.firstName, bookCount })
  .from(authors)
  .leftJoin(books, eq(books.authorId, authors.id))
  .where(gte(authors.age, minAge))
  .groupBy(authors.firstName)
  .orderBy(desc(bookCount))
  .limit(10);
// { name: string; bookCount: number }[]
```

`desc(bookCount)` re-inlines `count(b.id)` into the `ORDER BY` instead of referencing the alias; use
``sql`"bookCount" desc` `` to order by the alias.

## TypeORM

```ts
const rows = await dataSource
  .createQueryBuilder(Author, "a")
  .leftJoin("a.books", "b")
  .select("a.first_name", "name")
  .addSelect("COUNT(b.id)", "bookCount")
  .where("a.age >= :minAge", { minAge })
  .groupBy("a.first_name")
  .orderBy(`"bookCount"`, "DESC")
  .limit(10)
  .getRawMany();
// any[] — and on Postgres bookCount comes back as a string
```

`getRawMany()` is where TypeORM drops type safety; `getRawMany<{ name: string; bookCount: string }>()`
only asserts the shape. Use `limit`, not `take` — `take` paginates entities.

## MikroORM

```ts
const rows = await em
  .createQueryBuilder(Author, "a")
  .select(["a.firstName as name", raw('count(b.id) as "bookCount"')])
  .leftJoin("a.books", "b")
  .where({ age: { $gte: minAge } })
  .groupBy("a.firstName")
  .orderBy({ [raw('"bookCount"')]: "DESC" })
  .limit(10)
  .execute<{ name: string; bookCount: string }[]>();
```

The `where` and `leftJoin` halves are genuinely typed: `{ age: { $gte: minAge } }` is checked against
`Author`, and `"a.books"` is a known relation, so they read close to `em.find`. The `select` and
`orderBy` halves are not: aggregates go through `raw()`, which is an opaque SQL fragment, the alias
has to be quoted by hand to survive Postgres case-folding, and the row type comes from the
`execute<T>()` generic, so nothing catches a renamed `firstName` or a dropped `count`.

## Kysely

```ts
const rows = await db
  .selectFrom("authors as a")
  .leftJoin("books as b", "b.author_id", "a.id")
  .select((eb) => ["a.first_name as name", eb.fn.count<number>("b.id").as("bookCount")])
  .where("a.age", ">=", minAge)
  .groupBy("a.first_name")
  .orderBy("bookCount", "desc")
  .limit(10)
  .execute();
// { name: string; bookCount: number }[]
```

Kysely is the closest match: it knows `bookCount` as an `ORDER BY` alias, and it infers the row type.
The `count<number>` is an assertion, though — Postgres returns `bigint`, so the value arrives as a
string unless you configure a `pg` type parser or a casting plugin.

## Notes

Ranked by how much of this one query stays type-safe: Kysely, Drizzle, MikroORM, TypeORM, Prisma.

Two things only Joist does here:

- `b.id.count()` decodes to a real `number`, and `a.id` style columns decode to tagged ids, because
  the projection reuses each column's entity serde instead of handing back driver values.
- The query is a POJO, so `where` conditions and their joins [prune](/features/queries-raw/#condition--join-pruning)
  when an input is `undefined`, with no conditional spreads.
