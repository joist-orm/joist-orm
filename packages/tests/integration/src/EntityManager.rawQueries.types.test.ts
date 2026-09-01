import { Expr, ExprBrand, Query, Subquery, alias, aliases, exprBrand, query } from "joist-orm";
import { Author, AuthorId, Book, Publisher, PublisherId } from "src/entities";
import { newEntityManager } from "src/testEm";

/**
 * Compile-time assertions for `em.query`: row types, left-join nullability, source keys, and the mistakes
 * that must not compile.
 *
 * `tsc` is the test. The statements live in `typeAssertions`, which is never called, so importing this file
 * runs no queries; the one `it` keeps jest from complaining about an empty suite.
 */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type Rows<P> = P extends Promise<(infer R)[]> ? R : never;
type ResultOf<E> = E extends { readonly [exprBrand]: ExprBrand<infer R, any> } ? R : never;
type SourceOf<E> = E extends { readonly [exprBrand]: ExprBrand<any, infer Src> } ? Src : never;

async function typeAssertions() {
  const em = newEntityManager();
  const [a, b, p] = aliases(Author, Book, Publisher);

  // === Alias columns are typed expressions: `Expr<R, Src>` where `R` is the decoded result type and
  // === `Src` is the source key that left-join nullability and scope checking look up
  // A required primitive keeps its bare type
  type _c1 = Expect<Equal<ResultOf<typeof a.firstName>, string>>;
  // A nullable primitive carries `| null` from the field itself, before any joins are considered
  type _c2 = Expect<Equal<ResultOf<typeof a.age>, number | null>>;
  // The id column decodes to the entity's tagged id type, not `string`
  type _c3 = Expect<Equal<ResultOf<typeof a.id>, AuthorId>>;
  // An m2o FK column decodes to the *other* entity's id type
  type _c4 = Expect<Equal<ResultOf<typeof b.author>, AuthorId>>;
  // A nullable m2o FK is `| null`
  type _c5 = Expect<Equal<ResultOf<typeof a.publisher>, PublisherId | null>>;
  // The default source key is the entity's root type name (so CTI subtype/base aliases share one key)
  type _c6 = Expect<Equal<SourceOf<typeof a.firstName>, "Author">>;
  // Aggregates are source-less (`never`): a left join can never make `count(...)` itself null
  type _c7 = Expect<Equal<SourceOf<ReturnType<typeof b.id.count>>, never>>;

  // === The `select` shape decides the row type
  // Entity mode: a bare alias returns the entity itself, not a row of columns
  const entities = em.query({ from: a, select: a });
  type _e = Expect<Equal<Rows<typeof entities>, Author>>;
  // POJO mode: one key per column, each with its decoded type (tagged ids, field nullability)
  const pojo = em.query({ from: a, select: { id: a.id, name: a.firstName, age: a.age } });
  type _p = Expect<Equal<Rows<typeof pojo>, { id: AuthorId; name: string; age: number | null }>>;

  // === `query(...)` turns the same POJO into a derived table with typed columns
  const bookStats = query({
    from: b,
    groupBy: [b.author],
    select: { authorId: b.author, bookCount: b.id.count(), lastTitle: b.title.max() },
    as: "book_stats",
  });
  // Each column keeps its inner result type and takes the `as` name as its source key
  type _s1 = Expect<Equal<typeof bookStats.authorId, Expr<AuthorId, "book_stats">>>;
  // `count()` is non-null inside the subquery (every group has rows)...
  type _s2 = Expect<Equal<typeof bookStats.bookCount, Expr<number, "book_stats">>>;
  // ...while `max()` is nullable even inside it (SQL `max` over an empty group)
  type _s3 = Expect<Equal<typeof bookStats.lastTitle, Expr<string | null, "book_stats">>>;
  // `select: <subquery>` is that table's `select *`, returning its full row type
  const star = em.query({ from: bookStats, select: bookStats });
  type _star = Expect<Equal<Rows<typeof star>, { authorId: AuthorId; bookCount: number; lastTitle: string | null }>>;

  // === The join list decides nullability: the same column, inner- vs left-joined
  // Inner join: the row is guaranteed a match, so `bookCount` stays `number`
  const inner = em.query({
    from: a,
    join: [{ inner: bookStats, on: bookStats.authorId.eq(a.id) }],
    select: { name: a.firstName, bookCount: bookStats.bookCount },
  });
  type _inner = Expect<Equal<Rows<typeof inner>, { name: string; bookCount: number }>>;
  // Left join: the same column picks up `| null`, and `.coalesce(0)` recovers the non-null type
  const left = em.query({
    from: a,
    join: [{ left: bookStats, on: bookStats.authorId.eq(a.id) }],
    select: { name: a.firstName, bookCount: bookStats.bookCount, safe: bookStats.bookCount.coalesce(0) },
  });
  type _left = Expect<Equal<Rows<typeof left>, { name: string; bookCount: number | null; safe: number }>>;

  // === Nullability is per-source: a left join nullifies only its own columns
  // `alias(Author, "m")` gives the self-join its own source key, so left-joining the mentor
  // nullifies `m.firstName` but not the mentee's `a.firstName` (both are Author columns)
  const m = alias(Author, "m");
  const mentors = em.query({
    from: a,
    join: [
      { left: m, on: a.mentor.eq(m.id) },
      { left: p, on: a.publisher.eq(p.id) },
    ],
    select: { mentee: a.firstName, mentor: m.firstName, publisher: p.name },
  });
  type _m = Expect<Equal<Rows<typeof mentors>, { mentee: string; mentor: string | null; publisher: string | null }>>;

  // === Subqueries as expressions
  // A single-expression select is a scalar subquery: `| null` because it can return no row
  const scalar = query({ from: b, where: { and: [b.author.eq(a.id)] }, select: b.id.count() });
  type _scalar = Expect<Equal<typeof scalar, Expr<number | null, never>>>;
  // A single-column subquery is an IN-list target, checked against the column's id type
  a.id.in(query({ from: b, select: b.author }));

  // === A whole query is a value
  // `satisfies Query` checks the shape but keeps the literal `select` type...
  const q = { from: a, select: { name: a.firstName } } satisfies Query;
  const direct = em.query(q);
  type _q = Expect<Equal<Rows<typeof direct>, { name: string }>>;
  // ...and `query(q)` builds the same rows as `em.query(q)` ran directly; anonymous tables share the "?" key
  const built = query(q);
  type _built = Expect<Equal<typeof built, Subquery<{ name: string }, "?">>>;

  // === The keyed orderBy form
  // Keys must be keys of `select`, with uppercase SQL direction literals (NULLS FIRST/LAST suffixes allowed)
  em.query({ from: a, select: { name: a.firstName }, orderBy: { name: "ASC NULLS LAST" } });
  // In entity mode the keys are the entity's sortable fields instead
  em.query({ from: a, select: a, orderBy: { firstName: "DESC" } });

  // === Relationship join sugar: the relation is the join factory, and the join kind follows the
  // === relation's nullability, so the row types come out right with no annotations
  // A collection (`books`) and a nullable reference (`publisher`) default to LEFT: their columns gain `| null`
  const sugar = em.query({
    from: a,
    join: [a.books.as(b), a.publisher.as(p)],
    select: { name: a.firstName, title: b.title, publisher: p.name },
  });
  type _sugar = Expect<Equal<Rows<typeof sugar>, { name: string; title: string | null; publisher: string | null }>>;
  // A required reference (`book.author`) defaults to INNER: `author` stays non-null
  const requiredInner = em.query({ from: b, join: [b.author.as(a)], select: { title: b.title, author: a.firstName } });
  type _ri = Expect<Equal<Rows<typeof requiredInner>, { title: string; author: string }>>;
  // `.inner(...)` overrides a collection's LEFT default, so `title` stays non-null
  const withBooks = em.query({ from: a, join: [a.books.inner(b)], select: { title: b.title } });
  type _wb = Expect<Equal<Rows<typeof withBooks>, { title: string }>>;
  // An o2o (`book.sequel`) is LEFT like any collection; the self-join needs its own named alias
  const s = alias(Book, "s");
  const withSequel = em.query({ from: b, join: [b.sequel.as(s)], select: { title: b.title, sequel: s.title } });
  type _o2o = Expect<Equal<Rows<typeof withSequel>, { title: string; sequel: string | null }>>;

  // === Mistakes that must not compile
  // @ts-expect-error: an AuthorId column cannot be compared to a BookId column
  bookStats.authorId.eq(b.id);
  // @ts-expect-error: the subquery selects BookId, but a.id is an AuthorId column
  a.id.in(query({ from: b, select: b.id }));
  // @ts-expect-error: alias 'book_stats' is not in from/join (the scope check names the missing alias)
  em.query({ from: a, select: { bookCount: bookStats.bookCount } });
  // @ts-expect-error: select was typed too generically; use `satisfies Query` instead of `: Query`
  em.query({ from: a, select: { name: a.firstName } } as Query);
  // @ts-expect-error: `inner` and `left` are mutually exclusive within one join entry
  em.query({ from: a, join: [{ inner: b, left: p, on: b.author.eq(a.id) }], select: { name: a.firstName } });
  // @ts-expect-error: `asc` and `desc` are mutually exclusive within one orderBy entry
  em.query({ from: a, select: { name: a.firstName }, orderBy: [{ asc: a.firstName, desc: a.age }] });
  // @ts-expect-error: keyed orderBy only accepts keys of select, and 'age' was not selected
  em.query({ from: a, select: { name: a.firstName }, orderBy: { age: "ASC" } });
  // @ts-expect-error: keyed orderBy directions are uppercase SQL literals, i.e. "ASC" not "asc"
  em.query({ from: a, select: { name: a.firstName }, orderBy: { name: "asc" } });
  // @ts-expect-error: `sum` only exists on numeric columns
  a.firstName.sum();
  // @ts-expect-error: a top-level query has no `as`; only subqueries built with `query(...)` are named
  em.query({ from: a, select: { name: a.firstName }, as: "x" });
  // @ts-expect-error: `books` joins an Alias<Book>, not an Alias<Publisher>
  a.books.as(p);
  // @ts-expect-error: a collection has no expression methods, so it cannot be selected
  em.query({ from: a, select: { books: a.books } });
}

describe("EntityManager.rawQueries.types", () => {
  it("type-checks", () => {
    // The assertions above are checked by `tsc`; referencing the function keeps it from being flagged as unused
    expect(typeof typeAssertions).toBe("function");
  });
});
