import { Query, alias, aliases, query, sql } from "joist-orm";
import {
  Author,
  Book,
  BookRange,
  BookReview,
  Comment,
  Critic,
  LargePublisher,
  Publisher,
  PublisherGroup,
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
  insertCritic,
  insertLargePublisher,
  insertPublisher,
  insertPublisherGroup,
  insertTag,
  insertTask,
  insertTaskItem,
} from "src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

/**
 * `em.query`: SQL-shaped queries as plain object literals.
 *
 * Author/Book/BookReview scenarios cover relationship filters, aggregate reports, reusable page/count
 * queries, and raw SQL expressions, including how optional filters affect joins and returned rows.
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
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.* FROM authors AS a WHERE (a.first_name = $1) AND a.deleted_at IS NULL",
       ]
      `);
    });

    it("returns entities through the identity map", async () => {
      // Given an Author stored in the database
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      // And the same Author already loaded into this EntityManager's identity map
      const a1 = await em.load(Author, "a:1");
      const [a] = aliases(Author);
      const [found] = await em.query({ from: a, select: a });
      expect(found).toBe(a1);
    });

    it("returns POJOs and decodes ids, enums, and nulls", async () => {
      // Given Author a1 with an age and a stored BookRange enum id
      await insertAuthor({ first_name: "a1", age: 30, range_of_books: 1 });
      // And Author a2 with null age and rangeOfBooks fields
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
      // Given adult Author a1, included by the subquery's age filter
      await insertAuthor({ first_name: "a1", age: 30 });
      // And underage Author a2, excluded from the subquery's rows
      await insertAuthor({ first_name: "a2", age: 10 });
      const em = newEntityManager();
      const [a] = aliases(Author);
      // And a subquery that exposes only adult Author ids and names
      const adults = query({ from: a, where: { and: [a.age.gte(18)] }, select: { id: a.id, name: a.firstName } });
      const rows = await em.query({ from: adults, select: adults, orderBy: [{ asc: adults.name }] });
      expect(rows).toEqual([{ id: "a:1", name: "a1" }]);
    });

    it("hydrates CTI subtypes in entity mode", async () => {
      // Given a SmallPublisher with its name stored on the Publisher base table
      await insertPublisher({ id: 1, name: "small" });
      // And a LargePublisher with a base-table name and a subtype-table country
      await insertLargePublisher({ id: 2, name: "large", country: "us" });
      const em = newEntityManager();
      const [p] = aliases(Publisher);
      const publishers = await em.query({ from: p, select: p, orderBy: [{ asc: p.id }] });
      expect(publishers[0]).toBeInstanceOf(SmallPublisher);
      expect(publishers[1]).toBeInstanceOf(LargePublisher);
      // The base table's own columns must be selected too, not just the sub-table columns + __class
      expect(publishers[0]).toMatchEntity({ name: "small" });
      expect(publishers[1] as LargePublisher).toMatchEntity({ country: "us" });
    });

    it("hydrates a CTI subtype from with its own and base fields", async () => {
      // Given a SmallPublisher with name on publishers and city on small_publishers; both must hydrate
      await insertPublisher({ id: 1, name: "p1", city: "sf" });
      const em = newEntityManager();
      const sp = alias(SmallPublisher);
      const [publisher] = await em.query({ from: sp, select: sp });
      expect(publisher).toBeInstanceOf(SmallPublisher);
      expect(publisher).toMatchEntity({ name: "p1", city: "sf" });
    });

    it("can filter a CTI subtype alias on a base-table field", async () => {
      // Given two SmallPublishers distinguished by names stored on the Publisher base table
      await insertPublisher({ id: 1, name: "p1" });
      await insertPublisher({ id: 2, name: "p2" });
      const em = newEntityManager();
      const [sp] = aliases(SmallPublisher);
      const rows = await em.query({ from: sp, where: { and: [sp.name.eq("p2")] }, select: { name: sp.name } });
      expect(rows).toEqual([{ name: "p2" }]);
    });

    it("rejects selecting a joined alias or subquery", async () => {
      const em = newEntityManager();
      // Given distinct Author aliases sharing the type-level name "Author", so the call-site check
      // cannot tell them apart; these queries compile, but the runtime check compares handles and is exact
      const [a, a2] = aliases(Author, Author);
      // And an invalid entity select of the joined Author instead of the from Author
      await expect(em.query({ from: a, join: [{ left: a2, on: a2.mentor.eq(a.id) }], select: a2 })).rejects.toThrow(
        new Error(
          "Selecting a joined alias is not supported yet; select the from alias, or select its columns individually",
        ),
      );
      // And two distinct anonymous Author subqueries that likewise share the name "?"
      const sub1 = query({ from: a, select: { id: a.id } });
      const sub2 = query({ from: a, select: { id: a.id } });
      // And an invalid select of the joined subquery instead of the from subquery
      await expect(
        em.query({ from: sub1, join: [{ inner: sub2, on: sub2.id.eq(sub1.id) }], select: sub2 }),
      ).rejects.toThrow(
        new Error(
          "Selecting a joined subquery is not supported; select the from subquery, or select its columns individually",
        ),
      );
    });

    it("escapes quotes in subquery as names, in declarations and references", async () => {
      // Given an Author to select through a named subquery
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const [a] = aliases(Author);
      // And a subquery name containing a quote and SQL comment marker; it must stay one identifier
      // at its declaration and every reference (column refs, select-star), not become SQL
      const evil = query({ from: a, select: { name: a.firstName }, as: 'x" --' });
      resetQueryCount();
      const star = await em.query({ from: evil, select: evil });
      const column = await em.query({ from: evil, select: { n: evil.name }, orderBy: [{ asc: evil.name }] });
      expect(star).toEqual([{ name: "a1" }]);
      expect(column).toEqual([{ n: "a1" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT "x"" --".name AS name FROM (SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL) AS "x"" --"",
         "SELECT "x"" --".name AS n FROM (SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL) AS "x"" --" ORDER BY "x"" --".name ASC",
       ]
      `);
    });

    it("escapes quotes in select keys, so display-name keys work", async () => {
      // Given an Author with a name and null age for the selected display-name keys
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const [a] = aliases(Author);
      // And a SQL-shaped key crossing an `any` boundary; like legal display names (i.e. CSV headers),
      // it must stay one quoted identifier instead of becoming SQL
      const evil = 'name" FROM authors; --';
      const rows = await em.query({ from: a, select: { "Book Count": a.age, [evil]: a.firstName } } as any);
      expect(rows).toEqual([{ "Book Count": null, [evil]: "a1" }]);
      // And an invalid 64-byte select key; PG silently truncates identifiers over 63 bytes,
      // which would break decoding, so those fail fast
      await expect(em.query({ from: a, select: { ["x".repeat(64)]: a.firstName } } as any)).rejects.toThrow(
        new Error(`Identifier '${"x".repeat(64)}' is longer than PG's 63-byte limit`),
      );
    });
  });

  describe("joins", () => {
    it("adds CTI physical-table joins only as needed", async () => {
      // Given an Author whose publisher is a SmallPublisher with its name on the Publisher base table
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const [a, p] = aliases(Author, Publisher);
      const sp = alias(SmallPublisher);
      resetQueryCount();
      // Joining the CTI base adds no subtype joins; those only serve entity-mode hydration of a `from`
      const viaBase = await em.query({
        from: a,
        join: [{ inner: p, on: a.publisher.eq(p.id) }],
        select: { name: p.name },
      });
      expect(viaBase).toEqual([{ name: "p1" }]);
      // Joining a CTI subtype adds just its base-table join, so base-declared columns (name) resolve
      const viaSubtype = await em.query({
        from: a,
        join: [{ inner: sp, on: a.publisher.eq(sp.id) }],
        select: { name: sp.name },
      });
      expect(viaSubtype).toEqual([{ name: "p1" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT p.name AS name FROM authors AS a JOIN publishers AS p ON a.publisher_id = p.id WHERE a.deleted_at IS NULL",
         "SELECT sp_b0.name AS name FROM authors AS a JOIN (small_publishers AS sp LEFT OUTER JOIN publishers AS sp_b0 ON sp.id = sp_b0.id) ON a.publisher_id = sp_b0.id WHERE a.deleted_at IS NULL",
       ]
      `);
    });

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
      // Given Authors a1 and a2, with a2 left without Books
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And one Book for a1, so the left join has both a match and a missing Book
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
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS author, b.title AS title FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id WHERE a.deleted_at IS NULL ORDER BY a.first_name ASC",
       ]
      `);
    });

    it("can join with a non-FK condition and a named self-join alias", async () => {
      // Given a 50-year-old Author as mentor for an age-comparison self-join
      await insertAuthor({ first_name: "mentor", age: 50 });
      // And a mentee Author younger than that mentor
      await insertAuthor({ first_name: "mentee", age: 25, mentor_id: 1 });
      // And a peer Author with the same mentor but older, so only the mentee passes the age comparison
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
    it("joins a large collection like any o2m", async () => {
      await insertPublisherGroup({ name: "pg1" });
      await insertCritic({ name: "c1", group_id: 1 });
      const em = newEntityManager();
      const [pg, c] = aliases(PublisherGroup, Critic);
      resetQueryCount();
      // A large o2m only restricts the in-memory collection (no full .load); its SQL join is a plain o2m
      const rows = await em.query({ from: pg, join: [pg.critics.as(c)], select: { group: pg.name, critic: c.name } });
      expect(rows).toEqual([{ group: "pg1", critic: "c1" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT pg.name AS "group", c.name AS critic FROM publisher_groups AS pg LEFT OUTER JOIN critics AS c ON c.group_id = pg.id",
       ]
      `);
    });

    it("joins a collection as a left join by default", async () => {
      // Given Authors a1 and a2, with a2 left without Books
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And a Book for a1, while a2 must remain in the result with a null title
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
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS author, b.title AS title FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE a.deleted_at IS NULL ORDER BY author ASC",
       ]
      `);
    });

    it("can inner join a collection to filter", async () => {
      // Given Authors a1 and a2, with a2 left without Books
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And a Book only for a1, so the inner join excludes a2
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
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT b.title AS title, a.first_name AS author FROM books AS b JOIN authors AS a ON b.author_id = a.id WHERE b.deleted_at IS NULL",
       ]
      `);
    });

    it("joins a nullable reference as a left join, with a named self-join alias", async () => {
      // Given a mentor Author with no mentor of their own
      await insertAuthor({ first_name: "mentor" });
      // And a mentee Author referencing that mentor, so only one side has a null mentor
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
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS name, a1.first_name AS mentor FROM authors AS a LEFT OUTER JOIN authors AS a1 ON a.mentor_id = a1.id WHERE a.deleted_at IS NULL ORDER BY name ASC",
       ]
      `);
    });

    it("joins a one-to-one as a left join", async () => {
      // Given Author a1 and Book b1 as the start of a sequel chain
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      // And Book b2 as b1's sequel, with no sequel of its own
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
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT b.title AS title, b1.title AS sequel FROM books AS b LEFT OUTER JOIN books AS b1 ON b1.prequel_id = b.id WHERE b.deleted_at IS NULL ORDER BY title ASC",
       ]
      `);
    });

    it("joins a many-to-many through its join table", async () => {
      // Given Authors a1 and a2, with a2 left without Tags
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And Tag t1 linked only to a1 through authors_to_tags
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
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS author, t.name AS tag FROM authors AS a LEFT OUTER JOIN authors_to_tags AS att ON att.author_id = a.id LEFT OUTER JOIN tags AS t ON t.id = att.tag_id WHERE a.deleted_at IS NULL ORDER BY author ASC",
       ]
      `);
    });

    it("joins a polymorphic reference by the argument's component", async () => {
      // Given a Comment whose parent uses the Author component, not the Book component
      await insertAuthor({ first_name: "a1" });
      await insertComment({ text: "c1", parent_author_id: 1 });
      const em = newEntityManager();
      const [c, a] = aliases(Comment, Author);
      resetQueryCount();
      const rows = await em.query({ from: c, join: [c.parent.as(a)], select: { text: c.text, author: a.firstName } });
      expect(rows).toEqual([{ text: "c1", author: "a1" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT c.text AS text, a.first_name AS author FROM comments AS c JOIN authors AS a ON c.parent_author_id = a.id",
       ]
      `);
    });

    it("prunes sugar joins nothing references, m2m join tables included", async () => {
      // Given an Author with no Books or Tags
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const [a, b, t] = aliases(Author, Book, Tag);
      // And absent Book title and Tag name filters, leaving neither collection join referenced
      const filter: string | undefined = undefined;
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [a.books.as(b), a.tags.as(t)],
        where: { and: [b.title.eq(filter), t.name.eq(filter)] },
        select: { name: a.firstName },
      });
      expect(rows).toEqual([{ name: "a1" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL",
       ]
      `);
    });

    it("mixes sugar and expanded joins in one array", async () => {
      // Given Author a1 with Book b1 for the collection join
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      // And a BookReview on b1 for the explicit join through the Book alias
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
      // Given an invalid Tag join from an Author alias absent from the Book query's from/join
      await expect(em.query({ from: b, join: [a.tags.as(t)], select: { tag: t.name } })).rejects.toThrow(
        new Error("Alias for authors is not in this query's from/join"),
      );
    });
  });

  describe("aggregates", () => {
    it("can group by with count", async () => {
      // Given Author a1 with two Books in the same aggregate group
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
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS name, count(b.id)::int AS "bookCount" FROM authors AS a JOIN books AS b ON b.author_id = a.id WHERE a.deleted_at IS NULL GROUP BY a.first_name",
       ]
      `);
    });

    it("can select multiple aggregates", async () => {
      // Given two Authors with distinct names and ages, so the aggregates have nonuniform inputs
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
      // Given Authors a1 and a2 as separate aggregate groups
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And two Books for a1, above the HAVING threshold
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      // And only one Book for a2, so its group is excluded
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
      // Given Authors a1 and a2, with a2 named in the exclusion filter
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And two Books for a1 to collect as titles and tagged ids
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      // And a Book for a2 that must not enter the returned arrays
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
      expect(rows).toMatchObject([{ name: "a1" }]);
      expect([...row.titles!].sort()).toEqual(["b1", "b2"]);
      expect([...row.bookIds!].sort()).toEqual(["b:1", "b:2"]);
    });

    it("decodes arrayAgg element nulls and encodes coalesce fallbacks per element", async () => {
      // Given Author a1 with no Books: the left-joined group aggregates as [null], and the correlated
      // zero-row aggregate is NULL, recovered by coalesce, whose id fallback must encode per element
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      const rows = await em.query({
        from: a,
        join: [a.books.as(b)],
        groupBy: [a.id],
        select: {
          name: a.firstName,
          titles: b.title.arrayAgg(),
          fallback: query({ from: b, where: b.author.eq(a.id), select: b.id.arrayAgg().coalesce(["b:9"]) }),
        },
      });
      expect(rows).toEqual([{ name: "a1", titles: [null], fallback: ["b:9"] }]);
    });

    // Grouping by the Author PK allows entity hydration while ordering by an aggregate Book count.
    it("can return entities ordered by an aggregate", async () => {
      // Given Authors a1 and a2, inserted in name order
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And one Book for a1
      await insertBook({ title: "b1", author_id: 1 });
      // And two Books for a2, so descending Book count reverses the Author order
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
      // Given Author a1 below the age threshold and without Books
      await insertAuthor({ first_name: "a1", age: 20 });
      // And Author a2 above the age threshold
      await insertAuthor({ first_name: "a2", age: 40 });
      // And a Book for a2, so it passes both the age filter and the positive Book count filter
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
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS name FROM authors AS a JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE a.age >= $1 AND a.deleted_at IS NULL GROUP BY a.first_name HAVING count(b.id)::int > $2",
       ]
      `);
    });

    it("prunes a bare where condition given undefined", async () => {
      // Given an Author that should remain when no name filter is supplied
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const [a] = aliases(Author);
      // And an absent name filter, rather than a filter for a null name
      const nameFilter: string | undefined = undefined;
      const rows = await em.query({ from: a, where: a.firstName.eq(nameFilter), select: { name: a.firstName } });
      expect(rows).toEqual([{ name: "a1" }]);
    });

    it("prunes undefined conditions", async () => {
      // Given two Authors with different names, both of which should remain without a name filter
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      const em = newEntityManager();
      const [a] = aliases(Author);
      // And an absent name filter inside the AND condition
      const nameFilter: string | undefined = undefined;
      resetQueryCount();
      const rows = await em.query({
        from: a,
        where: { and: [a.firstName.eq(nameFilter)] },
        select: { name: a.firstName },
        orderBy: [{ asc: a.firstName }],
      });
      expect(rows).toEqual([{ name: "a1" }, { name: "a2" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY a.first_name ASC",
       ]
      `);
    });

    it("prunes joins that nothing references anymore", async () => {
      // Given Authors a1 and a2; a2 has no Books and would be lost to an unpruned inner join
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And a Book for a1, so a retained inner join would return only a1
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      // And an absent Book title filter, removing the join's only reference
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
      expect(rows).toEqual([{ name: "a1" }, { name: "a2" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY a.first_name ASC",
       ]
      `);
      // And a supplied Book title filter in the next query, so the condition and its join both survive
      resetQueryCount();
      const filtered = await em.query({
        from: a,
        join: [{ inner: b, on: b.author.eq(a.id) }],
        where: { and: [b.title.eq("b1")] },
        select: { name: a.firstName },
      });
      expect(filtered).toEqual([{ name: "a1" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS name FROM authors AS a JOIN books AS b ON b.author_id = a.id WHERE (b.title = $1) AND a.deleted_at IS NULL",
       ]
      `);
    });

    it("does not mistake a subquery named like a CTI alias for one", async () => {
      // Given an Author selected through both the outer query and a joined subquery
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const [a] = aliases(Author);
      // And an Author subquery named like a physical CTI alias (sp_b0); these aliases are tracked
      // explicitly, so pruning must not credit its references to a phantom "book" alias
      const sub = query({ from: a, select: { id: a.id, name: a.firstName }, as: "book_b0" });
      const rows = await em.query({
        from: a,
        join: [{ inner: sub, on: sub.id.eq(a.id) }],
        select: { name: sub.name },
      });
      expect(rows).toEqual([{ name: "a1" }]);
    });

    it("allows a subquery named unset", async () => {
      // Given an Author to select through a subquery
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const a = alias(Author);
      // And a subquery whose name matches the old unresolved-alias placeholder
      const sub = query({ from: a, select: { name: a.firstName }, as: "unset" });
      const rows = await em.query({ from: sub, select: sub });
      expect(rows).toEqual([{ name: "a1" }]);
    });

    it("keeps a join pinned with keep", async () => {
      // Given Authors a1 and a2, with a2 left without Books
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And a Book only for a1, so the pinned inner join excludes a2 without selecting Book fields
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
      // Given Authors a1 and a2, with a2 left without Books
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And a Book only for a1, so disabling pruning preserves the inner join's existence filter
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
      // Given an absent Author id that prunes the Book join's entire ON condition
      const authorId: string | undefined = undefined;
      // And an invalid query that still selects the Book title, so the conditionless join cannot prune
      await expect(
        em.query({ from: a, join: [{ inner: b, on: b.author.eq(authorId) }], select: { title: b.title } }),
      ).rejects.toThrow(
        new Error("Join Alias for books has no ON condition left (they all pruned), but the query still references it"),
      );
    });

    it("rejects a join whose ON references a later join", async () => {
      const em = newEntityManager();
      const [a, b, br] = aliases(Author, Book, BookReview);
      // Given an invalid join order: BookReview's ON needs Book before the Book join is in scope
      await expect(
        em.query({
          from: a,
          join: [
            { left: br, on: br.book.eq(b.id) },
            { left: b, on: b.author.eq(a.id) },
          ],
          select: { rating: br.rating },
        }),
      ).rejects.toThrow(
        new Error(
          "Join Alias for book_reviews references 'b', which is joined later; move that join earlier in the join array",
        ),
      );
    });

    // Optional BookReview and Comment filters share one join list instead of adding joins imperatively;
    // only referenced joins and their dependencies survive.
    it("declares many optional joins once and keeps only the referenced ones", async () => {
      // Given Author a1 with Book b1 and a BookReview rated 5
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 5 });
      // And a Comment whose parent is a1, independent of the BookReview join chain
      await insertComment({ text: "c1", parent_author_id: 1 });
      const em = newEntityManager();
      const [a, b, br, c] = aliases(Author, Book, BookReview, Comment);
      // And a minimum BookReview rating that keeps both the BookReview and its Book join
      const minRating: number | undefined = 4;
      // And no Comment text filter, so the Comment join is unused despite having a matching row
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
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT DISTINCT a.first_name AS name FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id LEFT OUTER JOIN book_reviews AS br ON br.book_id = b.id WHERE (br.rating >= $1) AND a.deleted_at IS NULL",
       ]
      `);
    });
  });

  describe("ordering and paging", () => {
    it("can order by select keys", async () => {
      // Given Authors a1 and a2 as separate aggregate groups
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And two Books for a1
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      // And one Book for a2, giving the selected bookCount key distinct values to sort
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
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS name, count(b.id)::int AS "bookCount" FROM authors AS a JOIN books AS b ON b.author_id = a.id WHERE a.deleted_at IS NULL GROUP BY a.first_name ORDER BY "bookCount" DESC, name ASC NULLS LAST",
       ]
      `);
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
      // Given Authors inserted in reverse name order with null ages
      await insertAuthor({ first_name: "a2" });
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const [a] = aliases(Author);
      // And an absent age sort, leaving name as the only ordering key
      const byAge: "ASC" | undefined = undefined;
      resetQueryCount();
      const rows = await em.query({
        from: a,
        select: { name: a.firstName, age: a.age },
        orderBy: { age: byAge, name: "ASC" },
      });
      expect(rows).toMatchObject([{ name: "a1" }, { name: "a2" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS name, a.age AS age FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY name ASC",
       ]
      `);
    });

    it("rejects an orderBy key not in select", async () => {
      const em = newEntityManager();
      const [a] = aliases(Author);
      // Given an invalid lastName sort key when the Author projection exposes only name
      await expect(
        em.query({ from: a, select: { name: a.firstName }, orderBy: { lastName: "ASC" } as any }),
      ).rejects.toThrow(new Error("orderBy key 'lastName' is not a key of select"));
    });

    it("rejects an invalid orderBy nulls", async () => {
      const em = newEntityManager();
      const [a] = aliases(Author);
      // Given SQL punctuation in the Author name sort's nulls option instead of first or last
      await expect(
        em.query({ from: a, select: { name: a.firstName }, orderBy: [{ asc: a.firstName, nulls: "last;--" as any }] }),
      ).rejects.toThrow(new Error("Invalid orderBy nulls 'last;--'"));
    });

    it("rejects an invalid orderBy direction", async () => {
      const em = newEntityManager();
      const [a] = aliases(Author);
      // Given an injected SQL fragment instead of a valid direction for the Author name sort
      await expect(
        em.query({ from: a, select: { name: a.firstName }, orderBy: { name: "ASC; DROP TABLE" as any } }),
      ).rejects.toThrow(new Error("Invalid orderBy direction 'ASC; DROP TABLE'"));
    });

    it("can order with nulls last, limit, and offset", async () => {
      // Given Author a1 with a known age
      await insertAuthor({ first_name: "a1", age: 10 });
      // And Author a2 with null age, which must sort last by age but second by name
      await insertAuthor({ first_name: "a2" });
      // And an older Author a3, which sorts before a1 by descending age
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
      // Given Authors with increasing ages, so descending computed age reverses their order
      await insertAuthor({ first_name: "a1", age: 10 });
      await insertAuthor({ first_name: "a2", age: 20 });
      const em = newEntityManager();
      const [a] = aliases(Author);
      // And a disabled secondary name sort, leaving an undefined orderBy entry to prune
      const secondary: boolean = false;
      const rows = await em.query({
        from: a,
        select: { name: a.firstName },
        orderBy: [{ desc: sql<number>`${a.age} * 2` }, secondary ? { asc: a.firstName } : undefined],
      });
      expect(rows).toEqual([{ name: "a2" }, { name: "a1" }]);
    });

    // A distinct Publisher size list deduplicates stored enum ids and decodes them to enum values.
    it("can select distinct enum values", async () => {
      // Given two SmallPublishers sharing the same PublisherSize value
      await insertPublisher({ id: 1, name: "p1", size_id: 1 });
      await insertPublisher({ id: 2, name: "p2", size_id: 1 });
      // And a LargePublisher with a different size, leaving two distinct values across the subtypes
      await insertLargePublisher({ id: 3, name: "p3", size_id: 2 });
      const em = newEntityManager();
      const [p] = aliases(Publisher);
      const rows = await em.query({ from: p, distinct: true, select: { size: p.size }, orderBy: [{ asc: p.size }] });
      expect(rows).toEqual([{ size: PublisherSize.Small }, { size: PublisherSize.Large }]);
    });
  });

  describe("composition", () => {
    it("can left join a subquery and coalesce its columns", async () => {
      // Given Authors a1 and a2, with a2 left without Books or a matching aggregate row
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And two Books for a1, producing a count and maximum title in the aggregate row
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      // And Book statistics grouped by Author, so a2 needs the outer query's count fallback
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
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS name, coalesce(book_stats."bookCount", $1) AS "bookCount", book_stats."lastTitle" AS "lastTitle" FROM authors AS a LEFT OUTER JOIN (SELECT b.author_id AS "authorId", count(b.id)::int AS "bookCount", max(b.title) AS "lastTitle" FROM books AS b WHERE b.deleted_at IS NULL GROUP BY b.author_id) AS book_stats ON book_stats."authorId" = a.id WHERE a.deleted_at IS NULL ORDER BY a.first_name ASC",
       ]
      `);
    });

    it("can chain a subquery on a subquery", async () => {
      // Given Authors a1 and a2 as separate Book count groups
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And two Books for a1, meeting the prolific Author threshold
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      // And only one Book for a2, below that threshold
      await insertBook({ title: "b3", author_id: 2 });
      const em = newEntityManager();
      const [b] = aliases(Book);
      // And an aggregate subquery exposing each Author's Book count
      const bookStats = query({
        from: b,
        groupBy: [b.author],
        select: { authorId: b.author, bookCount: b.id.count() },
      });
      // And a second subquery filtering those aggregate rows to prolific Authors
      const prolific = query({
        from: bookStats,
        where: { and: [bookStats.bookCount.gte(2)] },
        select: { authorId: bookStats.authorId, bookCount: bookStats.bookCount },
      });
      const rows = await em.query({ from: prolific, select: prolific });
      expect(rows).toEqual([{ authorId: "a:1", bookCount: 2 }]);
    });

    it("re-renders a reused correlated scalar with each query's aliases", async () => {
      // Given Author a1 with one Book, so both uses of the scalar must count one
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      // And a reusable Book count subquery correlated to the outer Author alias
      const cnt = query({ from: b, where: b.author.eq(a.id), select: b.id.count() });
      // And a separate Book alias for an outer join in the second query
      const b2 = alias(Book, "b2");
      resetQueryCount();
      const one = await em.query({ from: a, select: { n: cnt } });
      // And the second query joins Books itself, which re-aliases the subquery's Books to b1; the
      // correlation must re-render as b1.author_id, not keep the first parse's b (the outer join!)
      const two = await em.query({ from: a, join: [a.books.as(b2)], where: b2.title.ne("x"), select: { n: cnt } });
      expect(one).toEqual([{ n: 1 }]);
      expect(two).toEqual([{ n: 1 }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT (SELECT count(b.id)::int AS value FROM books AS b WHERE b.author_id = a.id AND b.deleted_at IS NULL) AS n FROM authors AS a WHERE a.deleted_at IS NULL",
         "SELECT (SELECT count(b1.id)::int AS value FROM books AS b1 WHERE b1.author_id = a.id AND b1.deleted_at IS NULL) AS n FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE b.title != $1 AND a.deleted_at IS NULL",
       ]
      `);
    });

    it("keeps an outer join alive that only a correlated subquery references", async () => {
      // Given Author a1 with Book b1 for the outer join
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      // And a BookReview on b1, counted through the scalar subquery's reference to that outer Book
      await insertBookReview({ rating: 5, book_id: 1 });
      const em = newEntityManager();
      const [a, b, br] = aliases(Author, Book, BookReview);
      // The outer b join's only reference is the correlated cross-column condition inside the scalar
      // subquery; that correlation must count as a use, or pruning drops the join it depends on
      const rows = await em.query({
        from: a,
        join: [a.books.as(b)],
        select: { name: a.firstName, reviews: query({ from: br, where: br.book.eq(b.id), select: br.id.count() }) },
      });
      expect(rows).toEqual([{ name: "a1", reviews: 1 }]);
    });

    it("can select a correlated scalar subquery", async () => {
      // Given Authors a1 and a2, with a2 left without Books for a zero count
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And one Book for a1, so the correlation must return different counts per Author
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      const rows = await em.query({
        from: a,
        select: {
          name: a.firstName,
          // The subquery closes over `a`; count returns 0 for no Books, and coalesce removes the scalar's nullable type
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
      // Given Authors a1 and a2, with a2 left without Books
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And Book b1 for a1, so only a1's id appears in the subquery
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

    // A page and its total count share the same Author filter, but only the page applies a limit.
    it("can spread a base query into a page and a count", async () => {
      // Given two adult Authors, more than fit on the one-row page
      await insertAuthor({ first_name: "a1", age: 20 });
      await insertAuthor({ first_name: "a2", age: 30 });
      // And an underage Author excluded from both the page and the total count
      await insertAuthor({ first_name: "kid", age: 10 });
      const em = newEntityManager();
      const [a] = aliases(Author);
      // And a shared adult Author filter for both query shapes
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
      // Given Author a1 matching the subquery's name filter
      await insertAuthor({ first_name: "a1" });
      // And Author a2 excluded by that filter
      await insertAuthor({ first_name: "a2" });
      // And Book b1 sharing numeric id 1 with Author a1 but using a different parent component
      await insertBook({ title: "b1", author_id: 1 });
      // And Comments on each Author, so the selected Author id must distinguish their parents
      await insertComment({ text: "on a1", parent_author_id: 1 });
      await insertComment({ text: "on a2", parent_author_id: 2 });
      // And a Comment on Book b1 that must not match Author a1 despite the shared numeric id
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
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT c.text AS text FROM comments AS c WHERE c.parent_author_id IN (SELECT a.id AS value FROM authors AS a WHERE (a.first_name = $1) AND a.deleted_at IS NULL)",
       ]
      `);
    });

    it("can use a subquery of FK columns as an in target", async () => {
      // Given Authors a1 and a2, with a2 left without Books
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And Book b1 referencing a1, making a1 the only Author id selected by the FK subquery
      await insertBook({ title: "b1", author_id: 1 });
      // And Comments on both Authors, only one of whose parents appears in that subquery
      await insertComment({ text: "on a1", parent_author_id: 1 });
      await insertComment({ text: "on a2", parent_author_id: 2 });
      const em = newEntityManager();
      const [c, b] = aliases(Comment, Book);
      // The FK's other side (Author) picks the component: Comments on Authors who have a Book
      const rows = await em.query({
        from: c,
        where: { and: [c.parent.in(query({ from: b, select: b.author }))] },
        select: { text: c.text },
      });
      expect(rows).toEqual([{ text: "on a1" }]);
    });

    it("rejects an in subquery that does not select an id or FK column", () => {
      const [c, b] = aliases(Comment, Book);
      // Given an invalid Comment parent target selecting Book titles, which identify no parent component
      // The check runs eagerly, when the condition is built, not when the query runs
      expect(() => c.parent.in(query({ from: b, select: b.title }) as any)).toThrow(
        new Error("parent `in` needs an id or FK column, got title"),
      );
    });
  });

  describe("single table inheritance", () => {
    it("filters an STI subtype from to its discriminator", async () => {
      // Given a TaskNew row with its subtype-specific field populated
      await insertTask({ type: "NEW", special_new_field: 1 });
      // And a TaskOld row in the same tasks table, excluded by the TaskNew discriminator
      await insertTask({ type: "OLD", special_old_field: 2 });
      const em = newEntityManager();
      const tn = alias(TaskNew);
      resetQueryCount();
      const tasks = await em.query({ from: tn, select: tn });
      expect(tasks).toMatchEntity([{ specialNewField: 1 }]);
      expect(tasks[0]).toBeInstanceOf(TaskNew);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT t.* FROM tasks AS t WHERE t.deleted_at IS NULL AND t.type_id = $1",
       ]
      `);
    });

    it("filters a joined STI subtype in its join ON", async () => {
      // Given a TaskNew row and a TaskItem with a valid newTask reference to it
      // The cast only supplies new_task_id missing from the insert helper's type; the stored subtype is valid
      await insertTask({ id: 1, type: "NEW" });
      await insertTaskItem({ new_task_id: 1 } as any);
      // And a TaskItem with no newTask, which the left join must retain with a null Task id
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
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT ti.id AS item, t.id AS task FROM task_items AS ti LEFT OUTER JOIN tasks AS t ON ti.new_task_id = t.id AND t.type_id = $1 ORDER BY item ASC",
       ]
      `);
    });

    it("returns mixed subtypes for a base STI from", async () => {
      // Given a TaskNew row in the base tasks table
      await insertTask({ type: "NEW" });
      // And a TaskOld row in the same table, so the base Task query must hydrate both subtypes
      await insertTask({ type: "OLD" });
      const em = newEntityManager();
      const t = alias(Task);
      resetQueryCount();
      const tasks = await em.query({ from: t, select: t, orderBy: { id: "ASC" } });
      expect(tasks[0]).toBeInstanceOf(TaskNew);
      expect(tasks[1]).toBeInstanceOf(TaskOld);
      // The base type has no discriminator value, so no type_id filter is injected
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT t.* FROM tasks AS t WHERE t.deleted_at IS NULL ORDER BY t.id ASC",
       ]
      `);
    });
  });

  describe("soft deletes", () => {
    it("excludes soft-deleted rows from the from table by default", async () => {
      // Given live Author a1
      await insertAuthor({ first_name: "a1" });
      // And soft-deleted Author a2, excluded by the default from-table filter
      await insertAuthor({ first_name: "a2", deleted_at: new Date() });
      const em = newEntityManager();
      const [a] = aliases(Author);
      resetQueryCount();
      const rows = await em.query({ from: a, select: { name: a.firstName } });
      expect(rows).toEqual([{ name: "a1" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL",
       ]
      `);
    });

    it("includes soft-deleted rows with softDeletes include", async () => {
      // Given live Author a1
      await insertAuthor({ first_name: "a1" });
      // And soft-deleted Author a2, included only when the default filter is disabled
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
      // Given live Author a1
      await insertAuthor({ first_name: "a1" });
      // And only a soft-deleted Book for a1, leaving no live collection member to join
      await insertBook({ title: "b1", author_id: 1, deleted_at: new Date() });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      // The injected condition lives in the join's ON, so the LEFT join keeps a1 with a null title
      const rows = await em.query({ from: a, join: [a.books.as(b)], select: { name: a.firstName, title: b.title } });
      expect(rows).toEqual([{ name: "a1", title: null }]);
    });

    it("drops rows of an inner-joined soft-deleted entity", async () => {
      // Given live Authors a1 and a2
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And a live Book for a1, which passes the collection join's soft-delete filter
      await insertBook({ title: "b1", author_id: 1 });
      // And only a soft-deleted Book for a2, so its inner join has no live match
      await insertBook({ title: "b2", author_id: 2, deleted_at: new Date() });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      const rows = await em.query({ from: a, join: [a.books.inner(b)], select: { title: b.title } });
      expect(rows).toEqual([{ title: "b1" }]);
    });

    it("resolves soft-deleted entities through reference and explicit joins", async () => {
      // Given soft-deleted Author a1
      await insertAuthor({ first_name: "a1", deleted_at: new Date() });
      // And live Book b1 whose required Author reference still points to a1
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      // em.find's relation semantics: book.author.get resolves a soft-deleted Author, so joining
      // through one keeps the live Book; only collections and the from table filter soft-deletes
      const viaSugar = await em.query({
        from: b,
        join: [b.author.as(a)],
        select: { title: b.title, author: a.firstName },
      });
      expect(viaSugar).toEqual([{ title: "b1", author: "a1" }]);
      const viaExplicit = await em.query({
        from: b,
        join: [{ inner: a, on: b.author.eq(a.id) }],
        select: { title: b.title },
      });
      expect(viaExplicit).toEqual([{ title: "b1" }]);
    });

    it("does not inject into non-soft-deletable tables or CTI subtypes", async () => {
      // Given a LargePublisher, a CTI subtype where soft-delete filtering is unsupported, like em.find
      await insertLargePublisher({ id: 1, name: "lp1" });
      const em = newEntityManager();
      // And a Tag alias whose table has no deleted_at column
      const [t, lp] = aliases(Tag, LargePublisher);
      resetQueryCount();
      await em.query({ from: t, select: { name: t.name } });
      await em.query({ from: lp, select: { name: lp.name } });
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT t.name AS name FROM tags AS t",
         "SELECT lp_b0.name AS name FROM large_publishers AS lp LEFT OUTER JOIN publishers AS lp_b0 ON lp.id = lp_b0.id",
       ]
      `);
    });
  });

  describe("raw sql escape hatches", () => {
    // sql.ref supports unmodeled physical columns; the modeled Author age column exercises the same path.
    it("can use sql.condition and sql.ref for unmodeled columns", async () => {
      // Given Author a1 below the raw SQL age threshold of 35
      await insertAuthor({ first_name: "a1", age: 30 });
      // And Author a2 above the threshold, so only a2 passes the physical-column filter
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

    // A component-specific IS NOT NULL selects Comments on Authors rather than any non-null parent.
    it("can filter a polymorphic component with sql.ref", async () => {
      // Given an Author and a Book as possible Comment parents with the same numeric id
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      // And a Comment using the Author parent component
      await insertComment({ text: "on author", parent_author_id: 1 });
      // And a Comment using the Book parent component, leaving parent_author_id null
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

    // CASE combines a modeled Book order condition with a missing BookReview check to flag review work.
    it("can compute a CASE expression with an interpolated condition", async () => {
      // Given Author a1 with two Books whose order values both qualify for review
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1, order: 1 });
      await insertBook({ title: "b2", author_id: 1, order: 2 });
      // And a BookReview only for b1, leaving b2 as the Book that needs review
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
      // Given two Books by the same Author, so they share a window partition but have different title ranks
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
      // Given Authors a1 and a2 as separate window partitions
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And two Books for a1, with b2 ranked first by descending title
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      // And a single Book for a2, ranked first in its own partition
      await insertBook({ title: "b3", author_id: 2 });
      const em = newEntityManager();
      const [b] = aliases(Book);
      // And a ranked Book subquery; without DISTINCT ON, a window function plus a filter selects
      // the highest title per Author without collapsing the separate Author partitions
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
      // Given Author a1 with Book b1 for the BookReview aggregate
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      // And a BookReview above the goodReviews rating threshold
      await insertBookReview({ book_id: 1, rating: 5 });
      // And a BookReview below the threshold, counted only in the unfiltered total
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
      // Given Authors a1 and a2, with a2 left without Books
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And a Book only for a1, making the correlated EXISTS false for a2
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

    // UNION is not supported; merge and deduplicate Author ids from separate Book and Comment queries.
    it("can emulate UNION by merging separate queries", async () => {
      // Given Authors a1, a2, and a3, with a3 left without Books or Comments
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertAuthor({ first_name: "a3" });
      // And a Book only for a1, contributing its id through the Book query
      await insertBook({ title: "b1", author_id: 1 });
      // And a Comment only on a2, contributing a different id through the Comment query
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

  // Computed senior flags sort Authors with NULLS LAST; a Book subquery filters without a fan-out join,
  // so no DISTINCT is needed to keep one row per Author.
  it("can sort by computed flags and filter through a subquery", async () => {
    // Given Author a1 below the senior age threshold
    await insertAuthor({ first_name: "a1", age: 30 });
    // And Author a2 with null age and no Books, admitted by the null-age alternative and sorted last
    await insertAuthor({ first_name: "a2" });
    // And Author a3 above the senior age threshold, so its computed flag sorts first
    await insertAuthor({ first_name: "a3", age: 50 });
    // And Books for a1 and a3, admitting both through the Author id subquery
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 3 });
    const em = newEntityManager();
    const [a, b] = aliases(Author, Book);
    // And a shared senior flag for selection and sorting, which stays null for an unknown Author age
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
