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
  Tag,
  Task,
  TaskItem,
  TaskNew,
  TaskOld,
} from "src/entities";
import {
  insertAuthor,
  insertAuthorToTag,
  insertBook,
  insertBookReview,
  insertComment,
  insertLargePublisher,
  insertPublisher,
  insertTag,
  insertTask,
  insertTaskItem,
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
      expect(queries).toEqual(["SELECT a.* FROM authors AS a WHERE (a.first_name = $1) AND a.deleted_at IS NULL"]);
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

    it("rejects non-identifier select keys and as names", async () => {
      const em = newEntityManager();
      const [a] = aliases(Author);
      // A key that crossed an `any` boundary must not reach the SQL; kq is for trusted metadata only
      const key = 'name" FROM authors; --';
      await expect(em.query({ from: a, select: { [key]: a.firstName } } as any)).rejects.toThrow("Invalid identifier");
      const sub = query({ from: a, select: { name: a.firstName }, as: 'x" --' as any });
      await expect(em.query({ from: sub, select: sub })).rejects.toThrow("Invalid identifier");
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
        "SELECT a.first_name AS author, b.title AS title FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE a.deleted_at IS NULL ORDER BY a.first_name ASC",
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

  describe("relationship join sugar", () => {
    it("joins a collection as a left join by default", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [a.books.as(b)],
        select: { author: a.firstName, title: b.title },
        orderBy: { author: "ASC" },
      });
      expect(rows).toEqual([
        { author: "a1", title: "b1" },
        { author: "a2", title: null },
      ]);
      expect(queries).toEqual([
        "SELECT a.first_name AS author, b.title AS title FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE a.deleted_at IS NULL ORDER BY author ASC",
      ]);
    });

    it("can inner join a collection to filter", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      const rows = await em.query({
        from: a,
        join: [a.books.inner(b)],
        select: { author: a.firstName, title: b.title },
      });
      expect(rows).toEqual([{ author: "a1", title: "b1" }]);
    });

    it("joins a required reference as an inner join", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      resetQueryCount();
      const rows = await em.query({ from: b, join: [b.author.as(a)], select: { title: b.title, author: a.firstName } });
      expect(rows).toEqual([{ title: "b1", author: "a1" }]);
      expect(queries).toEqual([
        "SELECT b.title AS title, a.first_name AS author FROM books AS b JOIN authors AS a ON b.author_id = a.id AND a.deleted_at IS NULL WHERE b.deleted_at IS NULL",
      ]);
    });

    it("joins a nullable reference as a left join, with a named self-join alias", async () => {
      await insertAuthor({ first_name: "mentor" });
      await insertAuthor({ first_name: "mentee", mentor_id: 1 });
      const em = newEntityManager();
      const [a] = aliases(Author);
      const m = alias(Author, "m");
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [a.mentor.as(m)],
        select: { name: a.firstName, mentor: m.firstName },
        orderBy: { name: "ASC" },
      });
      expect(rows).toEqual([
        { name: "mentee", mentor: "mentor" },
        { name: "mentor", mentor: null },
      ]);
      expect(queries).toEqual([
        "SELECT a.first_name AS name, a1.first_name AS mentor FROM authors AS a LEFT OUTER JOIN authors AS a1 ON a.mentor_id = a1.id AND a1.deleted_at IS NULL WHERE a.deleted_at IS NULL ORDER BY name ASC",
      ]);
    });

    it("joins a one-to-one as a left join", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1, prequel_id: 1 });
      const em = newEntityManager();
      const [b] = aliases(Book);
      const s = alias(Book, "s");
      resetQueryCount();
      const rows = await em.query({
        from: b,
        join: [b.sequel.as(s)],
        select: { title: b.title, sequel: s.title },
        orderBy: { title: "ASC" },
      });
      expect(rows).toEqual([
        { title: "b1", sequel: "b2" },
        { title: "b2", sequel: null },
      ]);
      expect(queries).toEqual([
        "SELECT b.title AS title, b1.title AS sequel FROM books AS b LEFT OUTER JOIN books AS b1 ON b1.prequel_id = b.id AND b1.deleted_at IS NULL WHERE b.deleted_at IS NULL ORDER BY title ASC",
      ]);
    });

    it("joins a many-to-many through its join table", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertTag({ name: "t1" });
      await insertAuthorToTag({ author_id: 1, tag_id: 1 });
      const em = newEntityManager();
      const [a, t] = aliases(Author, Tag);
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [a.tags.as(t)],
        select: { author: a.firstName, tag: t.name },
        orderBy: { author: "ASC" },
      });
      expect(rows).toEqual([
        { author: "a1", tag: "t1" },
        { author: "a2", tag: null },
      ]);
      expect(queries).toEqual([
        "SELECT a.first_name AS author, t.name AS tag FROM authors AS a LEFT OUTER JOIN authors_to_tags AS att ON att.author_id = a.id LEFT OUTER JOIN tags AS t ON t.id = att.tag_id WHERE a.deleted_at IS NULL ORDER BY author ASC",
      ]);
    });

    it("joins a polymorphic reference by the argument's component", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertComment({ text: "c1", parent_author_id: 1 });
      const em = newEntityManager();
      const [c, a] = aliases(Comment, Author);
      resetQueryCount();
      const rows = await em.query({ from: c, join: [c.parent.as(a)], select: { text: c.text, author: a.firstName } });
      expect(rows).toEqual([{ text: "c1", author: "a1" }]);
      expect(queries).toEqual([
        "SELECT c.text AS text, a.first_name AS author FROM comments AS c JOIN authors AS a ON c.parent_author_id = a.id AND a.deleted_at IS NULL",
      ]);
    });

    it("prunes sugar joins nothing references, m2m join tables included", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const [a, b, t] = aliases(Author, Book, Tag);
      const filter: string | undefined = undefined;
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [a.books.as(b), a.tags.as(t)],
        where: { and: [b.title.eq(filter), t.name.eq(filter)] },
        select: { name: a.firstName },
      });
      expect(rows).toEqual([{ name: "a1" }]);
      expect(queries).toEqual(["SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL"]);
    });

    it("mixes sugar and expanded joins in one array", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ rating: 5, book_id: 1 });
      const em = newEntityManager();
      const [a, b, br] = aliases(Author, Book, BookReview);
      const rows = await em.query({
        from: a,
        join: [a.books.inner(b), { left: br, on: br.book.eq(b.id) }],
        select: { title: b.title, rating: br.rating },
      });
      expect(rows).toEqual([{ title: "b1", rating: 5 }]);
    });

    it("rejects a sugar join whose receiver is not in the query", async () => {
      const em = newEntityManager();
      const [a, b, t] = aliases(Author, Book, Tag);
      await expect(em.query({ from: b, join: [a.tags.as(t)], select: { tag: t.name } })).rejects.toThrow(
        "is not in this query's from/join",
      );
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
        'SELECT a.first_name AS name, count(b.id)::int AS "bookCount" FROM authors AS a JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE a.deleted_at IS NULL GROUP BY a.first_name',
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
    it("accepts a single bare condition for where and having", async () => {
      await insertAuthor({ first_name: "a1", age: 20 });
      await insertAuthor({ first_name: "a2", age: 40 });
      await insertBook({ title: "b1", author_id: 2 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      resetQueryCount();
      // No `{ and: [...] }` wrapper needed for a single condition, in `where` or `having`
      const rows = await em.query({
        from: a,
        join: [a.books.inner(b)],
        where: a.age.gte(30),
        groupBy: [a.firstName],
        having: b.id.count().gt(0),
        select: { name: a.firstName },
      });
      expect(rows).toEqual([{ name: "a2" }]);
      expect(queries).toEqual([
        "SELECT a.first_name AS name FROM authors AS a JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE a.age >= $1 AND a.deleted_at IS NULL GROUP BY a.first_name HAVING count(b.id)::int > $2",
      ]);
    });

    it("prunes a bare where condition given undefined", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const [a] = aliases(Author);
      const nameFilter: string | undefined = undefined;
      const rows = await em.query({ from: a, where: a.firstName.eq(nameFilter), select: { name: a.firstName } });
      expect(rows).toEqual([{ name: "a1" }]);
    });

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
      expect(queries).toEqual([
        "SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY a.first_name ASC",
      ]);
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
      expect(queries).toEqual([
        "SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY a.first_name ASC",
      ]);
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
        "SELECT a.first_name AS name FROM authors AS a JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE (b.title = $1) AND a.deleted_at IS NULL",
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
        "SELECT DISTINCT a.first_name AS name FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL LEFT OUTER JOIN book_reviews AS br ON br.book_id = b.id WHERE (br.rating >= $1) AND a.deleted_at IS NULL",
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
        `SELECT a.first_name AS name, count(b.id)::int AS "bookCount" FROM authors AS a JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE a.deleted_at IS NULL GROUP BY a.first_name ORDER BY "bookCount" DESC, name ASC NULLS LAST`,
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
      expect(queries).toEqual([
        "SELECT a.first_name AS name, a.age AS age FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY name ASC",
      ]);
    });

    it("rejects an orderBy key not in select", async () => {
      const em = newEntityManager();
      const [a] = aliases(Author);
      await expect(
        em.query({ from: a, select: { name: a.firstName }, orderBy: { lastName: "ASC" } as any }),
      ).rejects.toThrow("orderBy key 'lastName' is not a key of select");
    });

    it("rejects an invalid orderBy nulls", async () => {
      const em = newEntityManager();
      const [a] = aliases(Author);
      await expect(
        em.query({ from: a, select: { name: a.firstName }, orderBy: [{ asc: a.firstName, nulls: "last;--" as any }] }),
      ).rejects.toThrow("Invalid orderBy nulls");
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
        'SELECT a.first_name AS name, coalesce(book_stats."bookCount", $1) AS "bookCount", book_stats."lastTitle" AS "lastTitle" FROM authors AS a LEFT OUTER JOIN (SELECT b.author_id AS "authorId", count(b.id)::int AS "bookCount", max(b.title) AS "lastTitle" FROM books AS b WHERE b.deleted_at IS NULL GROUP BY b.author_id) AS book_stats ON book_stats."authorId" = a.id WHERE a.deleted_at IS NULL ORDER BY a.first_name ASC',
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

  describe("polymorphic references", () => {
    it("can use a subquery of ids as an in target", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertComment({ text: "on a1", parent_author_id: 1 });
      await insertComment({ text: "on a2", parent_author_id: 2 });
      await insertComment({ text: "on b1", parent_book_id: 1 });
      const em = newEntityManager();
      const [c, a] = aliases(Comment, Author);
      resetQueryCount();
      // The subquery's select column (Author's id) picks the parent_author_id component
      const rows = await em.query({
        from: c,
        where: { and: [c.parent.in(query({ from: a, where: { and: [a.firstName.eq("a1")] }, select: a.id }))] },
        select: { text: c.text },
      });
      expect(rows).toEqual([{ text: "on a1" }]);
      expect(queries).toEqual([
        "SELECT c.text AS text FROM comments AS c WHERE c.parent_author_id IN (SELECT a.id AS value FROM authors AS a WHERE (a.first_name = $1) AND a.deleted_at IS NULL)",
      ]);
    });

    it("can use a subquery of FK columns as an in target", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertComment({ text: "on a1", parent_author_id: 1 });
      await insertComment({ text: "on a2", parent_author_id: 2 });
      const em = newEntityManager();
      const [c, b] = aliases(Comment, Book);
      // The FK's other side (Author) picks the component: comments on authors who have a book
      const rows = await em.query({
        from: c,
        where: { and: [c.parent.in(query({ from: b, select: b.author }))] },
        select: { text: c.text },
      });
      expect(rows).toEqual([{ text: "on a1" }]);
    });

    it("rejects an in subquery that does not select an id or FK column", () => {
      const [c, b] = aliases(Comment, Book);
      // The check runs eagerly, when the condition is built, not when the query runs
      expect(() => c.parent.in(query({ from: b, select: b.title }) as any)).toThrow("`in` needs an id or FK column");
    });
  });

  describe("single table inheritance", () => {
    it("filters an STI subtype from to its discriminator", async () => {
      await insertTask({ type: "NEW", special_new_field: 1 });
      await insertTask({ type: "OLD", special_old_field: 2 });
      const em = newEntityManager();
      const tn = alias(TaskNew);
      resetQueryCount();
      const tasks = await em.query({ from: tn, select: tn });
      expect(tasks).toMatchEntity([{ specialNewField: 1 }]);
      expect(tasks[0]).toBeInstanceOf(TaskNew);
      expect(queries).toEqual(["SELECT t.* FROM tasks AS t WHERE t.deleted_at IS NULL AND t.type_id = $1"]);
    });

    it("filters a joined STI subtype in its join ON", async () => {
      await insertTask({ id: 1, type: "NEW" });
      await insertTaskItem({ new_task_id: 1 } as any);
      await insertTaskItem({});
      const em = newEntityManager();
      const [ti, tn] = aliases(TaskItem, TaskNew);
      resetQueryCount();
      const rows = await em.query({
        from: ti,
        join: [ti.newTask.as(tn)],
        select: { item: ti.id, task: tn.id },
        orderBy: { item: "ASC" },
      });
      expect(rows).toEqual([
        { item: "ti:1", task: "task:1" },
        { item: "ti:2", task: null },
      ]);
      expect(queries).toEqual([
        "SELECT ti.id AS item, t.id AS task FROM task_items AS ti LEFT OUTER JOIN tasks AS t ON ti.new_task_id = t.id AND t.deleted_at IS NULL AND t.type_id = $1 ORDER BY item ASC",
      ]);
    });

    it("returns mixed subtypes for a base STI from", async () => {
      await insertTask({ type: "NEW" });
      await insertTask({ type: "OLD" });
      const em = newEntityManager();
      const t = alias(Task);
      resetQueryCount();
      const tasks = await em.query({ from: t, select: t, orderBy: { id: "ASC" } });
      expect(tasks[0]).toBeInstanceOf(TaskNew);
      expect(tasks[1]).toBeInstanceOf(TaskOld);
      // The base type has no discriminator value, so no type_id filter is injected
      expect(queries).toEqual(["SELECT t.* FROM tasks AS t WHERE t.deleted_at IS NULL ORDER BY t.id ASC"]);
    });
  });

  describe("soft deletes", () => {
    it("excludes soft-deleted rows from the from table by default", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", deleted_at: new Date() });
      const em = newEntityManager();
      const [a] = aliases(Author);
      resetQueryCount();
      const rows = await em.query({ from: a, select: { name: a.firstName } });
      expect(rows).toEqual([{ name: "a1" }]);
      expect(queries).toEqual(["SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL"]);
    });

    it("includes soft-deleted rows with softDeletes include", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", deleted_at: new Date() });
      const em = newEntityManager();
      const [a] = aliases(Author);
      const rows = await em.query({
        from: a,
        select: { name: a.firstName },
        orderBy: { name: "ASC" },
        softDeletes: "include",
      });
      expect(rows).toEqual([{ name: "a1" }, { name: "a2" }]);
    });

    it("nulls out a left-joined soft-deleted entity instead of dropping the row", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1, deleted_at: new Date() });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      // The injected condition lives in the join's ON, so the LEFT join keeps a1 with a null title
      const rows = await em.query({ from: a, join: [a.books.as(b)], select: { name: a.firstName, title: b.title } });
      expect(rows).toEqual([{ name: "a1", title: null }]);
    });

    it("drops rows of an inner-joined soft-deleted entity", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 2, deleted_at: new Date() });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      const rows = await em.query({ from: a, join: [a.books.inner(b)], select: { title: b.title } });
      expect(rows).toEqual([{ title: "b1" }]);
    });

    it("does not inject into non-soft-deletable tables or CTI subtypes", async () => {
      await insertLargePublisher({ id: 1, name: "lp1" });
      const em = newEntityManager();
      const [t, lp] = aliases(Tag, LargePublisher);
      resetQueryCount();
      // Tag has no deleted_at, and LargePublisher is a CTI subtype (unsupported, like em.find)
      await em.query({ from: t, select: { name: t.name } });
      await em.query({ from: lp, select: { name: lp.name } });
      expect(queries).toEqual([
        "SELECT t.name AS name FROM tags AS t",
        "SELECT lp_b0.name AS name FROM large_publishers AS lp LEFT OUTER JOIN publishers AS lp_b0 ON lp.id = lp_b0.id",
      ]);
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
