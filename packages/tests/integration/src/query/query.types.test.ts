import { expectTypeOf } from "expect-type";
import {
  type ColumnCondition,
  type ExistsQuery,
  type Expr,
  type ExprBrand,
  type ExpressionCondition,
  type ExpressionFilter,
  type Loaded,
  type PredicateBrand,
  type Query,
  type QueryCondition,
  type RawCondition,
  type ScalarQuery,
  type SqlCondition,
  type SqlPredicate,
  type Subquery,
  alias,
  declareTable,
  expr,
  type exprBrand,
  getAliasMgmt,
  query,
  skipCondition,
  sql,
  table,
  tables,
} from "joist-orm";
import {
  Author,
  type AuthorId,
  Book,
  Color,
  Comment,
  LargePublisher,
  Publisher,
  type PublisherGroupId,
  type PublisherId,
  SmallPublisher,
  Task,
  type TaskId,
  TaskNew,
  TaskOld,
} from "src/entities";
import { newEntityManager } from "src/testEm";

describe("em.query / types", () => {
  it("checks literal fallback types for Book ids and Author colors", () => {
    // Given fallback assertions against generated Book and Author columns
    // When the type checker checks valid and invalid array elements
    // Then invalid fallbacks are checked without executing SQL
    expect(typeof expressionFallbackTypeAssertions).toBe("function");
  });
  it("type-checks domain and SQL predicate boundaries", () => {
    // Given predicate assertions using generated Author and Book types
    // When checking which public API accepts each predicate
    // Then invalid calls are checked without executing them
    expect(typeof predicateTypeAssertions).toBe("function");
  });
  it("type-checks entity population", () => {
    // Given compile-time assertions for Author population
    // When the type checker checks the query results and rejected hints
    // Then the assertions remain available without executing queries
    expect(typeof populateTypeAssertions).toBe("function");
  });
  it("type-checks", () => {
    // The assertions in `typeAssertions` are checked by `tsc`; referencing the function keeps it from being flagged as unused
    expect(typeof typeAssertions).toBe("function");
  });
  it("type-checks a single expression order", () => {
    // Given an Author table with age outside the selected columns
    // When the type checker validates direct and reusable queries with one expression order
    // Then those queries retain their selected row type
    expect(typeof singleExpressionOrderTypeAssertions).toBe("function");
  });
});

/**
 * Checks array fallback types against generated Book and Author columns.
 * The intentionally invalid expressions are checked by TypeScript but never executed.
 */
function expressionFallbackTypeAssertions() {
  // Given Book ids and Author colors with different allowed array elements
  const [a, b] = tables(Author, Book);

  // When readonly literal arrays supply valid fallbacks
  const ids = expr({ coalesce: [b.id.arrayAgg(), ["b:1"] as const] });
  const colors = expr({ coalesce: [a.favoriteColors, [Color.Red] as const] });

  // Then result arrays preserve the column types instead of widening to strings
  expectTypeOf(ids).toExtend<Expr<Book["id"][], "Book">>();
  expectTypeOf(colors).toExtend<Expr<Color[], "Author">>();

  // When a fallback adds null elements to a non-null Book id array
  // Then the literal must match the array element type
  // @ts-expect-error Book id array elements cannot be null
  expr({ coalesce: [b.id.arrayAgg(), [null]] });
  // @ts-expect-error CASE fallbacks have the same element check
  expr({ case: [{ when: b.id.ne(null), then: b.id.arrayAgg() }, { else: [null] }] });

  // When a fallback contains an unknown color
  // Then arbitrary strings cannot become Color values
  // @ts-expect-error This string is not a Color
  expr({ coalesce: [a.favoriteColors, ["not-a-color"]] });
}

/**
 * Checks recursive predicate boundaries and the deliberate unbranded escape hatch.
 * This function is checked by tsc but never called, so rejected queries do not execute.
 */
function predicateTypeAssertions() {
  // Given Author and Book SQL tables and an Author domain alias
  const em = newEntityManager();
  const [a, b] = tables(Author, Book);
  const domain = alias(Author);
  // And a custom raw predicate that must resolve the domain alias in find
  const custom = getAliasMgmt(domain).condition((_meta, sqlAlias) => ({
    kind: "raw",
    aliases: [sqlAlias],
    condition: `${sqlAlias}.first_name = ?`,
    bindings: ["Alice"],
    pruneable: false,
  }));
  // And recursive domain conditions with omitted optional filters
  const domainGroup = { and: [{ or: [domain.firstName.eq("Alice"), custom, skipCondition, undefined] }] };
  // And recursive SQL conditions with a skipped optional filter
  const sqlGroup = {
    or: [{ and: [a.firstName.eq("Alice"), a.where({ age: 30 }), sql.condition`${a.age} > ${18}`, skipCondition] }],
  };
  // And a legacy raw condition without either brand
  const raw: RawCondition = { kind: "raw", aliases: ["a"], condition: "a.age > ?", bindings: [18], pruneable: false };
  // And a legacy column condition without either brand
  const column: ColumnCondition = {
    kind: "column",
    alias: "a",
    column: "age",
    dbType: "int",
    cond: { kind: "gt", value: 18 },
  };

  // When assigning conditions to their public types
  // Then domain and SQL groups retain separate leaves while legacy conditions fit both
  expectTypeOf(custom).toEqualTypeOf<RawCondition & PredicateBrand<"domain">>();
  expectTypeOf(domain.firstName.eq("Alice")).toEqualTypeOf<ExpressionCondition>();
  expectTypeOf(a.firstName.eq("Alice")).toEqualTypeOf<SqlCondition>();
  expectTypeOf(a.id.count().gt(0)).toEqualTypeOf<SqlCondition>();
  expectTypeOf(sql.condition`${a.age} > ${18}`).toEqualTypeOf<SqlCondition>();
  expectTypeOf(domainGroup).toExtend<ExpressionFilter>();
  expectTypeOf(domainGroup).toExtend<ExpressionCondition>();
  expectTypeOf(sqlGroup).toExtend<SqlCondition>();
  expectTypeOf(sqlGroup).toExtend<QueryCondition>();
  expectTypeOf<SqlPredicate>().toExtend<PredicateBrand<"sql">>();
  expectTypeOf(raw).toExtend<ExpressionCondition>();
  expectTypeOf(raw).toExtend<SqlCondition>();
  expectTypeOf(column).toExtend<ExpressionCondition>();
  expectTypeOf(column).toExtend<SqlCondition>();
  // @ts-expect-error Nested SQL leaves cannot become domain conditions
  const invalidDomain: ExpressionCondition = sqlGroup;
  // @ts-expect-error Nested domain leaves cannot become SQL conditions
  const invalidSql: SqlCondition = domainGroup;
  void invalidDomain;
  void invalidSql;

  // When using each predicate in its intended API
  // Then find, scopes, SQL clauses, mutations, and EXISTS accept their own recursive conditions
  em.find(Author, { as: domain }, { conditions: domainGroup });
  em.find(Author, {}, { conditions: { and: [raw, column, skipCondition] } });
  Author.adult.where((a) => ({ or: [a.firstName.eq("Alice"), { and: [skipCondition, a.age.gt(18)] }] })).find(em);
  Author.adult.where((a) => getAliasMgmt(a).condition(() => raw)).find(em);
  Author.adult.where(() => skipCondition).find(em);
  em.query({ from: a, where: sqlGroup, having: sqlGroup, join: [{ inner: b, on: sqlGroup }], select: a.id });
  em.query({ from: a, where: { and: [raw, column, skipCondition] }, select: a.id });
  em.execute({ update: a, set: { firstName: "Alice" }, where: sqlGroup });
  em.execute({ delete: a, where: { and: [raw, column, skipCondition] } });
  const exists = {
    or: [sqlGroup, { exists: query({ from: b, where: b.authorId.eq(a.id), select: b.id }) }],
  } satisfies QueryCondition;
  em.query({ from: a, where: exists, select: a.id });
  // And optional existence queries that are omitted by the caller
  const optionalExists: ExistsQuery | undefined = undefined;
  const optionalNotExists: ExistsQuery | undefined = undefined;
  const optionalExistence = {
    and: [{ exists: optionalExists }, { notExists: optionalNotExists }],
  } satisfies QueryCondition;
  em.query({ from: a, where: optionalExistence, select: a.id });

  // When predicates cross the domain and SQL boundary, even inside boolean groups
  // Then all public condition entry points reject the foreign brand
  // @ts-expect-error Find cannot resolve table predicates
  em.find(Author, {}, { conditions: sqlGroup });
  // @ts-expect-error Scopes cannot return nested SQL predicates
  Author.adult.where(() => sqlGroup);
  // @ts-expect-error Scopes cannot return SQL expression predicates
  Author.adult.where(() => a.id.count().gt(0));
  // @ts-expect-error Find cannot resolve SQL template predicates
  em.find(Author, {}, { conditions: { and: [sql.condition`${a.age} > ${18}`] } });
  // @ts-expect-error SQL WHERE cannot resolve domain aliases
  em.query({ from: a, where: domainGroup, select: a.id });
  // @ts-expect-error SQL HAVING cannot resolve domain aliases
  em.query({ from: a, having: domainGroup, select: a.id });
  // @ts-expect-error SQL ON cannot resolve domain aliases
  em.query({ from: a, join: [{ inner: b, on: domainGroup }], select: a.id });
  // @ts-expect-error Custom alias raw conditions retain the domain brand
  em.query({ from: a, where: custom, select: a.id });
  // @ts-expect-error SQL UPDATE cannot resolve domain aliases
  em.execute({ update: a, set: { first_name: "Alice" }, where: domainGroup });
  // @ts-expect-error SQL DELETE cannot resolve domain aliases
  em.execute({ delete: a, where: domainGroup });
  em.query({
    from: a,
    // @ts-expect-error EXISTS cannot hide domain predicates inside its SQL query
    where: { and: [{ exists: query({ from: b, where: domainGroup, select: b.id }) }] },
    select: a.id,
  });
}

/** Checks loaded query results and rejects hints that do not belong to the selected entity. */
async function populateTypeAssertions() {
  // Given Author and Book tables
  const em = newEntityManager();
  const [a, b] = tables(Author, Book);

  // When selecting Authors with a join and a nested population hint
  const authors = await em.query(
    { from: a, join: [{ inner: b, on: b.authorId.eq(a.id) }], select: a },
    { populate: { books: "author" } },
  );

  // Then the selected Authors have exactly the requested loaded relations
  expectTypeOf(authors).toEqualTypeOf<Loaded<Author, { readonly books: "author" }>[]>();
  // @ts-expect-error Publisher was not populated
  authors[0].publisher.get;
  // @ts-expect-error Author has no missing relation
  em.query({ from: a, select: a }, { populate: { missing: {} } });
  // @ts-expect-error Book has no missing relation
  em.query({ from: a, select: a }, { populate: { books: { missing: {} } } });
  // @ts-expect-error Reusable entity queries also validate their hints
  em.query(query({ from: a, select: a }), { populate: { missing: {} } });
  // @ts-expect-error Scalar results cannot be populated
  em.query({ from: a, select: a.id }, { populate: "books" });
  // @ts-expect-error Reusable POJO queries cannot be populated
  em.query(query({ from: a, select: { name: a.firstName } }), { populate: "books" });
}

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

  // === Custom tables expose declared columns and retain one-off column access
  const customAuthorsTable = declareTable("authors", {
    id: { type: "int", hasDefault: true },
    firstName: "text",
    age: { type: "int", nullable: true },
  });
  const customAuthors = table(customAuthorsTable);
  const otherCustomAuthors = table(customAuthorsTable, "other");
  expectTypeOf(customAuthors.firstName).toMatchTypeOf<Expr<string, "authors">>();
  expectTypeOf(customAuthors.age).toMatchTypeOf<Expr<number | null, "authors">>();
  expectTypeOf(otherCustomAuthors.id).toMatchTypeOf<Expr<number, "other">>();
  expectTypeOf(customAuthors.column<string>("search")).toEqualTypeOf<Expr<string, "authors">>();
  const customRows = em.query({
    from: customAuthors,
    join: [
      {
        left: otherCustomAuthors,
        on: customAuthors.id.eq(otherCustomAuthors.id),
      },
    ],
    select: { name: customAuthors.firstName, otherId: otherCustomAuthors.id },
  });
  expectTypeOf(customRows).resolves.toEqualTypeOf<{ name: string; otherId: number | undefined }[]>();

  // === Table columns are typed expressions: `Expr<R, Src>` where `R` is the decoded result type and
  // === `Src` is the source key that left-join nullability and scope checking look up
  // A required primitive keeps its bare type
  expectTypeOf<ResultOf<typeof a.firstName>>().toEqualTypeOf<string>();
  // A nullable primitive carries `| null` from the field itself, before any joins are considered
  expectTypeOf<ResultOf<typeof a.age>>().toEqualTypeOf<number | null>();
  // The id column decodes to the entity's tagged id type, not `string`
  expectTypeOf<ResultOf<typeof a.id>>().toEqualTypeOf<AuthorId>();
  // An m2o FK column decodes to the *other* entity's id type
  expectTypeOf<ResultOf<typeof b.authorId>>().toEqualTypeOf<AuthorId>();
  // A nullable m2o FK is `| null`
  expectTypeOf<ResultOf<typeof a.publisherId>>().toEqualTypeOf<PublisherId | null>();
  // The default source key is the entity's own type name
  expectTypeOf<SourceOf<typeof a.firstName>>().toEqualTypeOf<"Author">();
  // Aggregates are source-less (`never`): a left join can never make `count(...)` itself null
  expectTypeOf<SourceOf<ReturnType<typeof b.id.count>>>().toEqualTypeOf<never>();

  // === The `select` shape decides the row type
  // Entity mode: a bare alias returns the entity itself, not a row of columns
  const entities = em.query({ from: a, select: a });
  expectTypeOf(entities).resolves.toEqualTypeOf<Author[]>();
  // POJO mode: one key per column, with top-level SQL NULL decoded as undefined
  const pojo = em.query({ from: a, select: { id: a.id, name: a.firstName, age: a.age } });
  expectTypeOf(pojo).resolves.toEqualTypeOf<{ id: AuthorId; name: string; age: number | undefined }[]>();

  // === `query(...)` turns the same POJO into a derived table with typed columns
  const bookStats = query({
    from: b,
    groupBy: [b.authorId],
    select: { authorId: b.authorId, bookCount: b.id.count(), lastTitle: b.title.max() },
    as: "book_stats",
  });
  // Each column keeps its inner result type and takes the `as` name as its source key
  expectTypeOf(bookStats.authorId).toMatchTypeOf<Expr<AuthorId, "book_stats">>();
  // `count()` is non-null inside the subquery (every group has rows)...
  expectTypeOf(bookStats.bookCount).toMatchTypeOf<Expr<number, "book_stats">>();
  // ...while `max()` and the reusable SQL expression remain nullable inside it
  expectTypeOf(bookStats.lastTitle).toMatchTypeOf<Expr<string | null, "book_stats">>();
  // `arrayAgg()` keeps the element's own nullability, and is itself `| null` (zero rows aggregate as NULL)
  expectTypeOf<ReturnType<typeof b.title.arrayAgg>>().toEqualTypeOf<Expr<string[] | null, "Book">>();
  expectTypeOf<ReturnType<typeof a.age.arrayAgg>>().toEqualTypeOf<Expr<(number | null)[] | null, "Author">>();
  // `select: <subquery>` returns its full row type, with top-level SQL NULL decoded as undefined
  const star = em.query({ from: bookStats, select: bookStats });
  expectTypeOf(star).resolves.toEqualTypeOf<
    { authorId: AuthorId; bookCount: number; lastTitle: string | undefined }[]
  >();

  // === The join list decides nullability: the same column, inner- vs left-joined
  // Inner join: the row is guaranteed a match, so `bookCount` stays `number`
  const inner = em.query({
    from: a,
    join: [{ inner: bookStats, on: bookStats.authorId.eq(a.id) }],
    select: { name: a.firstName, bookCount: bookStats.bookCount },
  });
  expectTypeOf(inner).resolves.toEqualTypeOf<{ name: string; bookCount: number }[]>();
  // Left join: the same column picks up `| undefined`, and `.coalesce(0)` recovers the required type
  const left = em.query({
    from: a,
    join: [{ left: bookStats, on: bookStats.authorId.eq(a.id) }],
    select: { name: a.firstName, bookCount: bookStats.bookCount, safe: bookStats.bookCount.coalesce(0) },
  });
  expectTypeOf(left).resolves.toEqualTypeOf<{ name: string; bookCount: number | undefined; safe: number }[]>();

  // === Nullability is per-source: a left join nullifies only its own columns
  // `table(Author, "m")` gives the self-join its own source key, so left-joining the mentor
  // nullifies `m.first_name` but not the mentee's `a.first_name` (both are Author columns)
  const m = table(Author, "m");
  const mentors = em.query({
    from: a,
    join: [
      { left: m, on: a.mentorId.eq(m.id) },
      { left: p, on: a.publisherId.eq(p.id) },
    ],
    select: { mentee: a.firstName, mentor: m.firstName, publisher: p.name },
  });
  expectTypeOf(mentors).resolves.toEqualTypeOf<
    { mentee: string; mentor: string | undefined; publisher: string | undefined }[]
  >();

  // === Subqueries as expressions
  // A single-expression select is a scalar subquery: `| null` because it can return no row
  // Given Book and Author aliases linked by Book.author_id
  // When selecting the Book count for an Author as a scalar subquery
  const scalar = query({ from: b, where: { and: [b.authorId.eq(a.id)] }, select: b.id.count() });
  // Then the count query retains its scalar brand and nullable expression result
  expectTypeOf(scalar).toEqualTypeOf<ScalarQuery<number>>();
  // A single-column subquery is an IN-list target, checked against the column's id type
  a.id.in(query({ from: b, select: b.authorId }));
  // The same scalar query can be passed directly and keeps its select-domain checks
  a.id.in({ from: b, select: b.authorId });
  // @ts-expect-error: Book IDs do not belong to an Author ID column
  a.id.in({ from: b, select: b.id });
  // Non-empty IN accepts readonly id and scalar lists but not subqueries
  a.id.inNonEmpty(["a:1"] as const);
  a.firstName.inNonEmpty(["a1"] as const);
  // @ts-expect-error: inNonEmpty only accepts lists
  a.id.inNonEmpty(query({ from: b, select: b.authorId }));

  // === A whole query is a value
  // `satisfies Query` checks the shape but keeps the literal `select` type...
  const q = {
    from: a,
    select: { name: a.firstName },
    orderBy: [{ name: "ASC" }, { sort: a.age, order: "ASC" }],
  } satisfies Query;
  const direct = em.query(q);
  expectTypeOf(direct).resolves.toEqualTypeOf<{ name: string }[]>();
  // ...and `query(q)` builds the same rows as `em.query(q)` ran directly; anonymous tables share the "?" key
  const built = query(q);
  expectTypeOf(built).toEqualTypeOf<Subquery<{ name: string }, "?">>();

  // === The keyed orderBy form
  // Keys must be keys of `select`, with uppercase SQL direction literals (NULLS FIRST/LAST suffixes allowed)
  em.query({ from: a, select: { name: a.firstName }, orderBy: { name: "ASC NULLS LAST" } });
  // In entity mode the keys are the table's sortable columns instead
  em.query({ from: a, select: a, orderBy: { firstName: "DESC" } });
  // Keyed and expression entries can share a readonly array without widening the selected row type
  const ordered = em.query({
    from: a,
    select: { name: a.firstName, age: a.age },
    orderBy: [
      undefined,
      { age: undefined },
      { age: "DESC" },
      { sort: a.id, order: "ASC" },
      { name: "ASC NULLS LAST" },
    ] as const,
  });
  expectTypeOf(ordered).resolves.toEqualTypeOf<{ name: string; age: number | undefined }[]>();
  // Physical columns and derived-table output names are also accepted in keyed array entries
  em.query({ from: a, select: a, orderBy: [{ firstName: "DESC" }, { age: "ASC NULLS LAST" }] });
  const orderedStats = em.query({ from: bookStats, select: bookStats, orderBy: [{ bookCount: "DESC" }] });
  expectTypeOf(orderedStats).resolves.toEqualTypeOf<
    { authorId: AuthorId; bookCount: number; lastTitle: string | undefined }[]
  >();
  // query() shares the same orderBy array support and keeps its derived-table row type
  const orderedNames = query({
    from: a,
    select: { name: a.firstName },
    orderBy: [{ sort: a.age, order: "ASC" }, { name: "ASC" }],
  });
  expectTypeOf(orderedNames).toEqualTypeOf<Subquery<{ name: string }, "?">>();

  // === A single bare condition works for where/having, no `{ and: [...] }` wrapper needed
  em.query({ from: a, where: a.age.gte(18), select: a });

  // === Soft deletes: `softDeletes` takes em.find's two modes, defaulting to "exclude"
  em.query({ from: a, select: a, softDeletes: "include" });

  // === Polymorphic references accept an id subquery in `in`; the select column picks the component
  const [c] = tables(Comment);
  c.parent.in(query({ from: a, select: a.id }));
  c.parent.in(query({ from: b, select: b.authorId }));
  c.parent.inNonEmpty(["a:1"] as const);

  // Given a Comment table whose parent can reference an Author or another entity
  // When selecting the physical Author component rather than the parent relationship
  const parentIds = em.query({ from: c, select: { authorId: c.parentAuthorId } });
  // Then the component keeps its Author id domain and decodes top-level SQL NULL as undefined
  expectTypeOf(parentIds).resolves.toEqualTypeOf<{ authorId: AuthorId | undefined }[]>();

  // Given an Author alias for entity-shaped find filters
  const findAuthor = alias(Author);
  // And a Book table with separate relationship and physical FK members
  // Then the alias is not a SQL query source or mutation target
  // @ts-expect-error: find aliases are not table sources
  em.query({ from: findAuthor, select: { name: a.firstName } });
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
  // A collection (`books`) and a nullable reference (`publisher`) default to LEFT: their columns gain `| undefined`
  const sugar = em.query({
    from: a,
    join: [a.books.as(b), a.publisher.as(p)],
    select: { name: a.firstName, title: b.title, publisher: p.name },
  });
  expectTypeOf(sugar).resolves.toEqualTypeOf<
    { name: string; title: string | undefined; publisher: string | undefined }[]
  >();
  // A required reference (`book.author`) defaults to INNER: `author` stays non-null
  const requiredInner = em.query({ from: b, join: [b.author.as(a)], select: { title: b.title, author: a.firstName } });
  expectTypeOf(requiredInner).resolves.toEqualTypeOf<{ title: string; author: string }[]>();
  // `.inner(...)` overrides a collection's LEFT default, so `title` stays non-null
  const withBooks = em.query({ from: a, join: [a.books.inner(b)], select: { title: b.title } });
  expectTypeOf(withBooks).resolves.toEqualTypeOf<{ title: string }[]>();
  // An o2o (`book.sequel`) is LEFT like any collection; the self-join needs its own named alias
  const s = table(Book, "s");
  const withSequel = em.query({ from: b, join: [b.sequel.as(s)], select: { title: b.title, sequel: s.title } });
  expectTypeOf(withSequel).resolves.toEqualTypeOf<{ title: string; sequel: string | undefined }[]>();

  // Given physical Publisher and SmallPublisher tables with independent source keys
  const sp = table(SmallPublisher);
  // And named subtype handles that must preserve their own LEFT/INNER nullability
  const namedSmall = table(SmallPublisher, "small");
  const lp = table(LargePublisher);
  // When joining the subtype through the callable convenience or an explicit join
  const subtypeLeft = em.query({ from: p, join: [p.smallPublisher(sp)], select: { name: p.name, city: sp.city } });
  const subtypeInner = em.query({
    from: p,
    join: [p.smallPublisher.inner(sp)],
    select: { name: p.name, city: sp.city },
  });
  const namedLeft = em.query({
    from: p,
    join: [p.smallPublisher(namedSmall)],
    select: { name: p.name, city: namedSmall.city },
  });
  const namedInner = em.query({
    from: p,
    join: [p.smallPublisher.inner(namedSmall)],
    select: { name: p.name, city: namedSmall.city },
  });
  const explicitLeft = em.query({
    from: p,
    join: [{ left: sp, on: p.id.eq(sp.id) }],
    select: { name: p.name, city: sp.city },
  });
  // Then only the LEFT-joined subtype becomes nullable
  expectTypeOf(subtypeLeft).resolves.toEqualTypeOf<{ name: string; city: string | undefined }[]>();
  expectTypeOf(subtypeInner).resolves.toEqualTypeOf<{ name: string; city: string }[]>();
  expectTypeOf(namedLeft).resolves.toEqualTypeOf<{ name: string; city: string | undefined }[]>();
  expectTypeOf(namedInner).resolves.toEqualTypeOf<{ name: string; city: string }[]>();
  expectTypeOf(explicitLeft).resolves.toEqualTypeOf<{ name: string; city: string | undefined }[]>();
  expectTypeOf<SourceOf<typeof sp.city>>().toEqualTypeOf<"SmallPublisher">();
  expectTypeOf<SourceOf<typeof namedSmall.city>>().toEqualTypeOf<"small">();
  expectTypeOf<ResultOf<typeof p.groupId>>().toEqualTypeOf<PublisherGroupId | null>();
  // @ts-expect-error: callable subtype joins reject the wrong subtype
  p.smallPublisher(lp);
  // @ts-expect-error: INNER subtype joins also reject the wrong subtype
  p.smallPublisher.inner(lp);
  // @ts-expect-error: SmallPublisher's physical table has no inherited name column
  sp.name;
  // @ts-expect-error: specialized group storage still belongs to Publisher
  sp.groupId;
  // @ts-expect-error: Publisher's physical table has no subtype city column
  p.city;
  // When selecting CTI root and subtype tables as entities
  const publishers = em.query({ from: p, select: p });
  const smallPublishers = em.query({ from: sp, select: sp });
  const reusablePublishers = query({ from: p, select: p });
  // Then entity mode retains the requested domain types while runtime hydration resolves concrete root rows
  expectTypeOf(publishers).resolves.toEqualTypeOf<Publisher[]>();
  expectTypeOf(smallPublishers).resolves.toEqualTypeOf<SmallPublisher[]>();
  expectTypeOf(em.query(reusablePublishers)).resolves.toEqualTypeOf<Publisher[]>();

  // Given STI handles that all expose the same physical tasks schema
  const [task, oldTask, newTask] = tables(Task, TaskOld, TaskNew);
  // When selecting sibling columns and specialized relationship storage from TaskOld
  const shared = em.query({
    from: oldTask,
    select: {
      old: oldTask.specialOldField,
      newer: oldTask.specialNewField,
      copied: oldTask.copiedFromId,
      parent: oldTask.parentOldTaskId,
      author: oldTask.specialNewAuthorId,
    },
  });
  // Then storage determines nullability and FK domains, with top-level SQL NULL decoded as undefined
  expectTypeOf(shared).resolves.toEqualTypeOf<
    {
      old: number | undefined;
      newer: number | undefined;
      copied: TaskId | undefined;
      parent: TaskId | undefined;
      author: AuthorId | undefined;
    }[]
  >();
  expectTypeOf<ResultOf<typeof task.specialOldField>>().toEqualTypeOf<number | null>();
  expectTypeOf<ResultOf<typeof newTask.specialOldField>>().toEqualTypeOf<number | null>();
  // When selecting STI root and subtype tables as entities
  const tasks = em.query({ from: task, select: task });
  const oldTasks = query({ from: oldTask, select: oldTask });
  // Then root reads retain the base type and subtype reads retain their narrowed type
  expectTypeOf(tasks).resolves.toEqualTypeOf<Task[]>();
  expectTypeOf(em.query(oldTasks)).resolves.toEqualTypeOf<TaskOld[]>();
  expectTypeOf(em.execute({ from: newTask, select: newTask })).resolves.toMatchTypeOf<{
    rows: TaskNew[];
    rowCount: number;
  }>();

  // === Mistakes that must not compile
  // @ts-expect-error: custom tables expose only their declared column properties
  customAuthors.lastName;
  // @ts-expect-error: custom tables cannot be selected as entities
  em.query({ from: customAuthors, select: customAuthors });
  // Given a nonliteral Author read carrying the reserved `ctes` spelling, which `with` does not replace
  const withCte = { from: a, select: { name: a.firstName }, ctes: [] };
  // And an otherwise valid compound with that invalid later operand
  const nestedCte = { unionAll: [q, withCte] } as const;
  // And a compound mixed with a mutation operation
  const compoundMutation = { union: [q, q], insert: a } as const;
  // When checking public overloads rather than internal clause-check types
  // Then nonliteral inputs cannot hide unsupported clauses
  // @ts-expect-error: ordinary read values do not support the `ctes` clause; the spelling is `with`
  query(withCte);
  // @ts-expect-error: nested operands must reject unsupported clauses
  query(nestedCte);
  // @ts-expect-error: execution checks nested nonliteral clauses too
  em.query(nestedCte);
  // @ts-expect-error: a nonliteral compound cannot also be an INSERT
  query(compoundMutation);
  // And query-clause words remain legal as projected data keys
  const keywords = query({ from: a, select: { with: a.firstName, select: a.firstName, delete: a.firstName } });
  expectTypeOf(em.query(keywords)).resolves.toEqualTypeOf<{ with: string; select: string; delete: string }[]>();

  // @ts-expect-error: an AuthorId column cannot be compared to a BookId column
  bookStats.authorId.eq(b.id);
  // @ts-expect-error: the subquery selects BookId, but a.id is an AuthorId column
  a.id.in(query({ from: b, select: b.id }));
  // @ts-expect-error: alias 'book_stats' is not in from/join (the scope check names the missing alias)
  em.query({ from: a, select: { bookCount: bookStats.bookCount } });
  // @ts-expect-error: a source-shaped select must be the from; 'Book' is a joined source
  em.query({ from: a, join: [{ left: b, on: b.authorId.eq(a.id) }], select: b });
  // @ts-expect-error: a joined subquery cannot be selected either; select its columns individually
  em.query({ from: a, join: [{ left: bookStats, on: bookStats.authorId.eq(a.id) }], select: bookStats });
  // @ts-expect-error: select was typed too generically; use `satisfies Query` instead of `: Query`
  em.query({ from: a, select: { name: a.firstName } } as Query);
  // @ts-expect-error: `inner` and `left` are mutually exclusive within one join entry
  em.query({ from: a, join: [{ inner: b, left: p, on: b.authorId.eq(a.id) }], select: { name: a.firstName } });
  // @ts-expect-error: the removed expression ordering syntax is not accepted
  ({ from: a, select: { name: a.firstName }, orderBy: [{ asc: a.firstName }] }) satisfies Query<{
    name: typeof a.firstName;
  }>;
  // @ts-expect-error: expression ordering requires sort even when order is present
  em.query({ from: a, select: { name: a.firstName }, orderBy: [{ order: "ASC" }] });
  // @ts-expect-error: expression orders are uppercase SQL literals
  em.query({ from: a, select: { name: a.firstName }, orderBy: [{ sort: a.age, order: "asc" }] });
  // @ts-expect-error: keyed orderBy only accepts keys of select, and 'age' was not selected
  em.query({ from: a, select: { name: a.firstName }, orderBy: { age: "ASC" } });
  // @ts-expect-error: keyed orderBy directions are uppercase SQL literals, i.e. "ASC" not "asc"
  em.query({ from: a, select: { name: a.firstName }, orderBy: { name: "asc" } });
  // @ts-expect-error: keyed array entries only accept selected keys, even alongside expression entries
  em.query({ from: a, select: { name: a.firstName }, orderBy: [{ sort: a.age, order: "ASC" }, { age: "ASC" }] });
  // @ts-expect-error: keyed array directions must also be uppercase SQL literals
  em.query({ from: a, select: { name: a.firstName }, orderBy: [{ name: "asc" }] });
  // @ts-expect-error: entity collections are not sortable fields
  em.query({ from: a, select: a, orderBy: [{ books: "ASC" }] });
  // @ts-expect-error: scalar selects have no keys to address in orderBy
  em.query({ from: a, select: a.firstName, orderBy: [{ name: "ASC" }] });
  // @ts-expect-error: query() also rejects keys that are absent from select
  query({ from: a, select: { name: a.firstName }, orderBy: [{ age: "ASC" }] });
  // @ts-expect-error: keyed and expression sorts must be separate array entries
  em.query({ from: a, select: { name: a.firstName }, orderBy: [{ sort: a.age, name: "ASC", order: "ASC" }] });
  // Given a query with alternative Author projections and no joins
  const unionSelect: Query<{ name: typeof a.firstName } | { age: typeof a.age }, []> = {
    from: a,
    select: { name: a.firstName },
    // When sorting by an expression and a projection key in the same entry
    // Then alternative projections still reject the combined entry
    // @ts-expect-error: a union of select shapes must still reject a combined keyed/expression entry
    orderBy: [{ sort: a.age, name: "ASC", order: "ASC" }],
  };
  em.query(unionSelect);
  // @ts-expect-error: `sum` only exists on numeric columns
  a.firstName.sum();
  // @ts-expect-error: a top-level query has no `as`; only subqueries built with `query(...)` are named
  em.query({ from: a, select: { name: a.firstName }, as: "x" });
  // @ts-expect-error: `books` joins a Table<Book>, not a Table<Publisher>
  a.books.as(p);
  // @ts-expect-error: a collection has no expression methods, so it cannot be selected
  em.query({ from: a, select: { books: a.books } });
  // @ts-expect-error: softDeletes only accepts em.find's "include" | "exclude"
  em.query({ from: a, select: a, softDeletes: "only" });
  // @ts-expect-error: the subquery selects numbers, not ids of Comment.parent's component entities
  // (a *string* column cannot be rejected: Joist ids are flavored strings, so `string` stays assignable)
  c.parent.in(query({ from: b, select: b.order }));

  // Given an array projection of named Author columns
  // When running it directly or reusing it as a subquery
  const arrayRows = em.query({ from: a, select: [a.firstName, a.lastName], orderBy: { firstName: "ASC" } });
  const arrayQuery = query({ from: a, select: [a.firstName, a.lastName] });
  // Then field names become result keys and retain their column nullability
  expectTypeOf(arrayRows).resolves.toEqualTypeOf<{ firstName: string; lastName: string | undefined }[]>();
  expectTypeOf(arrayQuery).toEqualTypeOf<Subquery<{ firstName: string; lastName: string | undefined }, "?">>();
  // @ts-expect-error: computed expressions have no unambiguous field name for array projection shorthand
  em.query({ from: a, select: [a.firstName.max()] });
}

type ResultOf<E> = E extends { readonly [exprBrand]: ExprBrand<infer R, any> } ? R : never;
type SourceOf<E> = E extends { readonly [exprBrand]: ExprBrand<any, infer Src> } ? Src : never;

/** Checks single expression ordering through both read entry points. */
function singleExpressionOrderTypeAssertions(): void {
  // Given an Author table whose age is outside the selected name projection
  const a = table(Author);

  // When ordering direct and reusable reads by an age expression
  const direct = newEntityManager().query({ from: a, select: { name: a.firstName }, orderBy: a.age.asc() });
  const reusable = query({ from: a, select: { name: a.firstName }, orderBy: a.age.desc() });

  // Then both reads retain the selected name type
  expectTypeOf(direct).resolves.toEqualTypeOf<{ name: string }[]>();
  expectTypeOf(reusable).toEqualTypeOf<Subquery<{ name: string }, "?">>();

  // When a single expression sort mixes a projected key into the same entry
  // Then the keyed and expression sorts must still be separate entries
  newEntityManager().query({
    from: a,
    select: { name: a.firstName },
    // @ts-expect-error: keyed and expression sorts must be separate entries
    orderBy: { sort: a.age, name: "ASC", order: "ASC" },
  });
}
