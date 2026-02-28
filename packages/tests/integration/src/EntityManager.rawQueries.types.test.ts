import { Expr, ExprBrand, Query, Subquery, alias, aliases, exprBrand, query } from "joist-orm";
import { Author, AuthorId, Book, Publisher, PublisherId } from "src/entities";
import { newEntityManager } from "src/testEm";

/**
 * Compile-time assertions for `em.query`: row types, left-join nullability, source keys, and the mistakes
 * that must not compile. Mirrors the levels in `em-query-composition.ts` against the real types.
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

  // Alias columns are typed expressions: decoded result type, nullability from the field, and the entity's
  // root type name as the source key; source-less expressions like `count` have a `never` source
  type _c1 = Expect<Equal<ResultOf<typeof a.firstName>, string>>;
  type _c2 = Expect<Equal<ResultOf<typeof a.age>, number | null>>;
  type _c3 = Expect<Equal<ResultOf<typeof a.id>, AuthorId>>;
  type _c4 = Expect<Equal<ResultOf<typeof b.author>, AuthorId>>;
  type _c5 = Expect<Equal<ResultOf<typeof a.publisher>, PublisherId | null>>;
  type _c6 = Expect<Equal<SourceOf<typeof a.firstName>, "Author">>;
  type _c7 = Expect<Equal<SourceOf<ReturnType<typeof b.id.count>>, never>>;

  // Entity mode returns the entity; POJO mode maps the select keys; ids decode to tagged id types
  const entities = em.query({ from: a, select: a });
  type _e = Expect<Equal<Rows<typeof entities>, Author>>;
  const pojo = em.query({ from: a, select: { id: a.id, name: a.firstName, age: a.age } });
  type _p = Expect<Equal<Rows<typeof pojo>, { id: AuthorId; name: string; age: number | null }>>;

  // A subquery's columns carry its `as` name as their source key, and `select: <subquery>` is `select *`
  const bookStats = query({
    from: b,
    groupBy: [b.author],
    select: { authorId: b.author, bookCount: b.id.count(), lastTitle: b.title.max() },
    as: "book_stats",
  });
  type _s1 = Expect<Equal<typeof bookStats.authorId, Expr<AuthorId, "book_stats">>>;
  type _s2 = Expect<Equal<typeof bookStats.bookCount, Expr<number, "book_stats">>>;
  type _s3 = Expect<Equal<typeof bookStats.lastTitle, Expr<string | null, "book_stats">>>;
  const star = em.query({ from: bookStats, select: bookStats });
  type _star = Expect<Equal<Rows<typeof star>, { authorId: AuthorId; bookCount: number; lastTitle: string | null }>>;

  // The join list decides nullability: the same column is `number` inner-joined and `number | null` left-joined
  const inner = em.query({
    from: a,
    join: [{ inner: bookStats, on: bookStats.authorId.eq(a.id) }],
    select: { name: a.firstName, bookCount: bookStats.bookCount },
  });
  type _inner = Expect<Equal<Rows<typeof inner>, { name: string; bookCount: number }>>;
  const left = em.query({
    from: a,
    join: [{ left: bookStats, on: bookStats.authorId.eq(a.id) }],
    select: { name: a.firstName, bookCount: bookStats.bookCount, safe: bookStats.bookCount.coalesce(0) },
  });
  type _left = Expect<Equal<Rows<typeof left>, { name: string; bookCount: number | null; safe: number }>>;

  // A left-joined entity alias nullifies only its own columns; a named self-join alias has its own key
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

  // Scalar subqueries are `R | null` and `coalesce` recovers `R`; `in` accepts a list subquery of the same id type
  const scalar = query({ from: b, where: { and: [b.author.eq(a.id)] }, select: b.id.count() });
  type _scalar = Expect<Equal<typeof scalar, Expr<number | null, never>>>;
  a.id.in(query({ from: b, select: b.author }));

  // A whole query is a value: `satisfies Query` keeps the literal shape, and `query()` / `em.query()` agree
  const q = { from: a, select: { name: a.firstName } } satisfies Query;
  const direct = em.query(q);
  type _q = Expect<Equal<Rows<typeof direct>, { name: string }>>;
  const built = query(q);
  type _built = Expect<Equal<typeof built, Subquery<{ name: string }, "?">>>;

  // The keyed orderBy form checks keys against select (or the entity's fields) and the direction literals
  em.query({ from: a, select: { name: a.firstName }, orderBy: { name: "ASC NULLS LAST" } });
  em.query({ from: a, select: a, orderBy: { firstName: "DESC" } });

  // Mistakes that must not compile
  // @ts-expect-error: an AuthorId column cannot be compared to a BookId column
  bookStats.authorId.eq(b.id);
  // @ts-expect-error: the subquery selects BookId, but a.id is an AuthorId column
  a.id.in(query({ from: b, select: b.id }));
  // @ts-expect-error: alias 'book_stats' is not in from/join
  em.query({ from: a, select: { bookCount: bookStats.bookCount } });
  // @ts-expect-error: select was typed too generically; use `satisfies Query` instead of `: Query`
  em.query({ from: a, select: { name: a.firstName } } as Query);
  // @ts-expect-error: `inner` and `left` are mutually exclusive
  em.query({ from: a, join: [{ inner: b, left: p, on: b.author.eq(a.id) }], select: { name: a.firstName } });
  // @ts-expect-error: `asc` and `desc` are mutually exclusive
  em.query({ from: a, select: { name: a.firstName }, orderBy: [{ asc: a.firstName, desc: a.age }] });
  // @ts-expect-error: 'age' is not a key of select
  em.query({ from: a, select: { name: a.firstName }, orderBy: { age: "ASC" } });
  // @ts-expect-error: directions are uppercase SQL literals
  em.query({ from: a, select: { name: a.firstName }, orderBy: { name: "asc" } });
  // @ts-expect-error: `sum` only exists on numeric columns
  a.firstName.sum();
  // @ts-expect-error: a top-level query has no `as`
  em.query({ from: a, select: { name: a.firstName }, as: "x" });
}

describe("EntityManager.rawQueries.types", () => {
  it("type-checks", () => {
    // The assertions above are checked by `tsc`; referencing the function keeps it from being flagged as unused
    expect(typeof typeAssertions).toBe("function");
  });
});
