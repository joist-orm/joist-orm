import { Query, alias, aliases, query, sql } from "joist-orm";
import {
  Author,
  Book,
  BookRange,
  BookReview,
  Comment,
  LargePublisher,
  Publisher,
  PublisherSize,
  SmallPublisher,
} from "src/entities";
import {
  insertAuthor,
  insertBook,
  insertBookReview,
  insertComment,
  insertLargePublisher,
  insertPublisher,
} from "src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

/**
 * `em.query`: SQL-shaped queries as plain object literals.
 *
 * The "before" examples these are seeded from are the `em-query-*.ts` files at the repo root (production
 * `buildQuery`/knex queries), rewritten here to the Author/Book/BookReview test domain.
 */
describe("EntityManager.rawQueries", () => {
  describe("select shapes", () => {
    it("returns entities for a bare alias", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      const em = newEntityManager();
      const [a] = aliases(Author);
      resetQueryCount();
      const authors = await em.query({ from: a, where: { and: [a.firstName.eq("a1")] }, select: a });
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
      expect(queries).toEqual(["SELECT a.* FROM authors AS a WHERE a.first_name = $1"]);
    });

    it("returns entities through the identity map", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const a1 = await em.load(Author, "a:1");
      const [a] = aliases(Author);
      const [found] = await em.query({ from: a, select: a });
      expect(found).toBe(a1);
    });

    it("returns POJOs and decodes ids, enums, and nulls", async () => {
      await insertAuthor({ first_name: "a1", age: 30, range_of_books: 1 });
      await insertAuthor({ first_name: "a2" });
      const em = newEntityManager();
      const [a] = aliases(Author);
      const rows = await em.query({
        from: a,
        select: { authorId: a.id, name: a.firstName, age: a.age, range: a.rangeOfBooks },
        orderBy: [{ asc: a.firstName }],
      });
      expect(rows).toEqual([
        { authorId: "a:1", name: "a1", age: 30, range: BookRange.Few },
        { authorId: "a:2", name: "a2", age: null, range: null },
      ]);
    });

    it("returns a subquery's rows for a bare subquery", async () => {
      await insertAuthor({ first_name: "a1", age: 30 });
      await insertAuthor({ first_name: "a2", age: 10 });
      const em = newEntityManager();
      const [a] = aliases(Author);
      const adults = query({ from: a, where: { and: [a.age.gte(18)] }, select: { id: a.id, name: a.firstName } });
      const rows = await em.query({ from: adults, select: adults, orderBy: [{ asc: adults.name }] });
      expect(rows).toEqual([{ id: "a:1", name: "a1" }]);
    });

    it("hydrates CTI subtypes in entity mode", async () => {
      await insertPublisher({ id: 1, name: "small" });
      await insertLargePublisher({ id: 2, name: "large" });
      const em = newEntityManager();
      const [p] = aliases(Publisher);
      const publishers = await em.query({ from: p, select: p, orderBy: [{ asc: p.id }] });
      expect(publishers[0]).toBeInstanceOf(SmallPublisher);
      expect(publishers[1]).toBeInstanceOf(LargePublisher);
    });

    it("can filter a CTI subtype alias on a base-table field", async () => {
      await insertPublisher({ id: 1, name: "p1" });
      await insertPublisher({ id: 2, name: "p2" });
      const em = newEntityManager();
      const [sp] = aliases(SmallPublisher);
      const rows = await em.query({ from: sp, where: { and: [sp.name.eq("p2")] }, select: { name: sp.name } });
      expect(rows).toEqual([{ name: "p2" }]);
    });
  });

  describe("joins", () => {
    it("can inner join with an on condition, in either direction", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      const fromAuthor = await em.query({
        from: a,
        join: [{ inner: b, on: b.author.eq(a.id) }],
        select: { author: a.firstName, title: b.title },
      });
      expect(fromAuthor).toEqual([{ author: "a1", title: "b1" }]);
      const fromBook = await em.query({
        from: b,
        join: [{ inner: a, on: b.author.eq(a.id) }],
        select: { author: a.firstName, title: b.title },
      });
      expect(fromBook).toEqual([{ author: "a1", title: "b1" }]);
    });

    it("can left join", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [{ left: b, on: b.author.eq(a.id) }],
        select: { author: a.firstName, title: b.title },
        orderBy: [{ asc: a.firstName }],
      });
      expect(rows).toEqual([
        { author: "a1", title: "b1" },
        { author: "a2", title: null },
      ]);
      expect(queries).toEqual([
        "SELECT a.first_name AS author, b.title AS title FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id ORDER BY a.first_name ASC",
      ]);
    });

    it("can join with a non-FK condition and a named self-join alias", async () => {
      // Author self-join: mentees whose mentor is older than them
      await insertAuthor({ first_name: "mentor", age: 50 });
      await insertAuthor({ first_name: "mentee", age: 25, mentor_id: 1 });
      await insertAuthor({ first_name: "peer", age: 60, mentor_id: 1 });
      const em = newEntityManager();
      const [a] = aliases(Author);
      const m = alias(Author, "m");
      const rows = await em.query({
        from: a,
        join: [{ inner: m, on: a.mentor.eq(m.id) }],
        where: { and: [m.age.gt(a.age)] },
        select: { mentee: a.firstName, mentor: m.firstName },
      });
      expect(rows).toEqual([{ mentee: "mentee", mentor: "mentor" }]);
    });
  });

  describe("aggregates", () => {
    it("can group by with count", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [{ inner: b, on: b.author.eq(a.id) }],
        groupBy: [a.firstName],
        select: { name: a.firstName, bookCount: b.id.count() },
      });
      expect(rows).toEqual([{ name: "a1", bookCount: 2 }]);
      expect(queries).toEqual([
        'SELECT a.first_name AS name, count(b.id)::int AS "bookCount" FROM authors AS a JOIN books AS b ON b.author_id = a.id GROUP BY a.first_name',
      ]);
    });

    it("can select multiple aggregates", async () => {
      await insertAuthor({ first_name: "a1", age: 20 });
      await insertAuthor({ first_name: "a2", age: 40 });
      const em = newEntityManager();
      const [a] = aliases(Author);
      const [row] = await em.query({
        from: a,
        select: {
          total: a.id.count(),
          distinctNames: a.firstName.countDistinct(),
          sumAge: a.age.sum(),
          avgAge: a.age.avg(),
          minAge: a.age.min(),
          maxAge: a.age.max(),
          names: a.firstName.stringAgg(", "),
          // `max` of an id column is still a tagged id
          maxId: a.id.max(),
        },
      });
      expect(row).toEqual({
        total: 2,
        distinctNames: 2,
        sumAge: 60,
        avgAge: 30,
        minAge: 20,
        maxAge: 40,
        names: "a1, a2",
        maxId: "a:2",
      });
    });

    it("can filter groups with having", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      await insertBook({ title: "b3", author_id: 2 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      const rows = await em.query({
        from: a,
        join: [{ inner: b, on: b.author.eq(a.id) }],
        groupBy: [a.firstName],
        having: { and: [b.id.count().gt(1)] },
        select: { name: a.firstName, bookCount: b.id.count() },
      });
      expect(rows).toEqual([{ name: "a1", bookCount: 2 }]);
    });

    it("can use nin and arrayAgg", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      await insertBook({ title: "b3", author_id: 2 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      const rows = await em.query({
        from: a,
        join: [{ inner: b, on: b.author.eq(a.id) }],
        where: { and: [a.firstName.nin(["a2"])] },
        groupBy: [a.firstName],
        select: { name: a.firstName, titles: b.title.arrayAgg(), bookIds: b.id.arrayAgg() },
      });
      // array_agg has no intra-aggregate ORDER BY, so Postgres may return the elements in any order
      const [row] = rows;
      expect({ ...row, titles: [...row.titles].sort(), bookIds: [...row.bookIds].sort() }).toEqual({
        name: "a1",
        titles: ["b1", "b2"],
        bookIds: ["b:1", "b:2"],
      });
    });

    // From em-query-sample-bills.ts: entity mode + GROUP BY the PK + ORDER BY an aggregate
    it("can return entities ordered by an aggregate", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 2 });
      await insertBook({ title: "b3", author_id: 2 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      const authors = await em.query({
        from: a,
        join: [{ inner: b, on: b.author.eq(a.id) }],
        groupBy: [a.id],
        select: a,
        orderBy: [{ desc: b.id.count() }],
      });
      expect(authors).toMatchEntity([{ firstName: "a2" }, { firstName: "a1" }]);
    });
  });

  describe("pruning", () => {
    it("prunes undefined conditions", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      const em = newEntityManager();
      const [a] = aliases(Author);
      const nameFilter: string | undefined = undefined;
      resetQueryCount();
      const rows = await em.query({
        from: a,
        where: { and: [a.firstName.eq(nameFilter)] },
        select: { name: a.firstName },
        orderBy: [{ asc: a.firstName }],
      });
      expect(rows).toEqual([{ name: "a1" }, { name: "a2" }]);
      expect(queries).toEqual(["SELECT a.first_name AS name FROM authors AS a ORDER BY a.first_name ASC"]);
    });

    it("prunes joins that nothing references anymore", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      const titleFilter: string | undefined = undefined;
      resetQueryCount();
      // The join is declared unconditionally; its only reference is the pruned condition
      const rows = await em.query({
        from: a,
        join: [{ inner: b, on: b.author.eq(a.id) }],
        where: { and: [b.title.eq(titleFilter)] },
        select: { name: a.firstName },
        orderBy: [{ asc: a.firstName }],
      });
      // a2 has no books, so an un-pruned inner join would have dropped it
      expect(rows).toEqual([{ name: "a1" }, { name: "a2" }]);
      expect(queries).toEqual(["SELECT a.first_name AS name FROM authors AS a ORDER BY a.first_name ASC"]);
      // ...and with a value, the condition and its join both survive
      resetQueryCount();
      const filtered = await em.query({
        from: a,
        join: [{ inner: b, on: b.author.eq(a.id) }],
        where: { and: [b.title.eq("b1")] },
        select: { name: a.firstName },
      });
      expect(filtered).toEqual([{ name: "a1" }]);
      expect(queries).toEqual([
        "SELECT a.first_name AS name FROM authors AS a JOIN books AS b ON b.author_id = a.id WHERE b.title = $1",
      ]);
    });

    it("keeps a join pinned with keep", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      // An inner join used as an existence filter would otherwise prune
      const rows = await em.query({
        from: a,
        join: [{ inner: b, on: b.author.eq(a.id), keep: true }],
        select: { name: a.firstName },
      });
      expect(rows).toEqual([{ name: "a1" }]);
    });

    it("keeps every join with pruneJoins false", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      const rows = await em.query({
        from: a,
        join: [{ inner: b, on: b.author.eq(a.id) }],
        select: { name: a.firstName },
        pruneJoins: false,
      });
      expect(rows).toEqual([{ name: "a1" }]);
    });

    it("fails when a referenced join has no on condition left", async () => {
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      const authorId: string | undefined = undefined;
      await expect(
        em.query({ from: a, join: [{ inner: b, on: b.author.eq(authorId) }], select: { title: b.title } }),
      ).rejects.toThrow("has no ON condition left");
    });

    // From em-query-cnage-requests.ts: the original grew its joins imperatively (`if (x) query.leftJoin(...)`);
    // here every join is declared once and only the referenced ones survive
    it("declares many optional joins once and keeps only the referenced ones", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 5 });
      await insertComment({ text: "c1", parent_author_id: 1 });
      const em = newEntityManager();
      const [a, b, br, c] = aliases(Author, Book, BookReview, Comment);
      const minRating: number | undefined = 4;
      const commentText: string | undefined = undefined;
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [
          { left: b, on: b.author.eq(a.id) },
          { left: br, on: br.book.eq(b.id) },
          { left: c, on: c.parent.eq(a.id) },
        ],
        where: { and: [br.rating.gte(minRating), c.text.eq(commentText)] },
        distinct: true,
        select: { name: a.firstName },
      });
      expect(rows).toEqual([{ name: "a1" }]);
      // `c` pruned with its condition; `br` kept, and `b` kept because `br`'s ON needs it
      expect(queries).toEqual([
        "SELECT DISTINCT a.first_name AS name FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id LEFT OUTER JOIN book_reviews AS br ON br.book_id = b.id WHERE br.rating >= $1",
      ]);
    });
  });

  describe("ordering and paging", () => {
    it("can order by select keys", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      await insertBook({ title: "b3", author_id: 2 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [{ inner: b, on: b.author.eq(a.id) }],
        groupBy: [a.firstName],
        select: { name: a.firstName, bookCount: b.id.count() },
        orderBy: { bookCount: "DESC", name: "ASC NULLS LAST" },
      });
      expect(rows).toEqual([
        { name: "a1", bookCount: 2 },
        { name: "a2", bookCount: 1 },
      ]);
      expect(queries).toEqual([
        `SELECT a.first_name AS name, count(b.id)::int AS "bookCount" FROM authors AS a JOIN books AS b ON b.author_id = a.id GROUP BY a.first_name ORDER BY "bookCount" DESC, name ASC NULLS LAST`,
      ]);
    });

    it("can order entities with the keyed form", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      const em = newEntityManager();
      const [a] = aliases(Author);
      const authors = await em.query({ from: a, select: a, orderBy: { firstName: "DESC" } });
      expect(authors).toMatchEntity([{ firstName: "a2" }, { firstName: "a1" }]);
    });

    it("prunes keyed orderBy entries given undefined", async () => {
      await insertAuthor({ first_name: "a2" });
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const [a] = aliases(Author);
      const byAge: "ASC" | undefined = undefined;
      resetQueryCount();
      const rows = await em.query({
        from: a,
        select: { name: a.firstName, age: a.age },
        orderBy: { age: byAge, name: "ASC" },
      });
      expect(rows).toMatchObject([{ name: "a1" }, { name: "a2" }]);
      expect(queries).toEqual(["SELECT a.first_name AS name, a.age AS age FROM authors AS a ORDER BY name ASC"]);
    });

    it("rejects an orderBy key not in select", async () => {
      const em = newEntityManager();
      const [a] = aliases(Author);
      await expect(
        em.query({ from: a, select: { name: a.firstName }, orderBy: { lastName: "ASC" } as any }),
      ).rejects.toThrow("orderBy key 'lastName' is not a key of select");
    });

    it("rejects an invalid orderBy direction", async () => {
      const em = newEntityManager();
      const [a] = aliases(Author);
      await expect(
        em.query({ from: a, select: { name: a.firstName }, orderBy: { name: "ASC; DROP TABLE" as any } }),
      ).rejects.toThrow("Invalid orderBy direction");
    });

    it("can order with nulls last, limit, and offset", async () => {
      await insertAuthor({ first_name: "a1", age: 10 });
      await insertAuthor({ first_name: "a2" });
      await insertAuthor({ first_name: "a3", age: 20 });
      const em = newEntityManager();
      const [a] = aliases(Author);
      const rows = await em.query({
        from: a,
        select: { name: a.firstName },
        orderBy: [{ desc: a.age, nulls: "last" }, { asc: a.firstName }],
      });
      expect(rows).toEqual([{ name: "a3" }, { name: "a1" }, { name: "a2" }]);
      const page = await em.query({
        from: a,
        select: { name: a.firstName },
        orderBy: [{ asc: a.firstName }],
        limit: 1,
        offset: 1,
      });
      expect(page).toEqual([{ name: "a2" }]);
    });

    it("can order by a sql expression and prune undefined order-bys", async () => {
      await insertAuthor({ first_name: "a1", age: 10 });
      await insertAuthor({ first_name: "a2", age: 20 });
      const em = newEntityManager();
      const [a] = aliases(Author);
      const secondary: boolean = false;
      const rows = await em.query({
        from: a,
        select: { name: a.firstName },
        orderBy: [{ desc: sql<number>`${a.age} * 2` }, secondary ? { asc: a.firstName } : undefined],
      });
      expect(rows).toEqual([{ name: "a2" }, { name: "a1" }]);
    });

    // From em-query-available-ffs.ts: a DISTINCT over one enum column, decoded to enum values
    it("can select distinct enum values", async () => {
      await insertPublisher({ id: 1, name: "p1", size_id: 1 });
      await insertPublisher({ id: 2, name: "p2", size_id: 1 });
      await insertLargePublisher({ id: 3, name: "p3", size_id: 2 });
      const em = newEntityManager();
      const [p] = aliases(Publisher);
      const rows = await em.query({ from: p, distinct: true, select: { size: p.size }, orderBy: [{ asc: p.size }] });
      expect(rows).toEqual([{ size: PublisherSize.Small }, { size: PublisherSize.Large }]);
    });
  });

  describe("composition", () => {
    it("can left join a subquery and coalesce its columns", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      const bookStats = query({
        from: b,
        groupBy: [b.author],
        select: { authorId: b.author, bookCount: b.id.count(), lastTitle: b.title.max() },
        as: "book_stats",
      });
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [{ left: bookStats, on: bookStats.authorId.eq(a.id) }],
        select: { name: a.firstName, bookCount: bookStats.bookCount.coalesce(0), lastTitle: bookStats.lastTitle },
        orderBy: [{ asc: a.firstName }],
      });
      expect(rows).toEqual([
        { name: "a1", bookCount: 2, lastTitle: "b2" },
        { name: "a2", bookCount: 0, lastTitle: null },
      ]);
      expect(queries).toEqual([
        'SELECT a.first_name AS name, coalesce(book_stats."bookCount", $1) AS "bookCount", book_stats."lastTitle" AS "lastTitle" FROM authors AS a LEFT OUTER JOIN (SELECT b.author_id AS "authorId", count(b.id)::int AS "bookCount", max(b.title) AS "lastTitle" FROM books AS b GROUP BY b.author_id) AS book_stats ON book_stats."authorId" = a.id ORDER BY a.first_name ASC',
      ]);
    });

    it("can chain a subquery on a subquery", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      await insertBook({ title: "b3", author_id: 2 });
      const em = newEntityManager();
      const [b] = aliases(Book);
      const bookStats = query({
        from: b,
        groupBy: [b.author],
        select: { authorId: b.author, bookCount: b.id.count() },
      });
      const prolific = query({
        from: bookStats,
        where: { and: [bookStats.bookCount.gte(2)] },
        select: { authorId: bookStats.authorId, bookCount: bookStats.bookCount },
      });
      const rows = await em.query({ from: prolific, select: prolific });
      expect(rows).toEqual([{ authorId: "a:1", bookCount: 2 }]);
    });

    it("can select a correlated scalar subquery", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      const rows = await em.query({
        from: a,
        select: {
          name: a.firstName,
          // The subquery closes over `a`, and `coalesce` covers the no-row case
          bookCount: query({ from: b, where: { and: [b.author.eq(a.id)] }, select: b.id.count() }).coalesce(0),
        },
        orderBy: [{ asc: a.firstName }],
      });
      expect(rows).toEqual([
        { name: "a1", bookCount: 1 },
        { name: "a2", bookCount: 0 },
      ]);
    });

    it("can use a subquery in in()", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      const authors = await em.query({
        from: a,
        where: { and: [a.id.in(query({ from: b, where: { and: [b.title.eq("b1")] }, select: b.author }))] },
        select: a,
      });
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
    });

    // From em-query-sample-bills.ts: one base spread into the page query and the count query
    it("can spread a base query into a page and a count", async () => {
      await insertAuthor({ first_name: "a1", age: 20 });
      await insertAuthor({ first_name: "a2", age: 30 });
      await insertAuthor({ first_name: "kid", age: 10 });
      const em = newEntityManager();
      const [a] = aliases(Author);
      const base = { from: a, where: { and: [a.age.gte(18)] } } satisfies Omit<Query, "select">;
      const page = await em.query({
        ...base,
        select: { name: a.firstName },
        orderBy: [{ asc: a.firstName }],
        limit: 1,
      });
      const [{ total }] = await em.query({ ...base, select: { total: a.id.count() } });
      expect(page).toEqual([{ name: "a1" }]);
      expect(total).toBe(2);
    });

    it("runs a query value the same as its POJO", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const [a] = aliases(Author);
      const q = { from: a, select: { name: a.firstName } } satisfies Query;
      expect(await em.query(query(q))).toEqual(await em.query(q));
    });
  });

  describe("raw sql escape hatches", () => {
    // From em-query-sample-1.ts: a condition on a column Joist does not model (`ts_search`)
    it("can use sql.condition and sql.ref for unmodeled columns", async () => {
      await insertAuthor({ first_name: "a1", age: 30 });
      await insertAuthor({ first_name: "a2", age: 40 });
      const em = newEntityManager();
      const [a] = aliases(Author);
      const rows = await em.query({
        from: a,
        where: { and: [sql.condition`${sql.ref<number>(a, "age")} > ${35}`] },
        select: { name: a.firstName },
      });
      expect(rows).toEqual([{ name: "a2" }]);
    });

    // From em-query-sample-approvals.ts: per-component IS NOT NULL on a polymorphic reference
    it("can filter a polymorphic component with sql.ref", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertComment({ text: "on author", parent_author_id: 1 });
      await insertComment({ text: "on book", parent_book_id: 1 });
      const em = newEntityManager();
      const [c] = aliases(Comment);
      const rows = await em.query({
        from: c,
        where: { and: [sql.condition`${sql.ref(c, "parent_author_id")} IS NOT NULL`] },
        select: { text: c.text },
      });
      expect(rows).toEqual([{ text: "on author" }]);
    });

    // From em-query-sample-bid-contract-items.ts: a CASE expression over an interpolated condition
    it("can compute a CASE expression with an interpolated condition", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1, order: 1 });
      await insertBook({ title: "b2", author_id: 1, order: 2 });
      await insertBookReview({ book_id: 1, rating: 5 });
      const em = newEntityManager();
      const [b, br] = aliases(Book, BookReview);
      const rows = await em.query({
        from: b,
        join: [{ left: br, on: br.book.eq(b.id) }],
        select: {
          title: b.title,
          needsReview: sql<boolean>`CASE WHEN ${b.order.in([1, 2])} AND ${br.id} IS NULL THEN true ELSE false END`,
        },
        orderBy: [{ asc: b.title }],
      });
      expect(rows).toEqual([
        { title: "b1", needsReview: false },
        { title: "b2", needsReview: true },
      ]);
    });

    it("can use a window function", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      const em = newEntityManager();
      const [b] = aliases(Book);
      // Window functions are not modeled; `sql` renders the interpolated columns with the right alias
      const rows = await em.query({
        from: b,
        select: {
          title: b.title,
          rank: sql<number>`row_number() OVER (PARTITION BY ${b.author} ORDER BY ${b.title} DESC)::int`,
        },
        orderBy: [{ asc: b.title }],
      });
      expect(rows).toEqual([
        { title: "b1", rank: 2 },
        { title: "b2", rank: 1 },
      ]);
    });

    it("can emulate DISTINCT ON with a ranked subquery", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      await insertBook({ title: "b3", author_id: 2 });
      const em = newEntityManager();
      const [b] = aliases(Book);
      // `DISTINCT ON` is not supported; the latest book per author is a window function plus a filter
      const ranked = query({
        from: b,
        select: {
          authorId: b.author,
          title: b.title,
          rank: sql<number>`row_number() OVER (PARTITION BY ${b.author} ORDER BY ${b.title} DESC)::int`,
        },
        as: "ranked",
      });
      const rows = await em.query({
        from: ranked,
        where: { and: [ranked.rank.eq(1)] },
        select: { authorId: ranked.authorId, title: ranked.title },
        orderBy: [{ asc: ranked.authorId }],
      });
      expect(rows).toEqual([
        { authorId: "a:1", title: "b2" },
        { authorId: "a:2", title: "b3" },
      ]);
    });

    it("can use an aggregate FILTER clause", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 5 });
      await insertBookReview({ book_id: 1, rating: 2 });
      const em = newEntityManager();
      const [a, b, br] = aliases(Author, Book, BookReview);
      // `FILTER (WHERE ...)` is not modeled; the interpolated condition renders with bindings
      const rows = await em.query({
        from: a,
        join: [
          { inner: b, on: b.author.eq(a.id) },
          { inner: br, on: br.book.eq(b.id) },
        ],
        groupBy: [a.firstName],
        select: {
          name: a.firstName,
          reviews: br.id.count(),
          goodReviews: sql<number>`count(${br.id}) FILTER (WHERE ${br.rating.gte(4)})::int`,
        },
      });
      expect(rows).toEqual([{ name: "a1", reviews: 2, goodReviews: 1 }]);
    });

    it("can use EXISTS with an interpolated subquery", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      // `EXISTS` is not modeled; `a.id.in(query(...))` is the idiomatic spelling, but the raw form works too
      const rows = await em.query({
        from: a,
        where: {
          and: [sql.condition`EXISTS ${query({ from: b, where: { and: [b.author.eq(a.id)] }, select: b.id })}`],
        },
        select: { name: a.firstName },
      });
      expect(rows).toEqual([{ name: "a1" }]);
    });

    // From em-query-sample-trade-partner-allowed.ts: UNION is not supported, so run each side and merge
    it("can emulate UNION by merging separate queries", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertAuthor({ first_name: "a3" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertComment({ text: "c1", parent_author_id: 2 });
      const em = newEntityManager();
      const [a, b, c] = aliases(Author, Book, Comment);
      const withBooks = await em.query({
        from: b,
        join: [{ inner: a, on: b.author.eq(a.id) }],
        distinct: true,
        select: { authorId: a.id },
      });
      const withComments = await em.query({
        from: c,
        join: [{ inner: a, on: c.parent.eq(a.id) }],
        distinct: true,
        select: { authorId: a.id },
      });
      const authorIds = [...new Set([...withBooks, ...withComments].map((r) => r.authorId))].sort();
      expect(authorIds).toEqual(["a:1", "a:2"]);
    });
  });

  // From em-query-user-documents.ts: computed sort keys, `NULLS LAST`, and filtering through a subquery
  // instead of a fan-out join, so no DISTINCT is needed
  it("can sort by computed flags and filter through a subquery", async () => {
    await insertAuthor({ first_name: "a1", age: 30 });
    await insertAuthor({ first_name: "a2" });
    await insertAuthor({ first_name: "a3", age: 50 });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 3 });
    const em = newEntityManager();
    const [a, b] = aliases(Author, Book);
    const isSenior = sql<boolean>`${a.age} >= ${40}`;
    const rows = await em.query({
      from: a,
      where: {
        and: [{ or: [a.id.in(query({ from: b, select: b.author })), a.age.eq(null)] }],
      },
      select: { name: a.firstName, senior: isSenior },
      orderBy: [{ desc: isSenior, nulls: "last" }, { asc: a.firstName }],
    });
    expect(rows).toEqual([
      { name: "a3", senior: true },
      { name: "a1", senior: false },
      { name: "a2", senior: null },
    ]);
  });
});
