import { expectTypeOf } from "expect-type";
import { type Query, type WithInput, query, sql, table, tables } from "joist-orm";
import { Author, type AuthorId, Book, Publisher } from "src/entities";
import { insertAuthor, insertBook, insertPublisher, select } from "src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

/**
 * `em.query`'s `with` clause: `query(...)` values hoisted into a SQL `WITH`.
 *
 * `with` only declares the CTE; reading it still goes through `from`/`join`, where it renders as the
 * bare CTE name instead of an inlined `(SELECT ...)`. These tests pin that rendering, the binding order
 * a leading WITH forces, and the pruning a CTE shares with joins.
 */
describe("EntityManager.rawQueries.ctes", () => {
  it("hoists a joined query value into a WITH clause", async () => {
    // Given Author a1 with two Books
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });
    // And Author a2 with one Book
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b3", author_id: 2 });
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    // And a CTE counting each Author's Books
    const stats = query({
      from: b,
      groupBy: [b.author_id],
      select: { authorId: b.author_id, count: b.id.count() },
      as: "book_stats",
    });
    resetQueryCount();
    // When reading each Author's name with their Book count
    const rows = await em.query({
      with: stats,
      from: a,
      join: [{ inner: stats, on: stats.authorId.eq(a.id) }],
      select: { name: a.first_name, count: stats.count },
      orderBy: [{ asc: a.id }],
    });
    // Then each Author has their own count
    expect(rows).toEqual([
      { name: "a1", count: 2 },
      { name: "a2", count: 1 },
    ]);
    // And the CTE renders once, in a WITH clause the join reads by name
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH book_stats AS (SELECT b.author_id AS "authorId", count(b.id)::int AS "count" FROM books AS b WHERE b.deleted_at IS NULL GROUP BY b.author_id) SELECT a.first_name AS name, book_stats."count" AS "count" FROM authors AS a JOIN book_stats ON book_stats."authorId" = a.id WHERE a.deleted_at IS NULL ORDER BY a.id ASC",
     ]
    `);
  });

  it("reads one CTE from two places without repeating its body", async () => {
    // Given Author a1 with one Book
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    // And a CTE counting each Author's Books
    const stats = query({
      from: b,
      groupBy: [b.author_id],
      select: { authorId: b.author_id, count: b.id.count() },
      as: "book_stats",
    });
    resetQueryCount();
    // When reading the CTE from both a join and a where
    const rows = await em.query({
      with: stats,
      from: a,
      join: [{ inner: stats, on: stats.authorId.eq(a.id) }],
      where: stats.count.gte(1),
      select: { name: a.first_name },
    });
    // Then the Author is returned
    expect(rows).toEqual([{ name: "a1" }]);
    // And the CTE body renders once, not once per use
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH book_stats AS (SELECT b.author_id AS "authorId", count(b.id)::int AS "count" FROM books AS b WHERE b.deleted_at IS NULL GROUP BY b.author_id) SELECT a.first_name AS name FROM authors AS a JOIN book_stats ON book_stats."authorId" = a.id WHERE book_stats."count" >= $1 AND a.deleted_at IS NULL",
     ]
    `);
  });

  it("selects a CTE's own rows when it is the from", async () => {
    // Given adult Author a1
    await insertAuthor({ first_name: "a1", age: 30 });
    // And underage Author a2, excluded by the CTE's age filter
    await insertAuthor({ first_name: "a2", age: 10 });
    const em = newEntityManager();
    const [a] = tables(Author);
    // And a CTE of only the adult Authors
    const adults = query({ from: a, where: a.age.gte(18), select: { id: a.id, name: a.first_name }, as: "adults" });
    resetQueryCount();
    // When selecting the CTE's own rows
    const rows = await em.query({ with: adults, from: adults, select: adults });
    // Then only the adult Author is returned
    expect(rows).toEqual([{ id: "a:1", name: "a1" }]);
    // And the CTE is the query's only source
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH adults AS (SELECT a.id AS id, a.first_name AS name FROM authors AS a WHERE a.age >= $1 AND a.deleted_at IS NULL) SELECT adults.id AS id, adults.name AS name FROM adults",
     ]
    `);
  });

  it("lets a CTE read an earlier CTE", async () => {
    // Given Author a1 with two Books
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    // And a CTE counting each Author's Books
    const stats = query({
      from: b,
      groupBy: [b.author_id],
      select: { authorId: b.author_id, count: b.id.count() },
      as: "book_stats",
    });
    // And a second CTE whose own from is the first CTE
    const prolific = query({
      from: stats,
      where: stats.count.gte(2),
      select: { authorId: stats.authorId },
      as: "prolific",
    });
    resetQueryCount();
    // When reading the second CTE, with an omitted entry mixed into the array
    const rows = await em.query({
      with: [stats, undefined, prolific],
      from: a,
      join: [{ inner: prolific, on: prolific.authorId.eq(a.id) }],
      select: { name: a.first_name, authorId: prolific.authorId },
    });
    // Then the Author with two Books is returned
    expect(rows).toEqual([{ name: "a1", authorId: "a:1" }]);
    // And the second CTE reads the first by name, in declaration order
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH book_stats AS (SELECT b.author_id AS "authorId", count(b.id)::int AS "count" FROM books AS b WHERE b.deleted_at IS NULL GROUP BY b.author_id), prolific AS (SELECT book_stats."authorId" AS "authorId" FROM book_stats WHERE book_stats."count" >= $1) SELECT a.first_name AS name, prolific."authorId" AS "authorId" FROM authors AS a JOIN prolific ON prolific."authorId" = a.id WHERE a.deleted_at IS NULL",
     ]
    `);
  });

  it("keeps a CTE that only another CTE reads", async () => {
    // Given Author a1 with one Book
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    // And a first CTE that only the second CTE reads, so pruning must follow that dependency
    const bookAuthors = query({ from: b, select: { authorId: b.author_id }, as: "book_authors" });
    // And a second CTE that rolls the first one up to distinct Author ids
    const distinctAuthors = query({
      from: bookAuthors,
      groupBy: [bookAuthors.authorId],
      select: { authorId: bookAuthors.authorId },
      as: "distinct_authors",
    });
    resetQueryCount();
    // When reading only the second CTE
    const rows = await em.query({
      with: [bookAuthors, distinctAuthors],
      from: a,
      join: [{ inner: distinctAuthors, on: distinctAuthors.authorId.eq(a.id) }],
      select: { name: a.first_name, authorId: distinctAuthors.authorId },
    });
    // Then the Author is returned
    expect(rows).toEqual([{ name: "a1", authorId: "a:1" }]);
    // And both CTEs survive, because pruning followed the second one's read of the first
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH book_authors AS (SELECT b.author_id AS "authorId" FROM books AS b WHERE b.deleted_at IS NULL), distinct_authors AS (SELECT book_authors."authorId" AS "authorId" FROM book_authors GROUP BY book_authors."authorId") SELECT a.first_name AS name, distinct_authors."authorId" AS "authorId" FROM authors AS a JOIN distinct_authors ON distinct_authors."authorId" = a.id WHERE a.deleted_at IS NULL",
     ]
    `);
  });

  it("prunes a CTE when the join that read it prunes", async () => {
    // Given Author a1
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    // And a CTE counting each Author's Books
    const stats = query({
      from: b,
      groupBy: [b.author_id],
      select: { authorId: b.author_id, count: b.id.count() },
      as: "book_stats",
    });
    resetQueryCount();
    // When the join's only ON condition is undefined
    const rows = await em.query({
      with: stats,
      from: a,
      join: [{ inner: stats, on: { and: [undefined] } }],
      select: { name: a.first_name },
    });
    // Then the Author is still returned
    expect(rows).toEqual([{ name: "a1" }]);
    // And the join and its now-unread CTE both dropped
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL",
     ]
    `);
  });

  it("keeps an unread CTE when pruneJoins is false", async () => {
    // Given Author a1
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    // And a CTE counting each Author's Books
    const stats = query({
      from: b,
      groupBy: [b.author_id],
      select: { authorId: b.author_id, count: b.id.count() },
      as: "book_stats",
    });
    resetQueryCount();
    // When reading with pruneJoins off, em.find's opt-out
    const rows = await em.query({
      with: stats,
      from: a,
      join: [{ inner: stats, on: stats.authorId.eq(a.id) }],
      select: { name: a.first_name },
      pruneJoins: false,
    });
    // Then the kept join filters the bookless Author out
    expect(rows).toEqual([]);
    // And the unread join and its CTE both stay
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH book_stats AS (SELECT b.author_id AS "authorId", count(b.id)::int AS "count" FROM books AS b WHERE b.deleted_at IS NULL GROUP BY b.author_id) SELECT a.first_name AS name FROM authors AS a JOIN book_stats ON book_stats."authorId" = a.id WHERE a.deleted_at IS NULL",
     ]
    `);
  });

  it("drops an undefined with entry", async () => {
    // Given Author a1
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const [a] = tables(Author);
    resetQueryCount();
    // And a conditionally-built CTE that was omitted this call
    const maybe = undefined;
    // When reading with that omitted entry
    const rows = await em.query({ with: [maybe], from: a, select: { name: a.first_name } });
    // Then the Author is returned
    expect(rows).toEqual([{ name: "a1" }]);
    // And no WITH clause is emitted at all
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL",
     ]
    `);
  });

  it("puts WITH bindings ahead of the outer query's", async () => {
    // Given Book b1 ordered 1, which the CTE's order filter keeps
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1, order: 1 });
    // And Book b2 ordered 5, which the CTE's order filter drops
    await insertBook({ title: "b2", author_id: 1, order: 5 });
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    // And a CTE binding 3 while the outer WHERE binds "a1", so a swapped order would mis-filter
    const early = query({ from: b, where: b.order.lte(3), select: { authorId: b.author_id }, as: "early" });
    resetQueryCount();
    // When reading with both bindings in play
    const rows = await em.query({
      with: early,
      from: a,
      join: [{ inner: early, on: early.authorId.eq(a.id) }],
      where: a.first_name.eq("a1"),
      select: { name: a.first_name, authorId: early.authorId },
    });
    // Then the Author matched on the outer binding
    expect(rows).toEqual([{ name: "a1", authorId: "a:1" }]);
    // And the CTE's binding is $1, ahead of the outer query's $2
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH early AS (SELECT b.author_id AS "authorId" FROM books AS b WHERE b."order" <= $1 AND b.deleted_at IS NULL) SELECT a.first_name AS name, early."authorId" AS "authorId" FROM authors AS a JOIN early ON early."authorId" = a.id WHERE a.first_name = $2 AND a.deleted_at IS NULL",
     ]
    `);
  });

  it("applies soft deletes inside the CTE body, not the outer query", async () => {
    // Given Publisher p1, which is soft-deletable and not deleted
    await insertPublisher({ id: 1, name: "p1" });
    const em = newEntityManager();
    const [p] = tables(Publisher);
    // And a CTE over Publisher, whose body gets its own deleted_at IS NULL
    const names = query({ from: p, select: { id: p.id, name: p.name }, as: "pub_names" });
    resetQueryCount();
    // When reading the CTE
    const rows = await em.query({ with: names, from: names, select: { name: names.name } });
    // Then the Publisher is returned
    expect(rows).toEqual([{ name: "p1" }]);
    // And deleted_at IS NULL is in the CTE body, where the Publisher table is
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH pub_names AS (SELECT p.id AS id, p.name AS name FROM publishers AS p WHERE p.deleted_at IS NULL) SELECT pub_names.name AS name FROM pub_names",
     ]
    `);
  });

  it("declares a CTE on a nested subquery", async () => {
    // Given Author a1 with one Book
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    // And a CTE of the Authors that have Books
    const bookAuthors = query({ from: b, select: { authorId: b.author_id }, as: "book_authors" });
    // And an inner query that both declares and reads the CTE, so the WITH renders inside the subquery
    const inner = query({ with: bookAuthors, from: bookAuthors, select: { authorId: bookAuthors.authorId } });
    resetQueryCount();
    // When the outer query reads that subquery
    const rows = await em.query({
      from: a,
      where: a.id.in(query({ from: inner, select: inner.authorId })),
      select: { name: a.first_name },
    });
    // Then the Author is returned
    expect(rows).toEqual([{ name: "a1" }]);
    // And the WITH renders inside the subquery that declared it
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT a.first_name AS name FROM authors AS a WHERE a.id IN (SELECT sq."authorId" AS value FROM (WITH book_authors AS (SELECT b.author_id AS "authorId" FROM books AS b WHERE b.deleted_at IS NULL) SELECT book_authors."authorId" AS "authorId" FROM book_authors) AS sq) AND a.deleted_at IS NULL",
     ]
    `);
  });

  it("lets a nested subquery read an outer CTE", async () => {
    // Given Author a1 with one Book
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    // And a CTE of the Authors that have Books
    const bookAuthors = query({ from: b, select: { authorId: b.author_id }, as: "book_authors" });
    resetQueryCount();
    // When an IN subquery reads the CTE its enclosing query declared
    const rows = await em.query({
      with: bookAuthors,
      from: a,
      where: a.id.in(query({ from: bookAuthors, select: bookAuthors.authorId })),
      select: { name: a.first_name },
    });
    // Then the Author is returned
    expect(rows).toEqual([{ name: "a1" }]);
    // And the subquery reads the CTE by name, without inlining it
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH book_authors AS (SELECT b.author_id AS "authorId" FROM books AS b WHERE b.deleted_at IS NULL) SELECT a.first_name AS name FROM authors AS a WHERE a.id IN (SELECT book_authors."authorId" AS value FROM book_authors) AND a.deleted_at IS NULL",
     ]
    `);
  });

  it("hoists a CTE for a set query's operands", async () => {
    // Given Author a1
    await insertAuthor({ first_name: "a1" });
    // And Book b1, whose title is the other half of the union
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    // And a CTE of the Author names, one half of the union
    const authorNames = query({ from: a, select: { name: a.first_name }, as: "author_names" });
    resetQueryCount();
    // When unioning the CTE's rows with the Book titles
    const rows = await em.query({
      with: authorNames,
      union: [
        { from: authorNames, select: { name: authorNames.name } },
        { from: b, select: { name: b.title } },
      ],
      orderBy: { name: "ASC" },
    });
    // Then both names are returned
    expect(rows).toEqual([{ name: "a1" }, { name: "b1" }]);
    // And the WITH leads the whole compound, not one operand
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH author_names AS (SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL) (SELECT author_names.name AS name FROM author_names) UNION (SELECT b.title AS name FROM books AS b WHERE b.deleted_at IS NULL) ORDER BY name ASC",
     ]
    `);
  });

  it("names an anonymous CTE", async () => {
    // Given Author a1
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const [a] = tables(Author);
    // And a CTE with no `as`, so the WITH clause has to generate its name
    const names = query({ from: a, select: { name: a.first_name } });
    resetQueryCount();
    // When reading it
    const rows = await em.query({ with: names, from: names, select: { name: names.name } });
    // Then the Author name is returned
    expect(rows).toEqual([{ name: "a1" }]);
    // And Joist generated the name `cte`
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH cte AS (SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL) SELECT cte.name AS name FROM cte",
     ]
    `);
  });

  it("rejects a CTE that reads the query's own from", async () => {
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    // Given a CTE correlated to the outer from, which SQL does not allow
    const correlated = query({ from: b, where: b.author_id.eq(a.id), select: { id: b.id }, as: "correlated" });
    // When running it
    // Then the correlation is rejected, because a CTE compiles before the query's own sources
    await expect(
      em.query({ with: correlated, from: a, join: [{ inner: correlated, on: sql.condition`true` }], select: a }),
    ).rejects.toThrow("Table for authors is not in this query's from/join");
  });

  it("rejects a CTE that reads a later CTE", async () => {
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    // Given a CTE that the `with` array declares second
    const later = query({ from: b, select: { authorId: b.author_id }, as: "later" });
    // And an earlier CTE that reads it
    const earlier = query({ from: later, select: { authorId: later.authorId }, as: "earlier" });
    // When running the query
    // Then the forward reference is rejected, rather than inlining `later` as a derived table
    await expect(
      em.query({
        with: [earlier, later],
        from: a,
        join: [{ inner: earlier, on: earlier.authorId.eq(a.id) }],
        select: a,
      }),
    ).rejects.toThrow("Subquery 'later' is declared later in this query's `with`");
  });

  it("rejects the same CTE value used twice", async () => {
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    // Given one CTE value
    const stats = query({ from: b, select: { authorId: b.author_id }, as: "book_stats" });
    // When two joins both read it, which one value cannot give two SQL aliases
    // Then the second read is rejected
    await expect(
      em.query({
        with: stats,
        from: a,
        join: [
          { inner: stats, on: stats.authorId.eq(a.id) },
          { inner: stats, on: stats.authorId.eq(a.id) },
        ],
        select: a,
      }),
    ).rejects.toThrow("Subquery 'book_stats' is already in this query's `from`/`join`");
  });

  it("rejects an entity-mode CTE", async () => {
    const em = newEntityManager();
    const [a] = tables(Author);
    // Given an entity-mode query value
    const authors = query({ from: a, select: a });
    // When it is declared as a CTE
    // Then it is rejected, because a CTE must be a table shape
    await expect(em.query({ with: authors as any, from: a, select: { name: a.first_name } })).rejects.toThrow(
      "A `with` entry needs named columns; entity and scalar query(...) values have none",
    );
  });

  it("rejects a scalar CTE", async () => {
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    // Given a scalar query value
    const count = query({ from: b, select: b.id.count() });
    // When it is declared as a CTE
    // Then it is rejected, because a CTE must be a table shape
    await expect(em.query({ with: count as any, from: a, select: { name: a.first_name } })).rejects.toThrow(
      "A `with` entry needs named columns; entity and scalar query(...) values have none",
    );
  });

  it("rejects a with entry that is not a query value", async () => {
    const em = newEntityManager();
    const [a] = tables(Author);
    // Given a bare table rather than a query(...) value
    // When it is declared as a CTE
    // Then it is rejected
    await expect(em.query({ with: table(Author) as any, from: a, select: { name: a.first_name } })).rejects.toThrow(
      "A `with` entry must be a query(...) value",
    );
  });

  it("runs a read with a CTE through em.execute", async () => {
    // Given Author a1
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const [a] = tables(Author);
    // And a CTE of the Author names
    const names = query({ from: a, select: { name: a.first_name }, as: "names" });
    resetQueryCount();
    // When reading it through em.execute, which shares em.query's read parsing
    const result = await em.execute({ with: names, from: names, select: { name: names.name } });
    // Then the row comes back with the execute result shape
    expect(result).toMatchObject({ rowCount: 1, rows: [{ name: "a1" }] });
    // And the WITH renders the same as it would for em.query
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH names AS (SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL) SELECT names.name AS name FROM names",
     ]
    `);
  });

  it("reads a CTE in an INSERT's SELECT source", async () => {
    // Given Author a1 with one Book
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const [b] = tables(Book);
    // And a CTE of the existing Book rows
    const titles = query({
      from: b,
      select: { title: b.title, authorId: b.author_id, notes: b.notes },
      as: "titles",
    });
    resetQueryCount();
    // When the INSERT's SELECT source declares and reads that CTE
    const result = await em.execute({
      insert: b,
      from: {
        with: titles,
        from: titles,
        select: { title: titles.title, author_id: titles.authorId, notes: titles.notes },
      },
    });
    // Then the row is copied
    expect(result).toMatchObject({ rowCount: 1 });
    // And both Books are present
    expect(await select("books")).toMatchObject([{ title: "b1" }, { title: "b1" }]);
    // And the WITH renders inside the INSERT's source, not before the INSERT
    expect(queries).toMatchInlineSnapshot(`
     [
       "INSERT INTO books AS b (title, notes, author_id) SELECT sq.title, sq.notes, sq.author_id FROM (WITH titles AS (SELECT b.title AS title, b.author_id AS "authorId", b.notes AS notes FROM books AS b WHERE b.deleted_at IS NULL) SELECT titles.title AS title, titles."authorId" AS author_id, titles.notes AS notes FROM titles) AS sq",
       "select * from "books" order by "id" asc",
     ]
    `);
  });

  it("rejects a top-level with on a mutation", async () => {
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    // Given a CTE
    const names = query({ from: a, select: { name: a.first_name }, as: "names" });
    // When an INSERT declares it as a top-level clause, which would need `WITH ... INSERT INTO`
    // Then it is rejected; a mutation's CTEs belong in its SELECT source
    await expect(
      // @ts-expect-error: a top-level `with` is not a mutation clause
      em.execute({ insert: b, with: names, values: { title: "t", author_id: "a:1", notes: "n" } }),
    ).rejects.toThrow("SQL insert does not support 'with'");
  });

  describe("types", () => {
    const [a, b] = tables(Author, Book);

    it("keeps the row type of a CTE's columns", async () => {
      const em = newEntityManager();
      // Given a CTE projecting an AuthorId and a count
      const stats = query({
        from: b,
        groupBy: [b.author_id],
        select: { authorId: b.author_id, count: b.id.count() },
        as: "book_stats",
      });
      // When it is inner joined and its column selected
      const rows = await em.query({
        with: stats,
        from: a,
        join: [{ inner: stats, on: stats.authorId.eq(a.id) }],
        select: { name: a.first_name, count: stats.count },
      });
      // Then the column keeps the type query(...) gave it
      expectTypeOf(rows).toEqualTypeOf<{ name: string; count: number }[]>();
    });

    it("nullifies a LEFT-joined CTE's columns", async () => {
      const em = newEntityManager();
      // Given a CTE counting each Author's Books
      const stats = query({
        from: b,
        groupBy: [b.author_id],
        select: { authorId: b.author_id, count: b.id.count() },
        as: "book_stats",
      });
      // When it is LEFT joined, so its unmatched rows are null
      const rows = await em.query({
        with: stats,
        from: a,
        join: [{ left: stats, on: stats.authorId.eq(a.id) }],
        select: { name: a.first_name, count: stats.count },
      });
      // Then the CTE's column is nullable, but the from's is not
      expectTypeOf(rows).toEqualTypeOf<{ name: string; count: number | null }[]>();
    });

    it("selects a CTE's own rows", async () => {
      const em = newEntityManager();
      // Given a CTE of only the adult Authors
      const adults = query({ from: a, where: a.age.gte(18), select: { id: a.id, name: a.first_name }, as: "adults" });
      // When the CTE is both the from and the select
      const rows = await em.query({ with: adults, from: adults, select: adults });
      // Then the row is the CTE's own projection
      expectTypeOf(rows).toEqualTypeOf<{ id: AuthorId; name: string }[]>();
    });

    it("rejects an entity-mode or scalar CTE", () => {
      // Given an entity-mode query value
      const authors = query({ from: a, select: a });
      // And a scalar query value
      const count = query({ from: b, select: b.id.count() });
      // When either is used as a with clause
      // Then the entity query does not fit
      // @ts-expect-error an entity query has no columns to read by name
      expectTypeOf(authors).toMatchTypeOf<WithInput>();
      // And neither does the scalar query
      // @ts-expect-error a scalar query has no columns to read by name
      expectTypeOf(count).toMatchTypeOf<WithInput>();
    });

    it("still rejects the ctes spelling it does not use", () => {
      const stats = query({ from: b, select: { authorId: b.author_id }, as: "book_stats" });
      // Given `ctes` stays reserved, so the plural spelling is a type error rather than a silent no-op
      // When a query uses that spelling
      const q = {
        // @ts-expect-error: `ctes` stays reserved; the supported spelling is `with`
        ctes: [stats],
        from: a,
        select: { name: a.first_name },
      } satisfies Query;
      // Then the clause is a type error rather than a silent no-op
      expectTypeOf(q).toBeObject();
    });
  });
});
