import { expectTypeOf } from "expect-type";
import {
  type Expr,
  type ExprBrand,
  type Query,
  type Subquery,
  alias,
  type exprBrand,
  query,
  table,
  tables,
} from "joist-orm";
import { Author, type AuthorId, Book, Comment, Publisher, type PublisherId } from "src/entities";
import { newEntityManager } from "src/testEm";

describe("EntityManager.rawQueries.types", () => {
  it("type-checks", () => {
    // The assertions in `typeAssertions` are checked by `tsc`; referencing the function keeps it from being flagged as unused
    expect(typeof typeAssertions).toBe("function");
  });
});

/**
 * Compile-time assertions for `em.query`: row types, left-join nullability, source keys, and the mistakes
 * that must not compile.
 *
 * `tsc` is the test. The statements live in `typeAssertions`, which is never called, so importing this file
 * runs no queries; the one `it` keeps jest from complaining about an empty suite.
 */
async function typeAssertions() {
  const em = newEntityManager();
  const [a, b, p] = tables(Author, Book, Publisher);

  // === Table columns are typed expressions: `Expr<R, Src>` where `R` is the decoded result type and
  // === `Src` is the source key that left-join nullability and scope checking look up
  // A required primitive keeps its bare type
  expectTypeOf<ResultOf<typeof a.first_name>>().toEqualTypeOf<string>();
  // A nullable primitive carries `| null` from the field itself, before any joins are considered
  expectTypeOf<ResultOf<typeof a.age>>().toEqualTypeOf<number | null>();
  // The id column decodes to the entity's tagged id type, not `string`
  expectTypeOf<ResultOf<typeof a.id>>().toEqualTypeOf<AuthorId>();
  // An m2o FK column decodes to the *other* entity's id type
  expectTypeOf<ResultOf<typeof b.author_id>>().toEqualTypeOf<AuthorId>();
  // A nullable m2o FK is `| null`
  expectTypeOf<ResultOf<typeof a.publisher_id>>().toEqualTypeOf<PublisherId | null>();
  // The default source key is the entity's root type name (so CTI subtype/base aliases share one key)
  expectTypeOf<SourceOf<typeof a.first_name>>().toEqualTypeOf<"Author">();
  // Aggregates are source-less (`never`): a left join can never make `count(...)` itself null
  expectTypeOf<SourceOf<ReturnType<typeof b.id.count>>>().toEqualTypeOf<never>();

  // === The `select` shape decides the row type
  // Entity mode: a bare alias returns the entity itself, not a row of columns
  const entities = em.query({ from: a, select: a });
  expectTypeOf(entities).resolves.toEqualTypeOf<Author[]>();
  // POJO mode: one key per column, each with its decoded type (tagged ids, field nullability)
  const pojo = em.query({ from: a, select: { id: a.id, name: a.first_name, age: a.age } });
  expectTypeOf(pojo).resolves.toEqualTypeOf<{ id: AuthorId; name: string; age: number | null }[]>();

  // === `query(...)` turns the same POJO into a derived table with typed columns
  const bookStats = query({
    from: b,
    groupBy: [b.author_id],
    select: { authorId: b.author_id, bookCount: b.id.count(), lastTitle: b.title.max() },
    as: "book_stats",
  });
  // Each column keeps its inner result type and takes the `as` name as its source key
  expectTypeOf(bookStats.authorId).toEqualTypeOf<Expr<AuthorId, "book_stats">>();
  // `count()` is non-null inside the subquery (every group has rows)...
  expectTypeOf(bookStats.bookCount).toEqualTypeOf<Expr<number, "book_stats">>();
  // ...while `max()` is nullable even inside it (SQL `max` over an empty group)
  expectTypeOf(bookStats.lastTitle).toEqualTypeOf<Expr<string | null, "book_stats">>();
  // `arrayAgg()` keeps the element's own nullability, and is itself `| null` (zero rows aggregate as NULL)
  expectTypeOf<ReturnType<typeof b.title.arrayAgg>>().toEqualTypeOf<Expr<string[] | null, "Book">>();
  expectTypeOf<ReturnType<typeof a.age.arrayAgg>>().toEqualTypeOf<Expr<(number | null)[] | null, "Author">>();
  // `select: <subquery>` is that table's `select *`, returning its full row type
  const star = em.query({ from: bookStats, select: bookStats });
  expectTypeOf(star).resolves.toEqualTypeOf<{ authorId: AuthorId; bookCount: number; lastTitle: string | null }[]>();

  // === The join list decides nullability: the same column, inner- vs left-joined
  // Inner join: the row is guaranteed a match, so `bookCount` stays `number`
  const inner = em.query({
    from: a,
    join: [{ inner: bookStats, on: bookStats.authorId.eq(a.id) }],
    select: { name: a.first_name, bookCount: bookStats.bookCount },
  });
  expectTypeOf(inner).resolves.toEqualTypeOf<{ name: string; bookCount: number }[]>();
  // Left join: the same column picks up `| null`, and `.coalesce(0)` recovers the non-null type
  const left = em.query({
    from: a,
    join: [{ left: bookStats, on: bookStats.authorId.eq(a.id) }],
    select: { name: a.first_name, bookCount: bookStats.bookCount, safe: bookStats.bookCount.coalesce(0) },
  });
  expectTypeOf(left).resolves.toEqualTypeOf<{ name: string; bookCount: number | null; safe: number }[]>();

  // === Nullability is per-source: a left join nullifies only its own columns
  // `table(Author, "m")` gives the self-join its own source key, so left-joining the mentor
  // nullifies `m.first_name` but not the mentee's `a.first_name` (both are Author columns)
  const m = table(Author, "m");
  const mentors = em.query({
    from: a,
    join: [
      { left: m, on: a.mentor_id.eq(m.id) },
      { left: p, on: a.publisher_id.eq(p.id) },
    ],
    select: { mentee: a.first_name, mentor: m.first_name, publisher: p.name },
  });
  expectTypeOf(mentors).resolves.toEqualTypeOf<{ mentee: string; mentor: string | null; publisher: string | null }[]>();

  // === Subqueries as expressions
  // A single-expression select is a scalar subquery: `| null` because it can return no row
  const scalar = query({ from: b, where: { and: [b.author_id.eq(a.id)] }, select: b.id.count() });
  expectTypeOf(scalar).toEqualTypeOf<Expr<number | null, never>>();
  // A single-column subquery is an IN-list target, checked against the column's id type
  a.id.in(query({ from: b, select: b.author_id }));

  // === A whole query is a value
  // `satisfies Query` checks the shape but keeps the literal `select` type...
  const q = { from: a, select: { name: a.first_name }, orderBy: [{ name: "ASC" }, { asc: a.age }] } satisfies Query;
  const direct = em.query(q);
  expectTypeOf(direct).resolves.toEqualTypeOf<{ name: string }[]>();
  // ...and `query(q)` builds the same rows as `em.query(q)` ran directly; anonymous tables share the "?" key
  const built = query(q);
  expectTypeOf(built).toEqualTypeOf<Subquery<{ name: string }, "?">>();

  // === The keyed orderBy form
  // Keys must be keys of `select`, with uppercase SQL direction literals (NULLS FIRST/LAST suffixes allowed)
  em.query({ from: a, select: { name: a.first_name }, orderBy: { name: "ASC NULLS LAST" } });
  // In entity mode the keys are the table's sortable columns instead
  em.query({ from: a, select: a, orderBy: { first_name: "DESC" } });
  // Keyed and expression entries can share a readonly array without widening the selected row type
  const ordered = em.query({
    from: a,
    select: { name: a.first_name, age: a.age },
    orderBy: [undefined, { age: undefined }, { age: "DESC" }, { asc: a.id }, { name: "ASC NULLS LAST" }] as const,
  });
  expectTypeOf(ordered).resolves.toEqualTypeOf<{ name: string; age: number | null }[]>();
  // Physical columns and derived-table output names are also accepted in keyed array entries
  em.query({ from: a, select: a, orderBy: [{ first_name: "DESC" }, { age: "ASC NULLS LAST" }] });
  const orderedStats = em.query({ from: bookStats, select: bookStats, orderBy: [{ bookCount: "DESC" }] });
  expectTypeOf(orderedStats).resolves.toEqualTypeOf<
    { authorId: AuthorId; bookCount: number; lastTitle: string | null }[]
  >();
  // query() shares the same orderBy array support and keeps its derived-table row type
  const orderedNames = query({
    from: a,
    select: { name: a.first_name },
    orderBy: [{ asc: a.age }, { name: "ASC" }],
  });
  expectTypeOf(orderedNames).toEqualTypeOf<Subquery<{ name: string }, "?">>();

  // === A single bare condition works for where/having, no `{ and: [...] }` wrapper needed
  em.query({ from: a, where: a.age.gte(18), select: a });

  // === Soft deletes: `softDeletes` takes em.find's two modes, defaulting to "exclude"
  em.query({ from: a, select: a, softDeletes: "include" });

  // === Polymorphic references accept an id subquery in `in`; the select column picks the component
  const [c] = tables(Comment);
  c.parent.in(query({ from: a, select: a.id }));
  c.parent.in(query({ from: b, select: b.author_id }));

  // Given a Comment table whose parent can reference an Author or another entity
  // When selecting the physical Author component rather than the parent relationship
  const parentIds = em.query({ from: c, select: { authorId: c.parent_author_id } });
  // Then the component keeps its Author id domain and physical column nullability
  expectTypeOf(parentIds).resolves.toEqualTypeOf<{ authorId: AuthorId | null }[]>();

  // Given an Author alias for entity-shaped find filters
  const findAuthor = alias(Author);
  // And a Book table with separate relationship and physical FK members
  // Then the alias is not a SQL query source or mutation target
  // @ts-expect-error: find aliases are not table sources
  em.query({ from: findAuthor, select: { name: a.first_name } });
  // @ts-expect-error: find aliases are not INSERT targets
  em.execute({ insert: findAuthor, values: [] });
  // @ts-expect-error: find aliases are not UPDATE targets
  em.execute({ update: findAuthor, set: { first_name: "updated" } });
  // @ts-expect-error: find aliases are not DELETE targets
  em.execute({ delete: findAuthor });
  // @ts-expect-error: a reference relationship is join-only, not a selectable expression
  em.query({ from: b, select: { author: b.author } });
  // @ts-expect-error: compare the physical author_id column, not the relationship
  b.author.eq(a.id);

  // === Relationship join sugar: the relation is the join factory, and the join kind follows the
  // === relation's nullability, so the row types come out right with no annotations
  // A collection (`books`) and a nullable reference (`publisher`) default to LEFT: their columns gain `| null`
  const sugar = em.query({
    from: a,
    join: [a.books.as(b), a.publisher.as(p)],
    select: { name: a.first_name, title: b.title, publisher: p.name },
  });
  expectTypeOf(sugar).resolves.toEqualTypeOf<{ name: string; title: string | null; publisher: string | null }[]>();
  // A required reference (`book.author`) defaults to INNER: `author` stays non-null
  const requiredInner = em.query({ from: b, join: [b.author.as(a)], select: { title: b.title, author: a.first_name } });
  expectTypeOf(requiredInner).resolves.toEqualTypeOf<{ title: string; author: string }[]>();
  // `.inner(...)` overrides a collection's LEFT default, so `title` stays non-null
  const withBooks = em.query({ from: a, join: [a.books.inner(b)], select: { title: b.title } });
  expectTypeOf(withBooks).resolves.toEqualTypeOf<{ title: string }[]>();
  // An o2o (`book.sequel`) is LEFT like any collection; the self-join needs its own named alias
  const s = table(Book, "s");
  const withSequel = em.query({ from: b, join: [b.sequel.as(s)], select: { title: b.title, sequel: s.title } });
  expectTypeOf(withSequel).resolves.toEqualTypeOf<{ title: string; sequel: string | null }[]>();

  // === Mistakes that must not compile
  // Given a nonliteral Author read carrying an unsupported CTE clause
  const withCte = { from: a, select: { name: a.first_name }, with: [] };
  // And an otherwise valid compound with that invalid later operand
  const nestedCte = { unionAll: [q, withCte] } as const;
  // And a compound mixed with a mutation operation
  const compoundMutation = { union: [q, q], insert: a } as const;
  // When checking public overloads rather than internal clause-check types
  // Then nonliteral inputs cannot hide unsupported clauses
  // @ts-expect-error: ordinary read values do not support CTE clauses
  query(withCte);
  // @ts-expect-error: nested operands must reject unsupported clauses
  query(nestedCte);
  // @ts-expect-error: execution checks nested nonliteral clauses too
  em.query(nestedCte);
  // @ts-expect-error: a nonliteral compound cannot also be an INSERT
  query(compoundMutation);
  // And query-clause words remain legal as projected data keys
  const keywords = query({ from: a, select: { with: a.first_name, select: a.first_name, delete: a.first_name } });
  expectTypeOf(em.query(keywords)).resolves.toEqualTypeOf<{ with: string; select: string; delete: string }[]>();

  // @ts-expect-error: an AuthorId column cannot be compared to a BookId column
  bookStats.authorId.eq(b.id);
  // @ts-expect-error: the subquery selects BookId, but a.id is an AuthorId column
  a.id.in(query({ from: b, select: b.id }));
  // @ts-expect-error: alias 'book_stats' is not in from/join (the scope check names the missing alias)
  em.query({ from: a, select: { bookCount: bookStats.bookCount } });
  // @ts-expect-error: a source-shaped select must be the from; 'Book' is a joined source
  em.query({ from: a, join: [{ left: b, on: b.author_id.eq(a.id) }], select: b });
  // @ts-expect-error: a joined subquery cannot be selected either; select its columns individually
  em.query({ from: a, join: [{ left: bookStats, on: bookStats.authorId.eq(a.id) }], select: bookStats });
  // @ts-expect-error: select was typed too generically; use `satisfies Query` instead of `: Query`
  em.query({ from: a, select: { name: a.first_name } } as Query);
  // @ts-expect-error: `inner` and `left` are mutually exclusive within one join entry
  em.query({ from: a, join: [{ inner: b, left: p, on: b.author_id.eq(a.id) }], select: { name: a.first_name } });
  // @ts-expect-error: `asc` and `desc` are mutually exclusive within one orderBy entry
  em.query({ from: a, select: { name: a.first_name }, orderBy: [{ asc: a.first_name, desc: a.age }] });
  // @ts-expect-error: keyed orderBy only accepts keys of select, and 'age' was not selected
  em.query({ from: a, select: { name: a.first_name }, orderBy: { age: "ASC" } });
  // @ts-expect-error: keyed orderBy directions are uppercase SQL literals, i.e. "ASC" not "asc"
  em.query({ from: a, select: { name: a.first_name }, orderBy: { name: "asc" } });
  // @ts-expect-error: keyed array entries only accept selected keys, even alongside expression entries
  em.query({ from: a, select: { name: a.first_name }, orderBy: [{ asc: a.age }, { age: "ASC" }] });
  // @ts-expect-error: keyed array directions must also be uppercase SQL literals
  em.query({ from: a, select: { name: a.first_name }, orderBy: [{ name: "asc" }] });
  // @ts-expect-error: entity collections are not sortable fields
  em.query({ from: a, select: a, orderBy: [{ books: "ASC" }] });
  // @ts-expect-error: scalar selects have no keys to address in orderBy
  em.query({ from: a, select: a.first_name, orderBy: [{ name: "ASC" }] });
  // @ts-expect-error: query() also rejects keys that are absent from select
  query({ from: a, select: { name: a.first_name }, orderBy: [{ age: "ASC" }] });
  // @ts-expect-error: keyed and expression sorts must be separate array entries
  em.query({ from: a, select: { name: a.first_name }, orderBy: [{ asc: a.age, name: "ASC" }] });
  const unionSelect: Query<{ name: typeof a.first_name } | { age: typeof a.age }> = {
    from: a,
    select: { name: a.first_name },
    // @ts-expect-error: a union of select shapes must still reject a combined keyed/expression entry
    orderBy: [{ asc: a.age, name: "ASC" }],
  };
  em.query(unionSelect);
  // @ts-expect-error: `sum` only exists on numeric columns
  a.first_name.sum();
  // @ts-expect-error: a top-level query has no `as`; only subqueries built with `query(...)` are named
  em.query({ from: a, select: { name: a.first_name }, as: "x" });
  // @ts-expect-error: `books` joins a Table<Book>, not a Table<Publisher>
  a.books.as(p);
  // @ts-expect-error: a collection has no expression methods, so it cannot be selected
  em.query({ from: a, select: { books: a.books } });
  // @ts-expect-error: softDeletes only accepts em.find's "include" | "exclude"
  em.query({ from: a, select: a, softDeletes: "only" });
  // @ts-expect-error: the subquery selects numbers, not ids of Comment.parent's component entities
  // (a *string* column cannot be rejected: Joist ids are flavored strings, so `string` stays assignable)
  c.parent.in(query({ from: b, select: b.order }));
}

type ResultOf<E> = E extends { readonly [exprBrand]: ExprBrand<infer R, any> } ? R : never;
type SourceOf<E> = E extends { readonly [exprBrand]: ExprBrand<any, infer Src> } ? Src : never;
