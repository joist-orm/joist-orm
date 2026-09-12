import { expectTypeOf } from "expect-type";
import { type Query, type WithInput, query, recursiveQuery, sql, table, tables } from "joist-orm";
import { Author, type AuthorId, Book, Publisher } from "src/entities";
import { insertAuthor, insertBook, insertPublisher, select, update } from "src/entities/inserts";
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
       "INSERT INTO books AS b (title, notes, author_id) SELECT sq.title, sq.notes, sq.author_id FROM (WITH titles AS (SELECT b1.title AS title, b1.author_id AS "authorId", b1.notes AS notes FROM books AS b1 WHERE b1.deleted_at IS NULL) SELECT titles.title AS title, titles."authorId" AS author_id, titles.notes AS notes FROM titles) AS sq",
       "select * from "books" order by "id" asc",
     ]
    `);
  });

  describe("mutations", () => {
    it("hoists a CTE for an UPDATE", async () => {
      // Given Author a1, who has a Book
      await insertAuthor({ id: 1, first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      // And Author a2, who has none, so the CTE must not match them
      await insertAuthor({ id: 2, first_name: "a2" });
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      // And a CTE of the Authors that have Books
      const bookAuthors = query({ from: b, select: { authorId: b.author_id }, as: "book_authors" });
      resetQueryCount();
      // When the UPDATE declares it and reads it from the where
      await em.execute({
        update: a,
        with: bookAuthors,
        set: { first_name: "writer" },
        where: a.id.in(query({ from: bookAuthors, select: bookAuthors.authorId })),
      });
      // Then only the Author with a Book is renamed
      expect(await select("authors")).toMatchObject([{ first_name: "writer" }, { first_name: "a2" }]);
      // And the WITH leads the statement, ahead of the UPDATE
      expect(queries).toMatchInlineSnapshot(`
       [
         "WITH book_authors AS (SELECT b.author_id AS "authorId" FROM books AS b WHERE b.deleted_at IS NULL) UPDATE authors AS a SET first_name = $1 WHERE (a.id IN (SELECT book_authors."authorId" AS value FROM book_authors)) AND (a.deleted_at IS NULL)",
         "select * from "authors" order by "id" asc",
       ]
      `);
    });

    it("hoists a CTE for a DELETE", async () => {
      // Given Author a1, who has a Book
      await insertAuthor({ id: 1, first_name: "a1" });
      // And Author a2, who has none
      await insertAuthor({ id: 2, first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      // And a CTE of the Authors that have no Books, which is the set to delete
      const bookAuthors = query({ from: b, select: { authorId: b.author_id }, as: "book_authors" });
      resetQueryCount();
      // When the DELETE declares it and reads it from the where
      await em.execute({
        delete: a,
        with: bookAuthors,
        where: { and: [a.id.nin(query({ from: bookAuthors, select: bookAuthors.authorId }))] },
      });
      // Then only the bookless Author is gone
      expect(await select("authors")).toMatchObject([{ first_name: "a1" }]);
      // And the WITH leads the statement, ahead of the DELETE
      expect(queries).toMatchInlineSnapshot(`
       [
         "WITH book_authors AS (SELECT b.author_id AS "authorId" FROM books AS b WHERE b.deleted_at IS NULL) DELETE FROM authors AS a WHERE (a.id NOT IN (SELECT book_authors."authorId" AS value FROM book_authors)) AND (a.deleted_at IS NULL)",
         "select * from "authors" order by "id" asc",
       ]
      `);
    });

    it("reads a statement's CTE from an INSERT's SELECT source", async () => {
      // Given Author a1 with one Book
      await insertAuthor({ id: 1, first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [b] = tables(Book);
      // And a CTE of the existing Book rows, declared on the INSERT itself rather than on its source
      const titles = query({
        from: b,
        select: { title: b.title, authorId: b.author_id, notes: b.notes },
        as: "titles",
      });
      resetQueryCount();
      // When the INSERT's SELECT source reads that statement-level CTE
      const result = await em.execute({
        insert: b,
        with: titles,
        from: { from: titles, select: { title: titles.title, author_id: titles.authorId, notes: titles.notes } },
      });
      // Then the row is copied
      expect(result).toMatchObject({ rowCount: 1 });
      expect(await select("books")).toMatchObject([{ title: "b1" }, { title: "b1" }]);
      // And the WITH is before the INSERT, with the source reading the CTE by name
      expect(queries).toMatchInlineSnapshot(`
       [
         "WITH titles AS (SELECT b.title AS title, b.author_id AS "authorId", b.notes AS notes FROM books AS b WHERE b.deleted_at IS NULL) INSERT INTO books AS b1 (title, notes, author_id) SELECT sq.title, sq.notes, sq.author_id FROM (SELECT titles.title AS title, titles."authorId" AS author_id, titles.notes AS notes FROM titles) AS sq",
         "select * from "books" order by "id" asc",
       ]
      `);
    });

    it("reads a statement's CTE from an INSERT VALUES cell", async () => {
      // Given Author a1
      await insertAuthor({ id: 1, first_name: "a1" });
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      // And a CTE of the Author ids
      const authorIds = query({ from: a, select: { id: a.id }, as: "author_ids" });
      resetQueryCount();
      // When a VALUES cell is a scalar subquery over that CTE
      await em.execute({
        insert: b,
        with: authorIds,
        values: {
          title: "t1",
          notes: "n1",
          // The cast is a pre-existing gap: `Assignment` does not accept a scalar query(...) in a VALUES
          // cell, with or without a `with` clause. The runtime accepts it, which is what this pins.
          author_id: query({ from: authorIds, select: authorIds.id, limit: 1 }) as any,
        },
      });
      // Then the Book is inserted against the CTE's Author
      expect(await select("books")).toMatchObject([{ title: "t1", author_id: 1 }]);
      // And the VALUES cell reads the CTE without seeing the row being written
      expect(queries).toMatchInlineSnapshot(`
       [
         "WITH author_ids AS (SELECT a.id AS id FROM authors AS a WHERE a.deleted_at IS NULL) INSERT INTO books AS b (title, notes, author_id) VALUES ($1, $2, (SELECT author_ids.id AS value FROM author_ids LIMIT $3))",
         "select * from "books" order by "id" asc",
       ]
      `);
    });

    it("prunes a CTE that the mutation never reads", async () => {
      // Given Author a1
      await insertAuthor({ id: 1, first_name: "a1" });
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      // And a CTE nothing in the statement goes on to read
      const bookAuthors = query({ from: b, select: { authorId: b.author_id }, as: "book_authors" });
      resetQueryCount();
      // When the UPDATE declares it but filters on its own column instead
      await em.execute({ update: a, with: bookAuthors, set: { first_name: "x" }, where: a.id.eq("a:1") });
      // Then the row still updates
      expect(await select("authors")).toMatchObject([{ first_name: "x" }]);
      // And no WITH is emitted, the same pruning a read query does
      expect(queries).toMatchInlineSnapshot(`
       [
         "UPDATE authors AS a SET first_name = $1 WHERE (a.id = $2) AND (a.deleted_at IS NULL)",
         "select * from "authors" order by "id" asc",
       ]
      `);
    });
  });

  describe("recursive", () => {
    it("walks a self-referential tree", async () => {
      // Given root Author a1, who has no mentor
      await insertAuthor({ id: 1, first_name: "root" });
      // And a2, mentored by the root
      await insertAuthor({ id: 2, first_name: "mid", mentor_id: 1 });
      // And a3, mentored by a2, so it is only reachable through two steps
      await insertAuthor({ id: 3, first_name: "leaf", mentor_id: 2 });
      // And an unrelated Author with no mentor chain to the root
      await insertAuthor({ id: 4, first_name: "other", mentor_id: 3 });
      await update("authors", { id: 4, mentor_id: null });
      const em = newEntityManager();
      const [a] = tables(Author);
      // And a recursive CTE seeded with the roots, whose step term joins back to the rows found so far
      const tree = recursiveQuery(
        "tree",
        { from: a, where: a.mentor_id.eq(null), select: { id: a.id, name: a.first_name } },
        (self) => ({
          from: a,
          join: [{ inner: self, on: a.mentor_id.eq(self.id) }],
          select: { id: a.id, name: a.first_name },
        }),
      );
      resetQueryCount();
      // When reading the CTE
      const rows = await em.query({ with: tree, from: tree, select: tree });
      // Then every Author reachable from a root is returned, each once
      expect(rows).toEqual([
        { id: "a:1", name: "root" },
        { id: "a:4", name: "other" },
        { id: "a:2", name: "mid" },
        { id: "a:3", name: "leaf" },
      ]);
      // And the step term keeps its join to the CTE, even though its select reads nothing from it
      expect(queries).toMatchInlineSnapshot(`
       [
         "WITH RECURSIVE tree AS ((SELECT a.id AS id, a.first_name AS name FROM authors AS a WHERE a.mentor_id IS NULL AND a.deleted_at IS NULL) UNION ALL (SELECT a1.id AS id, a1.first_name AS name FROM authors AS a1 JOIN tree ON a1.mentor_id = tree.id WHERE a1.deleted_at IS NULL)) SELECT tree.id AS id, tree.name AS name FROM tree",
       ]
      `);
    });

    it("stops a cycle with union distinct", async () => {
      // Given Author a1
      await insertAuthor({ id: 1, first_name: "a1" });
      // And a2, mentored by a1
      await insertAuthor({ id: 2, first_name: "a2", mentor_id: 1 });
      // And a1 mentored back by a2, so following mentors loops forever
      await update("authors", { id: 1, mentor_id: 2 });
      const em = newEntityManager();
      const [a] = tables(Author);
      // And a recursive CTE that drops duplicate rows instead of keeping every copy
      const chain = recursiveQuery(
        "chain",
        { from: a, where: a.id.eq("a:1"), select: { id: a.id, mentorId: a.mentor_id } },
        (self) => ({
          from: a,
          join: [{ inner: self, on: self.mentorId.eq(a.id) }],
          select: { id: a.id, mentorId: a.mentor_id },
        }),
        { union: "distinct" },
      );
      resetQueryCount();
      // When walking the cycle
      const rows = await em.query({ with: chain, from: chain, select: chain });
      // Then each Author appears once and the walk terminates
      expect(rows).toEqual([
        { id: "a:1", mentorId: "a:2" },
        { id: "a:2", mentorId: "a:1" },
      ]);
      // And the terms are combined with UNION, not UNION ALL
      expect(queries).toMatchInlineSnapshot(`
       [
         "WITH RECURSIVE chain AS ((SELECT a.id AS id, a.mentor_id AS "mentorId" FROM authors AS a WHERE a.id = $1 AND a.deleted_at IS NULL) UNION (SELECT a1.id AS id, a1.mentor_id AS "mentorId" FROM authors AS a1 JOIN chain ON chain."mentorId" = a1.id WHERE a1.deleted_at IS NULL)) SELECT chain.id AS id, chain."mentorId" AS "mentorId" FROM chain",
       ]
      `);
    });

    it("makes the whole clause RECURSIVE when mixed with a plain CTE", async () => {
      // Given root Author a1
      await insertAuthor({ id: 1, first_name: "root" });
      // And a Book, so the plain CTE has a row
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      // And a plain CTE of the Authors that have Books
      const bookAuthors = query({ from: b, select: { authorId: b.author_id }, as: "book_authors" });
      // And a recursive CTE of the mentor tree
      const tree = recursiveQuery("tree", { from: a, where: a.mentor_id.eq(null), select: { id: a.id } }, (self) => ({
        from: a,
        join: [{ inner: self, on: a.mentor_id.eq(self.id) }],
        select: { id: a.id },
      }));
      resetQueryCount();
      // When both are read
      const rows = await em.query({
        with: [bookAuthors, tree],
        from: tree,
        join: [{ inner: bookAuthors, on: bookAuthors.authorId.eq(tree.id) }],
        select: { id: tree.id, authorId: bookAuthors.authorId },
      });
      // Then the root Author comes back
      expect(rows).toEqual([{ id: "a:1", authorId: "a:1" }]);
      // And RECURSIVE is on the clause, not on the one entry that needs it
      expect(queries).toMatchInlineSnapshot(`
       [
         "WITH RECURSIVE book_authors AS (SELECT b.author_id AS "authorId" FROM books AS b WHERE b.deleted_at IS NULL), tree AS ((SELECT a.id AS id FROM authors AS a WHERE a.mentor_id IS NULL AND a.deleted_at IS NULL) UNION ALL (SELECT a1.id AS id FROM authors AS a1 JOIN tree ON a1.mentor_id = tree.id WHERE a1.deleted_at IS NULL)) SELECT tree.id AS id, book_authors."authorId" AS "authorId" FROM tree JOIN book_authors ON book_authors."authorId" = tree.id",
       ]
      `);
    });

    it("rejects a base term without named columns", async () => {
      const [a] = tables(Author);
      // Given a base term that selects entities rather than named columns
      // When the recursive CTE is built
      // Then it is rejected, because a CTE must be a table shape
      expect(() =>
        recursiveQuery("tree", { from: a, select: a } as any, (self: any) => ({ from: a, select: { id: a.id } })),
      ).toThrow("A recursive CTE's base term needs a named projection");
    });

    it("rejects an unnamed recursive CTE", async () => {
      const [a] = tables(Author);
      // Given an empty name, which the step term could not reference
      // When the recursive CTE is built
      // Then it is rejected
      expect(() =>
        recursiveQuery("" as any, { from: a, select: { id: a.id } }, () => ({ from: a, select: { id: a.id } })),
      ).toThrow("A recursive CTE needs a name");
    });

    it("rejects an unknown union option", async () => {
      const [a] = tables(Author);
      // Given a union option that is neither 'all' nor 'distinct'
      // When the recursive CTE is built
      // Then it is rejected before any SQL is generated
      expect(() =>
        recursiveQuery("tree", { from: a, select: { id: a.id } }, () => ({ from: a, select: { id: a.id } }), {
          union: "nope" as any,
        }),
      ).toThrow("A recursive CTE's union must be 'all' or 'distinct'");
    });
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

    it("takes a recursive CTE's row type from its base term", async () => {
      const em = newEntityManager();
      // Given a recursive CTE whose base term projects an AuthorId and a name
      const tree = recursiveQuery(
        "tree",
        { from: a, where: a.mentor_id.eq(null), select: { id: a.id, name: a.first_name } },
        (self) => ({
          from: a,
          join: [{ inner: self, on: a.mentor_id.eq(self.id) }],
          select: { id: a.id, name: a.first_name },
        }),
      );
      // When it is read
      const rows = await em.query({ with: tree, from: tree, select: tree });
      // Then the row is the base term's projection, which is what PostgreSQL gives the CTE
      expectTypeOf(rows).toEqualTypeOf<{ id: AuthorId; name: string }[]>();
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
