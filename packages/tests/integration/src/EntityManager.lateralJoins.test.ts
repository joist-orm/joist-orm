import {
  insertAuthor,
  insertAuthorToTag,
  insertBook,
  insertBookAdvance,
  insertBookReview,
  insertComment,
  insertPublisher,
  insertTag,
  update,
} from "@src/entities/inserts";
import { knex, newEntityManager, queries, resetQueryCount } from "@src/testEm";
import { aliases, getMetadata, ParsedExpressionCondition, ParsedFindQuery, parseFindQuery, Plugin } from "joist-orm";
import { AdvanceStatus, Author, Book, BookReview, Comment, Tag } from "./entities";

const am = getMetadata(Author);

const opts = { softDeletes: "include" } as const;

describe("EntityManager.lateralJoins", () => {
  // -----------------------------------------------------------------------
  // These "approach" tests use pure SQL to demonstrate the before/after of the
  // EXISTS rewrite. Each test first runs the naive multi-JOIN query that
  // produces a cross-product, then runs the equivalent EXISTS subquery
  // that avoids the cross-product, and asserts both return the same
  // correct results. This helps maintainers understand the high-level SQL
  // transformation without needing to understand the Joist query parser.
  // -----------------------------------------------------------------------
  describe("approach", () => {
    it("two o2m collections: JOIN cross-product vs EXISTS", async () => {
      // a1 has book "b1" and comment "c1" — should match
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertComment({ text: "c1", parent_author_id: 1 });
      // a2 has book "b2" but no matching comment — should not match
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b2", author_id: 2 });

      // Before: naive multi-JOIN produces a cross-product, needs DISTINCT
      const { rows: before } = await knex.raw(`
        SELECT DISTINCT a.id, a.first_name
        FROM authors a
        LEFT JOIN books b ON a.id = b.author_id
        LEFT JOIN comments c ON a.id = c.parent_author_id
        WHERE b.title = 'b1' AND c.text = 'c1'
        ORDER BY a.id
      `);
      expect(before).toMatchObject([{ first_name: "a1" }]);

      // After: EXISTS — one row per parent, no DISTINCT needed
      const { rows: after } = await knex.raw(`
        SELECT a.id, a.first_name
        FROM authors a
        WHERE EXISTS (
          SELECT 1 FROM books b WHERE b.author_id = a.id AND b.title = 'b1'
        )
        AND EXISTS (
          SELECT 1 FROM comments c WHERE c.parent_author_id = a.id AND c.text = 'c1'
        )
        ORDER BY a.id
      `);
      expect(after).toMatchObject([{ first_name: "a1" }]);
    });

    it("m2m + o2m: junction table inside EXISTS", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertTag({ name: "t1" });
      await insertAuthorToTag({ author_id: 1, tag_id: 1 });
      await insertBook({ title: "b1", author_id: 1 });
      // a2 has tag but wrong book
      await insertAuthor({ first_name: "a2" });
      await insertAuthorToTag({ author_id: 2, tag_id: 1 });
      await insertBook({ title: "b2", author_id: 2 });

      // Before: three JOINs, DISTINCT to dedup
      const { rows: before } = await knex.raw(`
        SELECT DISTINCT a.id, a.first_name
        FROM authors a
        LEFT JOIN authors_to_tags att ON a.id = att.author_id
        LEFT JOIN tags t ON att.tag_id = t.id
        LEFT JOIN books b ON a.id = b.author_id
        WHERE t.name = 't1' AND b.title = 'b1'
        ORDER BY a.id
      `);
      expect(before).toMatchObject([{ first_name: "a1" }]);

      // After: m2m junction + target go inside one EXISTS
      const { rows: after } = await knex.raw(`
        SELECT a.id, a.first_name
        FROM authors a
        WHERE EXISTS (
          SELECT 1
          FROM authors_to_tags att
          JOIN tags t ON att.tag_id = t.id
          WHERE att.author_id = a.id AND t.name = 't1'
        )
        AND EXISTS (
          SELECT 1 FROM books b WHERE b.author_id = a.id AND b.title = 'b1'
        )
        ORDER BY a.id
      `);
      expect(after).toMatchObject([{ first_name: "a1" }]);
    });

    it("same-row AND: EXISTS preserves row-level semantics", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1, order: 1 }); // title AND order match
      await insertComment({ text: "c1", parent_author_id: 1 });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 2, order: 2 }); // title matches, order doesn't
      await insertComment({ text: "c1", parent_author_id: 2 });

      // Before: WHERE on both columns requires the same book row to match both
      const { rows: before } = await knex.raw(`
        SELECT DISTINCT a.id, a.first_name
        FROM authors a
        LEFT JOIN books b ON a.id = b.author_id
        LEFT JOIN comments c ON a.id = c.parent_author_id
        WHERE b.title = 'b1' AND b."order" = 1 AND c.text = 'c1'
        ORDER BY a.id
      `);
      expect(before).toMatchObject([{ first_name: "a1" }]);

      // After: both conditions inside a single EXISTS preserves same-row semantics
      const { rows: after } = await knex.raw(`
        SELECT a.id, a.first_name
        FROM authors a
        WHERE EXISTS (
          SELECT 1 FROM books b WHERE b.author_id = a.id AND b.title = 'b1' AND b."order" = 1
        )
        AND EXISTS (
          SELECT 1 FROM comments c WHERE c.parent_author_id = a.id AND c.text = 'c1'
        )
        ORDER BY a.id
      `);
      expect(after).toMatchObject([{ first_name: "a1" }]);
    });

    it("cross-product explosion: JOINs produce N*M rows, EXISTS produces 1", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      await insertBook({ title: "b3", author_id: 1 });
      await insertComment({ text: "c1", parent_author_id: 1 });
      await insertComment({ text: "c2", parent_author_id: 1 });
      await insertComment({ text: "c3", parent_author_id: 1 });

      // Before: 3 books × 3 comments = 9 rows before DISTINCT
      const { rows: crossProduct } = await knex.raw(`
        SELECT a.id, a.first_name
        FROM authors a
        LEFT JOIN books b ON a.id = b.author_id
        LEFT JOIN comments c ON a.id = c.parent_author_id
        WHERE b.title LIKE 'b%' AND c.text LIKE 'c%'
      `);
      expect(crossProduct).toHaveLength(9); // 3 * 3 cross-product!

      // After: EXISTS avoids the cross-product entirely — exactly 1 row
      const { rows: exists } = await knex.raw(`
        SELECT a.id, a.first_name
        FROM authors a
        WHERE EXISTS (
          SELECT 1 FROM books b WHERE b.author_id = a.id AND b.title LIKE 'b%'
        )
        AND EXISTS (
          SELECT 1 FROM comments c WHERE c.parent_author_id = a.id AND c.text LIKE 'c%'
        )
      `);
      expect(exists).toHaveLength(1);
      expect(exists).toMatchObject([{ first_name: "a1" }]);
    });

    it("nested o2m: reviews nested inside books EXISTS", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 5 });
      await insertComment({ text: "c1", parent_author_id: 1 });
      // a2 has low-rated review
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b2", author_id: 2 });
      await insertBookReview({ book_id: 2, rating: 1 });
      await insertComment({ text: "c1", parent_author_id: 2 });

      // Before: three JOINs deep
      const { rows: before } = await knex.raw(`
        SELECT DISTINCT a.id, a.first_name
        FROM authors a
        LEFT JOIN books b ON a.id = b.author_id
        LEFT JOIN book_reviews br ON b.id = br.book_id
        LEFT JOIN comments c ON a.id = c.parent_author_id
        WHERE br.rating >= 4 AND c.text = 'c1'
        ORDER BY a.id
      `);
      expect(before).toMatchObject([{ first_name: "a1" }]);

      // After: reviews as nested EXISTS inside the books EXISTS
      const { rows: after } = await knex.raw(`
        SELECT a.id, a.first_name
        FROM authors a
        WHERE EXISTS (
          SELECT 1 FROM books b
          WHERE b.author_id = a.id
          AND EXISTS (SELECT 1 FROM book_reviews br WHERE br.book_id = b.id AND br.rating >= 4)
        )
        AND EXISTS (
          SELECT 1 FROM comments c WHERE c.parent_author_id = a.id AND c.text = 'c1'
        )
        ORDER BY a.id
      `);
      expect(after).toMatchObject([{ first_name: "a1" }]);
    });

    it("anti-join: 'no children' uses NOT EXISTS", async () => {
      // a1 has NO books but has a comment
      await insertAuthor({ first_name: "a1" });
      await insertComment({ text: "c1", parent_author_id: 1 });
      // a2 has books
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 2 });
      await insertComment({ text: "c1", parent_author_id: 2 });

      // Before: LEFT JOIN + IS NULL detects missing children
      const { rows: before } = await knex.raw(`
        SELECT DISTINCT a.id, a.first_name
        FROM authors a
        LEFT JOIN books b ON a.id = b.author_id
        LEFT JOIN comments c ON a.id = c.parent_author_id
        WHERE b.id IS NULL AND c.text = 'c1'
        ORDER BY a.id
      `);
      expect(before).toMatchObject([{ first_name: "a1" }]);

      // After: NOT EXISTS detects no children
      const { rows: after } = await knex.raw(`
        SELECT a.id, a.first_name
        FROM authors a
        WHERE NOT EXISTS (
          SELECT 1 FROM books b WHERE b.author_id = a.id
        )
        AND EXISTS (
          SELECT 1 FROM comments c WHERE c.parent_author_id = a.id AND c.text = 'c1'
        )
        ORDER BY a.id
      `);
      expect(after).toMatchObject([{ first_name: "a1" }]);
    });
  });

  describe("collection rewrite", () => {
    it("rewrites two o2m collections to EXISTS", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertComment({ text: "c1", parent_author_id: 1 });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b2", author_id: 2 });

      const em = newEntityManager();
      resetQueryCount();
      const authors = await em.find(Author, { books: { title: "b1" }, comments: { text: "c1" } }, opts);
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.title = $1)`,
          ` AND EXISTS (SELECT 1 FROM comments AS c WHERE a.id = c.parent_author_id AND c.text = $2)`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $3`,
        ].join(""),
      ]);
    });

    it("rewrites OR across sibling collection aliases to sibling EXISTS", async () => {
      await insertAuthor({ first_name: "a1", age: 1 });
      await insertBook({ title: "b1", author_id: 1 });
      await insertAuthor({ first_name: "a2", age: 1 });
      await insertComment({ text: "c1", parent_author_id: 2 });
      await insertAuthor({ first_name: "a3", age: 2 });
      await insertBook({ title: "b3", author_id: 3 });

      const em = newEntityManager();
      const [a, b, c] = aliases(Author, Book, Comment);
      resetQueryCount();
      const authors = await em.find(
        Author,
        { as: a, books: b, comments: c },
        { ...opts, conditions: { and: [a.age.eq(1), { or: [b.id.ne(null), c.id.ne(null)] }] } },
      );

      expect(authors).toMatchEntity([{ firstName: "a1" }, { firstName: "a2" }]);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE a.age = $1`,
          ` AND (EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.id IS NOT NULL)`,
          ` OR EXISTS (SELECT 1 FROM comments AS c WHERE a.id = c.parent_author_id AND c.id IS NOT NULL)`,
          `)`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $2`,
        ].join(""),
      ]);
    });

    it("keeps sibling collection OR joins when a collection has filters outside the OR", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "match", author_id: 1, order: 2 });
      await insertBook({ title: "other", author_id: 1, order: 1 });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "match", author_id: 2, order: 1 });

      const em = newEntityManager();
      const [a, b, c] = aliases(Author, Book, Comment);
      resetQueryCount();
      const authors = await em.find(
        Author,
        { as: a, books: b, comments: c },
        {
          ...opts,
          allowMultipleLeftJoins: true,
          // I.e. `b.order = 1` must apply to the same joined book row as `b.title = 'match'`, so the OR cannot
          // become independent `EXISTS` clauses that could match different book rows.
          conditions: { and: [b.order.eq(1), { or: [b.title.eq("match"), c.text.eq("match")] }] },
        },
      );

      expect(authors).toMatchEntity([{ firstName: "a2" }]);
      expect(queries).toEqual([
        [
          `SELECT DISTINCT ON (a.id, a.id) a.*, a.id FROM authors AS a`,
          ` LEFT OUTER JOIN books AS b ON a.id = b.author_id`,
          ` LEFT OUTER JOIN comments AS c ON a.id = c.parent_author_id`,
          ` WHERE b."order" = $1 AND (b.title = $2 OR c.text = $3)`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $4`,
        ].join(""),
      ]);
    });

    it("rewrites single collection queries to EXISTS", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });

      const em = newEntityManager();
      resetQueryCount();
      const authors = await em.find(Author, { books: { title: "b1" } }, opts);
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.title = $1)`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $2`,
        ].join(""),
      ]);
    });

    it("keeps collection joins when optimizeJoinsToExists is disabled", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });

      const em = newEntityManager();
      resetQueryCount();
      const authors = await em.find(Author, { books: { title: "b1" } }, { ...opts, optimizeJoinsToExists: false });
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
      expect(queries).toEqual([
        [
          `SELECT DISTINCT ON (a.id, a.id) a.*, a.id FROM authors AS a`,
          ` LEFT OUTER JOIN books AS b ON a.id = b.author_id`,
          ` WHERE b.title = $1`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $2`,
        ].join(""),
      ]);
    });

    it("rewrites m2m + o2m collections", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertTag({ name: "t1" });
      await insertAuthorToTag({ author_id: 1, tag_id: 1 });
      await insertBook({ title: "b1", author_id: 1 });
      await insertAuthor({ first_name: "a2" });
      await insertAuthorToTag({ author_id: 2, tag_id: 1 });
      await insertBook({ title: "b2", author_id: 2 });
      await insertAuthor({ first_name: "a3" });
      await insertBook({ title: "b1", author_id: 3 });

      const em = newEntityManager();
      resetQueryCount();
      const authors = await em.find(Author, { tags: { name: "t1" }, books: { title: "b1" } }, opts);
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE EXISTS (SELECT 1 FROM authors_to_tags AS att`,
          ` LEFT OUTER JOIN tags AS t ON att.tag_id = t.id WHERE a.id = att.author_id AND t.name = $1)`,
          ` AND EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.title = $2)`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $3`,
        ].join(""),
      ]);
    });

    it("preserves same-row AND semantics within a single collection", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1, order: 1 });
      await insertComment({ text: "c1", parent_author_id: 1 });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 2, order: 2 });
      await insertComment({ text: "c1", parent_author_id: 2 });
      await insertAuthor({ first_name: "a3" });
      await insertBook({ title: "b2", author_id: 3, order: 1 });
      await insertComment({ text: "c1", parent_author_id: 3 });

      const em = newEntityManager();
      resetQueryCount();
      const authors = await em.find(Author, { books: { title: "b1", order: 1 }, comments: { text: "c1" } }, opts);
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.title = $1 AND b."order" = $2)`,
          ` AND EXISTS (SELECT 1 FROM comments AS c WHERE a.id = c.parent_author_id AND c.text = $3)`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $4`,
        ].join(""),
      ]);
    });

    it("avoids cross-product row explosion", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      await insertBook({ title: "b3", author_id: 1 });
      await insertComment({ text: "c1", parent_author_id: 1 });
      await insertComment({ text: "c2", parent_author_id: 1 });
      await insertComment({ text: "c3", parent_author_id: 1 });

      const em = newEntityManager();
      resetQueryCount();
      const authors = await em.find(
        Author,
        { books: { title: { like: "b%" } }, comments: { text: { like: "c%" } } },
        opts,
      );
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.title LIKE $1)`,
          ` AND EXISTS (SELECT 1 FROM comments AS c WHERE a.id = c.parent_author_id AND c.text LIKE $2)`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $3`,
        ].join(""),
      ]);
    });

    it("handles nested collections (books -> reviews) with another collection", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 5 });
      await insertComment({ text: "c1", parent_author_id: 1 });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b2", author_id: 2 });
      await insertBookReview({ book_id: 2, rating: 1 });
      await insertComment({ text: "c1", parent_author_id: 2 });

      const em = newEntityManager();
      resetQueryCount();
      const authors = await em.find(
        Author,
        { books: { reviews: { rating: { gte: 4 } } }, comments: { text: "c1" } },
        opts,
      );
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE EXISTS (SELECT 1 FROM books AS b`,
          ` WHERE a.id = b.author_id`,
          ` AND EXISTS (SELECT 1 FROM book_reviews AS br WHERE b.id = br.book_id AND br.rating >= $1))`,
          ` AND EXISTS (SELECT 1 FROM comments AS c WHERE a.id = c.parent_author_id AND c.text = $2)`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $3`,
        ].join(""),
      ]);
    });

    it("handles anti-join with another collection", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertComment({ text: "c1", parent_author_id: 1 });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 2 });
      await insertComment({ text: "c1", parent_author_id: 2 });

      const em = newEntityManager();
      resetQueryCount();
      const authors = await em.find(Author, { books: { id: null }, comments: { text: "c1" } }, opts);
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE NOT EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id)`,
          ` AND EXISTS (SELECT 1 FROM comments AS c WHERE a.id = c.parent_author_id AND c.text = $1)`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $2`,
        ].join(""),
      ]);
    });

    it("splits anti-join ORs with positive nested collection filters into EXISTS", async () => {
      await insertAuthor({ first_name: "no-books" });
      await insertAuthor({ first_name: "high-review" });
      await insertBook({ title: "b1", author_id: 2 });
      await insertBookReview({ book_id: 1, rating: 5 });
      await insertAuthor({ first_name: "low-review" });
      await insertBook({ title: "b2", author_id: 3 });
      await insertBookReview({ book_id: 2, rating: 1 });

      const em = newEntityManager();
      const [a, b, br] = aliases(Author, Book, BookReview);
      resetQueryCount();
      const authors = await em.find(
        Author,
        { as: a, books: { as: b, reviews: br } },
        { ...opts, conditions: { or: [b.id.eq(null), br.rating.eq(5)] } },
      );

      expect(authors).toMatchEntity([{ firstName: "no-books" }, { firstName: "high-review" }]);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE NOT EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id)`,
          ` OR EXISTS (SELECT 1 FROM books AS b`,
          ` WHERE a.id = b.author_id`,
          ` AND EXISTS (SELECT 1 FROM book_reviews AS br WHERE b.id = br.book_id AND br.rating = $1))`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $2`,
        ].join(""),
      ]);
    });

    it("splits collection id IS NULL OR id IN list into NOT EXISTS OR EXISTS", async () => {
      await insertAuthor({ first_name: "no-books" });
      await insertAuthor({ first_name: "book-1" });
      await insertBook({ title: "b1", author_id: 2 });
      await insertAuthor({ first_name: "book-2" });
      await insertBook({ title: "b2", author_id: 3 });
      await insertAuthor({ first_name: "book-3" });
      await insertBook({ title: "b3", author_id: 4 });

      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      resetQueryCount();
      const authors = await em.find(
        Author,
        { as: a, books: b },
        { ...opts, conditions: { or: [b.id.eq(null), b.id.in(["b:1", "b:2"])] } },
      );

      expect(authors).toMatchEntity([{ firstName: "no-books" }, { firstName: "book-1" }, { firstName: "book-2" }]);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          // I.e. the null option branch must mean no books at all, not `b.id IS NULL` inside a books EXISTS.
          ` WHERE NOT EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id)`,
          // I.e. non-null option ids remain a positive branch over matching book rows.
          ` OR EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.id = ANY($1))`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $2`,
        ].join(""),
      ]);
    });

    it("splits m2m target id IS NULL OR id IN list into NOT EXISTS OR EXISTS", async () => {
      await insertAuthor({ first_name: "no-tags" });
      await insertAuthor({ first_name: "tag-1" });
      await insertTag({ name: "t1" });
      await insertAuthorToTag({ author_id: 2, tag_id: 1 });
      await insertAuthor({ first_name: "tag-2" });
      await insertTag({ name: "t2" });
      await insertAuthorToTag({ author_id: 3, tag_id: 2 });
      await insertAuthor({ first_name: "tag-3" });
      await insertTag({ name: "t3" });
      await insertAuthorToTag({ author_id: 4, tag_id: 3 });

      const em = newEntityManager();
      const [a, t] = aliases(Author, Tag);
      resetQueryCount();
      const authors = await em.find(
        Author,
        { as: a, tags: t },
        { ...opts, conditions: { or: [t.id.eq(null), t.id.in(["t:1", "t:2"])] } },
      );

      expect(authors).toMatchEntity([{ firstName: "no-tags" }, { firstName: "tag-1" }, { firstName: "tag-2" }]);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          // I.e. m2m target `t.id IS NULL` must become no junction rows, not impossible NULL target ids in EXISTS.
          ` WHERE NOT EXISTS (SELECT 1 FROM authors_to_tags AS att WHERE a.id = att.author_id)`,
          ` OR EXISTS (SELECT 1 FROM authors_to_tags AS att`,
          ` LEFT OUTER JOIN tags AS t ON att.tag_id = t.id WHERE a.id = att.author_id AND t.id = ANY($1))`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $2`,
        ].join(""),
      ]);
    });

    it("returns empty results when no parent matches all collections", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertTag({ name: "t2" });
      await insertAuthorToTag({ author_id: 1, tag_id: 1 });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b2", author_id: 2 });
      await insertTag({ name: "t1" });
      await insertAuthorToTag({ author_id: 2, tag_id: 2 });

      const em = newEntityManager();
      const authors = await em.find(Author, { books: { title: "b1" }, tags: { name: "t1" } }, opts);
      expect(authors).toMatchEntity([]);
    });

    it("handles multiple results across multiple parents", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertTag({ name: "t1" });
      await insertAuthorToTag({ author_id: 1, tag_id: 1 });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 2 });
      await insertAuthorToTag({ author_id: 2, tag_id: 1 });
      await insertAuthor({ first_name: "a3" });
      await insertBook({ title: "b1", author_id: 3 });

      const em = newEntityManager();
      const authors = await em.find(Author, { books: { title: "b1" }, tags: { name: "t1" } }, opts);
      expect(authors).toMatchEntity([{ firstName: "a1" }, { firstName: "a2" }]);
    });
  });

  describe("semantic parity", () => {
    it("matches join-mode semantics for independent collection AND predicates", async () => {
      await insertAuthor({ first_name: "both" });
      await insertBook({ title: "book-match", author_id: 1 });
      await insertComment({ text: "comment-match", parent_author_id: 1 });
      await insertAuthor({ first_name: "book-only" });
      await insertBook({ title: "book-match", author_id: 2 });
      await insertComment({ text: "other", parent_author_id: 2 });
      await insertAuthor({ first_name: "comment-only" });
      await insertBook({ title: "other", author_id: 3 });
      await insertComment({ text: "comment-match", parent_author_id: 3 });

      const optimized = await newEntityManager().find(
        Author,
        { books: { title: "book-match" }, comments: { text: "comment-match" } },
        opts,
      );
      const joinMode = await newEntityManager().find(
        Author,
        { books: { title: "book-match" }, comments: { text: "comment-match" } },
        { ...opts, optimizeJoinsToExists: false },
      );

      expect(optimized).toMatchEntity([{ firstName: "both" }]);
      expect(joinMode).toMatchEntity([{ firstName: "both" }]);
    });

    it("matches join-mode semantics for same-collection same-row AND predicates", async () => {
      await insertAuthor({ first_name: "split-rows" });
      await insertBook({ title: "match", author_id: 1, order: 2 });
      await insertBook({ title: "other", author_id: 1, order: 1 });
      await insertAuthor({ first_name: "same-row" });
      await insertBook({ title: "match", author_id: 2, order: 1 });

      const optimized = await newEntityManager().find(Author, { books: { title: "match", order: 1 } }, opts);
      const joinMode = await newEntityManager().find(
        Author,
        { books: { title: "match", order: 1 } },
        { ...opts, optimizeJoinsToExists: false },
      );

      expect(optimized).toMatchEntity([{ firstName: "same-row" }]);
      expect(joinMode).toMatchEntity([{ firstName: "same-row" }]);
    });

    it("matches join-mode semantics for sibling collection OR predicates", async () => {
      await insertAuthor({ first_name: "book-match" });
      await insertBook({ title: "match", author_id: 1 });
      await insertAuthor({ first_name: "comment-match" });
      await insertComment({ text: "match", parent_author_id: 2 });
      await insertAuthor({ first_name: "no-match" });
      await insertBook({ title: "other", author_id: 3 });

      const [b, c] = aliases(Book, Comment);
      const optimized = await newEntityManager().find(
        Author,
        { books: b, comments: c },
        { ...opts, conditions: { or: [b.title.eq("match"), c.text.eq("match")] } },
      );
      const joinMode = await newEntityManager().find(
        Author,
        { books: b, comments: c },
        { ...opts, optimizeJoinsToExists: false, conditions: { or: [b.title.eq("match"), c.text.eq("match")] } },
      );

      expect(optimized).toMatchEntity([{ firstName: "book-match" }, { firstName: "comment-match" }]);
      expect(joinMode).toMatchEntity([{ firstName: "book-match" }, { firstName: "comment-match" }]);
    });

    it("matches join-mode semantics for mixed ordinary and collection OR predicates", async () => {
      await insertAuthor({ first_name: "author-branch" });
      await insertAuthor({ first_name: "book-branch" });
      await insertBook({ title: "match", author_id: 2 });
      await insertAuthor({ first_name: "comment-branch" });
      await insertComment({ text: "match", parent_author_id: 3 });
      await insertAuthor({ first_name: "no-match" });
      await insertBook({ title: "other", author_id: 4 });
      await insertComment({ text: "other", parent_author_id: 4 });

      const [a, b, c] = aliases(Author, Book, Comment);
      const optimized = await newEntityManager().find(
        Author,
        { as: a, books: b, comments: c },
        { ...opts, conditions: { or: [a.firstName.eq("author-branch"), b.title.eq("match"), c.text.eq("match")] } },
      );
      const joinMode = await newEntityManager().find(
        Author,
        { as: a, books: b, comments: c },
        {
          ...opts,
          optimizeJoinsToExists: false,
          conditions: { or: [a.firstName.eq("author-branch"), b.title.eq("match"), c.text.eq("match")] },
        },
      );

      expect(optimized).toMatchEntity([
        { firstName: "author-branch" },
        { firstName: "book-branch" },
        { firstName: "comment-branch" },
      ]);
      expect(joinMode).toMatchEntity([
        { firstName: "author-branch" },
        { firstName: "book-branch" },
        { firstName: "comment-branch" },
      ]);
    });

    it("matches join-mode semantics for anti-join OR predicates", async () => {
      await insertAuthor({ first_name: "no-books" });
      await insertAuthor({ first_name: "high-review" });
      await insertBook({ title: "b1", author_id: 2 });
      await insertBookReview({ book_id: 1, rating: 5 });
      await insertAuthor({ first_name: "low-review" });
      await insertBook({ title: "b2", author_id: 3 });
      await insertBookReview({ book_id: 2, rating: 1 });

      const [b, br] = aliases(Book, BookReview);
      const optimized = await newEntityManager().find(
        Author,
        { books: { as: b, reviews: br } },
        { ...opts, conditions: { or: [b.id.eq(null), br.rating.eq(5)] } },
      );
      const joinMode = await newEntityManager().find(
        Author,
        { books: { as: b, reviews: br } },
        { ...opts, optimizeJoinsToExists: false, conditions: { or: [b.id.eq(null), br.rating.eq(5)] } },
      );

      expect(optimized).toMatchEntity([{ firstName: "no-books" }, { firstName: "high-review" }]);
      expect(joinMode).toMatchEntity([{ firstName: "no-books" }, { firstName: "high-review" }]);
    });

    it("matches join-mode semantics for collection id IS NULL OR id IN list predicates", async () => {
      await insertAuthor({ first_name: "no-books" });
      await insertAuthor({ first_name: "book-1" });
      await insertBook({ title: "b1", author_id: 2 });
      await insertAuthor({ first_name: "book-2" });
      await insertBook({ title: "b2", author_id: 3 });
      await insertAuthor({ first_name: "book-3" });
      await insertBook({ title: "b3", author_id: 4 });

      const [b] = aliases(Book);
      const optimized = await newEntityManager().find(
        Author,
        { books: b },
        { ...opts, conditions: { or: [b.id.eq(null), b.id.in(["b:1", "b:2"])] } },
      );
      const joinMode = await newEntityManager().find(
        Author,
        { books: b },
        {
          ...opts,
          optimizeJoinsToExists: false,
          conditions: { or: [b.id.eq(null), b.id.in(["b:1", "b:2"])] },
        },
      );

      expect(optimized).toMatchEntity([{ firstName: "no-books" }, { firstName: "book-1" }, { firstName: "book-2" }]);
      expect(joinMode).toMatchEntity([{ firstName: "no-books" }, { firstName: "book-1" }, { firstName: "book-2" }]);
    });

    it("matches join-mode semantics for m2m target id IS NULL OR id IN list predicates", async () => {
      await insertAuthor({ first_name: "no-tags" });
      await insertAuthor({ first_name: "tag-1" });
      await insertTag({ name: "t1" });
      await insertAuthorToTag({ author_id: 2, tag_id: 1 });
      await insertAuthor({ first_name: "tag-2" });
      await insertTag({ name: "t2" });
      await insertAuthorToTag({ author_id: 3, tag_id: 2 });
      await insertAuthor({ first_name: "tag-3" });
      await insertTag({ name: "t3" });
      await insertAuthorToTag({ author_id: 4, tag_id: 3 });

      const [t] = aliases(Tag);
      const optimized = await newEntityManager().find(
        Author,
        { tags: t },
        { ...opts, conditions: { or: [t.id.eq(null), t.id.in(["t:1", "t:2"])] } },
      );
      const joinMode = await newEntityManager().find(
        Author,
        { tags: t },
        {
          ...opts,
          optimizeJoinsToExists: false,
          conditions: { or: [t.id.eq(null), t.id.in(["t:1", "t:2"])] },
        },
      );

      expect(optimized).toMatchEntity([{ firstName: "no-tags" }, { firstName: "tag-1" }, { firstName: "tag-2" }]);
      expect(joinMode).toMatchEntity([{ firstName: "no-tags" }, { firstName: "tag-1" }, { firstName: "tag-2" }]);
    });

    it("matches join-mode semantics for m2m collection predicates", async () => {
      await insertAuthor({ first_name: "tag-match" });
      await insertTag({ name: "match" });
      await insertAuthorToTag({ author_id: 1, tag_id: 1 });
      await insertAuthor({ first_name: "no-tag" });
      await insertAuthor({ first_name: "other-tag" });
      await insertTag({ name: "other" });
      await insertAuthorToTag({ author_id: 3, tag_id: 2 });

      const optimized = await newEntityManager().find(Author, { tags: { name: "match" } }, opts);
      const joinMode = await newEntityManager().find(
        Author,
        { tags: { name: "match" } },
        { ...opts, optimizeJoinsToExists: false },
      );

      expect(optimized).toMatchEntity([{ firstName: "tag-match" }]);
      expect(joinMode).toMatchEntity([{ firstName: "tag-match" }]);
    });

    it("matches join-mode semantics for cross-scope OR predicates that cannot stay as EXISTS", async () => {
      await insertAuthor({ first_name: "book-branch" });
      await insertBook({ title: "match", author_id: 1 });
      await insertAuthor({ first_name: "author-branch" });
      await insertBook({ title: "other", author_id: 2 });
      await insertAuthor({ first_name: "no-match" });
      await insertBook({ title: "other", author_id: 3 });

      const [a, b] = aliases(Author, Book);
      const optimized = await newEntityManager().find(
        Author,
        { as: a, books: b },
        { ...opts, conditions: { or: [b.title.eq("match"), a.firstName.eq("author-branch")] } },
      );
      const joinMode = await newEntityManager().find(
        Author,
        { as: a, books: b },
        {
          ...opts,
          optimizeJoinsToExists: false,
          conditions: { or: [b.title.eq("match"), a.firstName.eq("author-branch")] },
        },
      );

      expect(optimized).toMatchEntity([{ firstName: "book-branch" }, { firstName: "author-branch" }]);
      expect(joinMode).toMatchEntity([{ firstName: "book-branch" }, { firstName: "author-branch" }]);
    });

    it("matches join-mode semantics for nullable descendant OR predicates under a collection", async () => {
      await insertAuthor({ first_name: "comment-branch" });
      await insertComment({ text: "match" });
      await insertBook({ title: "b1", author_id: 1 });
      await update("books", { id: 1, random_comment_id: 1 });
      await insertAuthor({ first_name: "prequel-branch" });
      await insertBook({ title: "prequel-match", author_id: 2 });
      await insertBook({ title: "b2", author_id: 2, prequel_id: 2 });
      await insertAuthor({ first_name: "no-match" });
      await insertBook({ title: "b3", author_id: 3 });

      const [b, p, c] = aliases(Book, Book, Comment);
      const optimized = await newEntityManager().find(
        Author,
        { books: { as: b, prequel: p, randomComment: c } },
        { ...opts, conditions: { or: [p.title.eq("prequel-match"), c.text.eq("match")] } },
      );
      const joinMode = await newEntityManager().find(
        Author,
        { books: { as: b, prequel: p, randomComment: c } },
        {
          ...opts,
          optimizeJoinsToExists: false,
          conditions: { or: [p.title.eq("prequel-match"), c.text.eq("match")] },
        },
      );

      expect(optimized).toMatchEntity([{ firstName: "comment-branch" }, { firstName: "prequel-branch" }]);
      expect(joinMode).toMatchEntity([{ firstName: "comment-branch" }, { firstName: "prequel-branch" }]);
    });
  });

  describe("beforeFind plugin AST", () => {
    class QueryMutatingPlugin extends Plugin {
      seen: ParsedFindQuery[] = [];
      mutate: (query: ParsedFindQuery) => void;

      constructor(mutate: (query: ParsedFindQuery) => void) {
        super();
        this.mutate = mutate;
      }

      beforeFind(meta: unknown, operation: unknown, query: ParsedFindQuery): void {
        this.seen.push(structuredClone(query));
        this.mutate(query);
      }
    }

    it("passes logical collection joins to beforeFind, then optimizes plugin-added local conditions", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "match", author_id: 1 });

      const em = newEntityManager();
      const plugin = new QueryMutatingPlugin((query) => {
        const book = query.tables.find((table) => table.table === "books") ?? failTest("No books join");
        addCondition(query, {
          kind: "column",
          alias: book.alias,
          column: "title",
          dbType: "character varying",
          cond: { kind: "eq", value: "match" },
        });
      });
      em.addPlugin(plugin);

      resetQueryCount();
      const [b] = aliases(Book);
      const authors = await em.find(Author, { books: b }, opts);

      expect(authors).toMatchEntity([{ firstName: "a1" }]);
      expect(plugin.seen[0]).toMatchObject({
        tables: [
          { alias: "a", table: "authors", join: "primary" },
          { alias: "b", table: "books", join: "outer", col1: "a.id", col2: "b.author_id" },
        ],
      });
      expect(JSON.stringify(plugin.seen[0]).includes('"kind":"exists"')).toEqual(false);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.title = $1)`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $2`,
        ].join(""),
      ]);
    });

    it("rewrites plugin-added mixed-scope OR collection branches to EXISTS", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "match", author_id: 1 });
      await insertAuthor({ first_name: "match" });

      const em = newEntityManager();
      const plugin = new QueryMutatingPlugin((query) => {
        const author = query.tables.find((table) => table.table === "authors") ?? failTest("No authors table");
        const book = query.tables.find((table) => table.table === "books") ?? failTest("No books join");
        addCondition(query, {
          kind: "exp",
          op: "or",
          conditions: [
            {
              kind: "column",
              alias: book.alias,
              column: "title",
              dbType: "character varying",
              cond: { kind: "eq", value: "match" },
            },
            {
              kind: "column",
              alias: author.alias,
              column: "first_name",
              dbType: "character varying",
              cond: { kind: "eq", value: "match" },
            },
          ],
        });
      });
      em.addPlugin(plugin);

      resetQueryCount();
      const [b] = aliases(Book);
      const authors = await em.find(Author, { books: b }, opts);

      expect(authors).toMatchEntity([{ firstName: "a1" }, { firstName: "match" }]);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE (EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.title = $1)`,
          ` OR a.first_name = $2)`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $3`,
        ].join(""),
      ]);
    });

    it("preserves optional joins under EXISTS for nullable OR branches", async () => {
      await insertAuthor({ first_name: "comment-match" });
      await insertComment({ text: "match" });
      await insertBook({ title: "b1", author_id: 1 });
      await update("books", { id: 1, random_comment_id: 1 });
      await insertAuthor({ first_name: "review-match" });
      await insertBook({ title: "prequel-match", author_id: 2 });
      await insertBook({ title: "b2", author_id: 2, prequel_id: 2 });
      await insertAuthor({ first_name: "no-match" });
      await insertBook({ title: "b3", author_id: 3 });

      const em = newEntityManager();
      const [b, p, c] = aliases(Book, Book, Comment);

      resetQueryCount();
      const authors = await em.find(
        Author,
        { books: { as: b, prequel: p, randomComment: c } },
        { ...opts, conditions: { or: [p.title.eq("prequel-match"), c.text.eq("match")] } },
      );

      expect(authors).toMatchEntity([{ firstName: "comment-match" }, { firstName: "review-match" }]);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          // I.e. the EXISTS should be a plain `SELECT 1`; DISTINCT is unnecessary for existence checks.
          ` WHERE EXISTS (SELECT 1 FROM books AS b`,
          // I.e. optional descendants under `books` must stay LEFT JOINs so either OR branch can match independently.
          ` LEFT OUTER JOIN books AS b1 ON b.prequel_id = b1.id`,
          ` LEFT OUTER JOIN comments AS c ON b.random_comment_id = c.id`,
          // I.e. both nullable branch predicates must stay grouped under the LEFT JOINs.
          ` WHERE a.id = b.author_id AND (b1.title = $1 OR c.text = $2))`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $3`,
        ].join(""),
      ]);
    });

    it("optimizes plugin-added alias id IS NULL conditions to NOT EXISTS", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 2 });

      const em = newEntityManager();
      const plugin = new QueryMutatingPlugin((query) => {
        const book = query.tables.find((table) => table.table === "books") ?? failTest("No books join");
        addCondition(query, {
          kind: "column",
          alias: book.alias,
          column: "id",
          dbType: "int",
          cond: { kind: "is-null" },
        });
      });
      em.addPlugin(plugin);

      resetQueryCount();
      const [b] = aliases(Book);
      const authors = await em.find(Author, { books: b }, opts);

      expect(authors).toMatchEntity([{ firstName: "a1" }]);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE NOT EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id)`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $1`,
        ].join(""),
      ]);
    });

    it("keeps plugin-added aliases required transitively by a CTE join", async () => {
      await insertPublisher({ id: 1, name: "p1" });
      await insertAuthor({ id: 1, first_name: "a1", publisher_id: 1 });
      await insertComment({ text: "c1", parent_publisher_id: 1 });

      const em = newEntityManager();
      const plugin = new QueryMutatingPlugin((query) => {
        const author = query.tables.find((table) => table.table === "authors") ?? failTest("No authors table");
        query.ctes ??= [];
        query.ctes.push({
          alias: "_comment_ids",
          columns: [
            { columnName: "parent_publisher_id", dbType: "int" },
            { columnName: "id", dbType: "int" },
          ],
          query: { kind: "raw", sql: "SELECT parent_publisher_id, id FROM comments", bindings: [] },
        });
        query.tables.push(
          {
            join: "inner",
            alias: "p",
            table: "publishers",
            col1: `${author.alias}.publisher_id`,
            col2: "p.id",
          },
          {
            join: "inner",
            alias: "ci",
            table: "_comment_ids",
            col1: "p.id",
            col2: "ci.parent_publisher_id",
          },
        );
        addCondition(query, {
          kind: "raw",
          aliases: ["ci"],
          condition: "ci.id IS NOT NULL",
          bindings: [],
          pruneable: false,
        });
      });
      em.addPlugin(plugin);

      resetQueryCount();
      const authors = await em.find(Author, {}, opts);

      expect(authors).toMatchEntity([{ firstName: "a1" }]);
      expect(queries).toEqual([
        [
          `WITH _comment_ids (parent_publisher_id, id) AS (SELECT parent_publisher_id, id FROM comments) `,
          `SELECT a.* FROM authors AS a`,
          ` JOIN publishers AS p ON a.publisher_id = p.id`,
          ` JOIN _comment_ids AS ci ON p.id = ci.parent_publisher_id`,
          ` WHERE ci.id IS NOT NULL`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $1`,
        ].join(""),
      ]);
    });
  });

  describe("deep sibling auto-detection", () => {
    it("rewrites 2nd-level sibling collections (books → reviews + advances)", async () => {
      // a1 has book with high-rated review AND a pending advance — should match
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 5 });
      await insertPublisher({ name: "p1" });
      await insertBookAdvance({ book_id: 1, publisher_id: 1 });
      // a2 has book with high-rated review but no advance — should not match
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b2", author_id: 2 });
      await insertBookReview({ book_id: 2, rating: 5 });

      const em = newEntityManager();
      resetQueryCount();
      const authors = await em.find(
        Author,
        { books: { reviews: { rating: { gte: 4 } }, advances: { status: AdvanceStatus.Pending } } },
        opts,
      );
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE EXISTS (SELECT 1 FROM books AS b`,
          ` WHERE a.id = b.author_id`,
          ` AND EXISTS (SELECT 1 FROM book_reviews AS br WHERE b.id = br.book_id AND br.rating >= $1)`,
          ` AND EXISTS (SELECT 1 FROM book_advances AS ba WHERE b.id = ba.book_id AND ba.status_id = $2))`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $3`,
        ].join(""),
      ]);
    });

    it("generates correct SQL for deep sibling EXISTS", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 5 });
      await insertPublisher({ name: "p1" });
      await insertBookAdvance({ book_id: 1, publisher_id: 1 });

      const em = newEntityManager();
      resetQueryCount();
      await em.find(
        Author,
        { books: { reviews: { rating: { gte: 4 } }, advances: { status: AdvanceStatus.Pending } } },
        opts,
      );
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE EXISTS (SELECT 1 FROM books AS b`,
          ` WHERE a.id = b.author_id`,
          ` AND EXISTS (SELECT 1 FROM book_reviews AS br WHERE b.id = br.book_id AND br.rating >= $1)`,
          ` AND EXISTS (SELECT 1 FROM book_advances AS ba WHERE b.id = ba.book_id AND ba.status_id = $2))`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $3`,
        ].join(""),
      ]);
    });

    it("absorbs books into EXISTS when its siblings are at the deeper level", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 5 });
      await insertPublisher({ name: "p1" });
      await insertBookAdvance({ book_id: 1, publisher_id: 1 });

      const em = newEntityManager();
      resetQueryCount();
      await em.find(
        Author,
        { books: { reviews: { rating: { gte: 4 } }, advances: { status: AdvanceStatus.Pending } } },
        opts,
      );
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE EXISTS (SELECT 1 FROM books AS b`,
          ` WHERE a.id = b.author_id`,
          ` AND EXISTS (SELECT 1 FROM book_reviews AS br WHERE b.id = br.book_id AND br.rating >= $1)`,
          ` AND EXISTS (SELECT 1 FROM book_advances AS ba WHERE b.id = ba.book_id AND ba.status_id = $2))`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $3`,
        ].join(""),
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // Cross-scope alias conditions: when `conditions: { or/and: [...] }` references
  // aliases from BOTH the outer entity AND a collection (o2m/m2m) path.
  //
  // The key challenge: collection fields become EXISTS subqueries, so the collection's
  // alias lives inside the EXISTS. If an outer `conditions` expression references that
  // alias alongside the outer entity's alias, the scopes conflict.
  //
  // Resolution depends on the expression operator:
  //   - AND: each branch can be evaluated independently, so the collection branch
  //     moves into the EXISTS while the outer branch stays outside. No unwrap needed.
  //   - OR: all branches must be visible in the same scope (you can't split an OR
  //     across an EXISTS boundary), so the EXISTS is unwrapped back to a regular
  //     LEFT OUTER JOIN + DISTINCT ON.
  // -----------------------------------------------------------------------
  describe("cross-scope alias conditions", () => {
    describe("approach", () => {
      it("OR across scopes: must unwrap EXISTS to JOIN because both sides of OR need same scope", async () => {
        // a1 has book "b1" — matches via b.title
        await insertAuthor({ first_name: "a1" });
        await insertBook({ title: "match", author_id: 1 });
        // a2 has first_name "match" — matches via a.first_name
        await insertAuthor({ first_name: "match" });
        await insertBook({ title: "other", author_id: 2 });
        // a3 matches neither
        await insertAuthor({ first_name: "a3" });
        await insertBook({ title: "other", author_id: 3 });

        // With EXISTS: can't express `WHERE (EXISTS(... b.title='match') OR a.first_name='match')`
        // because OR requires both sides visible in the same FROM. Must fall back to JOIN:
        const { rows } = await knex.raw(`
          SELECT DISTINCT ON (a.id) a.id, a.first_name
          FROM authors a
          LEFT OUTER JOIN books b ON a.id = b.author_id
          WHERE (b.title = 'match' OR a.first_name = 'match')
          ORDER BY a.id
        `);
        expect(rows).toMatchObject([{ first_name: "a1" }, { first_name: "match" }]);
      });

      it("AND across scopes: each branch evaluates independently, EXISTS stays intact", async () => {
        // a1 has first_name "a1" AND book "match" — matches both
        await insertAuthor({ first_name: "a1" });
        await insertBook({ title: "match", author_id: 1 });
        // a2 has first_name "a2" AND book "match" — outer condition fails
        await insertAuthor({ first_name: "a2" });
        await insertBook({ title: "match", author_id: 2 });
        // a3 has first_name "a1" but no matching book — EXISTS fails
        await insertAuthor({ first_name: "a3" });
        await insertBook({ title: "other", author_id: 3 });

        // AND can keep EXISTS: outer condition goes on the outer WHERE,
        // collection condition goes inside the EXISTS subquery.
        const { rows } = await knex.raw(`
          SELECT a.id, a.first_name
          FROM authors a
          WHERE a.first_name = 'a1'
          AND EXISTS (SELECT 1 FROM books b WHERE b.author_id = a.id AND b.title = 'match')
          ORDER BY a.id
        `);
        expect(rows).toMatchObject([{ first_name: "a1" }]);
      });
    });

    // ---- Simple OR: o2m alias + outer alias ----
    // The OR references `b` (inside books EXISTS) and `a` (outer Author), and the collection branch can stay scoped.
    it("OR with o2m alias + outer alias rewrites collection branch to EXISTS", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "match", author_id: 1 });
      await insertAuthor({ first_name: "match" });
      await insertBook({ title: "other", author_id: 2 });
      await insertAuthor({ first_name: "a3" });
      await insertBook({ title: "other", author_id: 3 });

      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      resetQueryCount();
      const authors = await em.find(
        Author,
        { as: a, books: b },
        { ...opts, conditions: { or: [b.title.eq("match"), a.firstName.eq("match")] } },
      );
      // a1 matches via b.title, a2 matches via a.firstName
      expect(authors).toMatchEntity([{ firstName: "a1" }, { firstName: "match" }]);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.title = $1)`,
          ` OR a.first_name = $2`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $3`,
        ].join(""),
      ]);
    });

    // ---- Simple AND: o2m alias + outer alias ----
    // The AND references `b` (inside books EXISTS) and `a` (outer Author).
    // Since AND branches are independent, `b.title` moves into the EXISTS
    // while `a.firstName` stays on the outer WHERE. No unwrap needed.
    it("AND with o2m alias + outer alias keeps EXISTS intact", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "match", author_id: 1 });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "match", author_id: 2 });
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "other", author_id: 3 });

      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      resetQueryCount();
      const authors = await em.find(
        Author,
        { as: a, books: b },
        { ...opts, conditions: { and: [b.title.eq("match"), a.firstName.eq("a1")] } },
      );
      // Only a1 matches both: firstName="a1" AND has book with title="match"
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
      // The EXISTS stays intact — `b.title` moved inside, `a.firstName` stays outside
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE a.first_name = $1`,
          ` AND EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.title = $2)`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $3`,
        ].join(""),
      ]);
    });

    // ---- Nested: cross-scope OR inside an AND ----
    // The outer AND has `a.age > 20` (outer) plus an inner OR that mixes
    // `b.title` (inside books EXISTS) with `a.firstName` (outer).
    it("OR inside AND: mixed OR rewrites collection branch to EXISTS", async () => {
      await insertAuthor({ first_name: "match", age: 30 });
      await insertBook({ title: "other", author_id: 1 });
      await insertAuthor({ first_name: "a2", age: 30 });
      await insertBook({ title: "match", author_id: 2 });
      // a3 matches OR but not age
      await insertAuthor({ first_name: "match", age: 10 });
      await insertBook({ title: "other", author_id: 3 });

      const em = newEntityManager();
      const [a, b] = aliases(Author, Book);
      resetQueryCount();
      const authors = await em.find(
        Author,
        { as: a, books: b },
        {
          ...opts,
          conditions: {
            and: [a.age.gt(20), { or: [b.title.eq("match"), a.firstName.eq("match")] }],
          },
        },
      );
      // a1: age=30 ✓, firstName="match" ✓ (via OR) → matches
      // a2: age=30 ✓, book title="match" ✓ (via OR) → matches
      // a3: age=10 ✗ → excluded by AND
      expect(authors).toMatchEntity([{ firstName: "match" }, { firstName: "a2" }]);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE a.age > $1`,
          ` AND (EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.title = $2)`,
          ` OR a.first_name = $3)`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $4`,
        ].join(""),
      ]);
    });

    // ---- AND with m2m alias + outer alias ----
    // Same as the o2m case but through a many-to-many (tags).
    // `t.name` moves into the m2m EXISTS, `a.firstName` stays outside.
    it("AND with m2m alias + outer alias keeps EXISTS intact", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertTag({ name: "match" });
      await insertAuthorToTag({ author_id: 1, tag_id: 1 });
      await insertAuthor({ first_name: "a2" });
      await insertAuthorToTag({ author_id: 2, tag_id: 1 });
      await insertAuthor({ first_name: "a1" });

      const em = newEntityManager();
      const [a, t] = aliases(Author, Tag);
      resetQueryCount();
      const authors = await em.find(
        Author,
        { as: a, tags: t },
        { ...opts, conditions: { and: [t.name.eq("match"), a.firstName.eq("a1")] } },
      );
      // Only a1 matches both: firstName="a1" AND has tag "match"
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
      // m2m EXISTS stays intact — `t.name` moved inside
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE a.first_name = $1`,
          ` AND EXISTS (SELECT 1 FROM authors_to_tags AS att`,
          ` LEFT OUTER JOIN tags AS t ON att.tag_id = t.id WHERE a.id = att.author_id AND t.name = $2)`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $3`,
        ].join(""),
      ]);
    });

    // ---- OR with m2m alias + outer alias ----
    it("OR with m2m alias + outer alias rewrites collection branch to EXISTS", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertTag({ name: "match" });
      await insertAuthorToTag({ author_id: 1, tag_id: 1 });
      await insertAuthor({ first_name: "match" });
      await insertTag({ name: "other" });
      await insertAuthorToTag({ author_id: 2, tag_id: 2 });
      await insertAuthor({ first_name: "a3" });

      const em = newEntityManager();
      const [a, t] = aliases(Author, Tag);
      resetQueryCount();
      const authors = await em.find(
        Author,
        { as: a, tags: t },
        { ...opts, conditions: { or: [t.name.eq("match"), a.firstName.eq("match")] } },
      );
      // a1 matches via t.name, a2 matches via a.firstName
      expect(authors).toMatchEntity([{ firstName: "a1" }, { firstName: "match" }]);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` WHERE EXISTS (SELECT 1 FROM authors_to_tags AS att`,
          ` LEFT OUTER JOIN tags AS t ON att.tag_id = t.id WHERE a.id = att.author_id AND t.name = $1)`,
          ` OR a.first_name = $2`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $3`,
        ].join(""),
      ]);
    });

    // ---- Verify the parseFindQuery AST is stable before optimization ----
    // This shows the plugin-facing structural result: collection aliases stay
    // as top-level JOINs, and EXISTS is introduced later by optimizeCollectionJoins.
    it("parseFindQuery: keeps AND conditions in the logical JOIN AST", async () => {
      const [a, b] = aliases(Author, Book);
      const filter = { as: a, books: b };
      const conditions = { and: [b.title.eq("match"), a.firstName.eq("a1")] };
      const result = parseFindQuery(am, filter, { ...opts, conditions });
      expect(result).toMatchObject({
        selects: [`a.*`],
        tables: [
          { alias: "a", table: "authors", join: "primary" },
          { alias: "b", table: "books", join: "outer", col1: "a.id", col2: "b.author_id" },
        ],
        condition: {
          op: "and",
          conditions: [
            { kind: "column", alias: "b", column: "title", cond: { kind: "eq", value: "match" } },
            { kind: "column", alias: "a", column: "first_name", cond: { kind: "eq", value: "a1" } },
          ],
        },
      });
    });

    it("parseFindQuery: keeps OR conditions in the logical JOIN AST", async () => {
      const [a, b] = aliases(Author, Book);
      const filter = { as: a, books: b };
      const conditions = { or: [b.title.eq("match"), a.firstName.eq("a1")] };
      const result = parseFindQuery(am, filter, { ...opts, conditions });
      expect(result).toMatchObject({
        selects: [`a.*`],
        tables: [
          { alias: "a", table: "authors", join: "primary" },
          { alias: "b", table: "books", join: "outer", col1: "a.id", col2: "b.author_id" },
        ],
        condition: {
          op: "or",
          conditions: [
            { kind: "column", alias: "b", column: "title", cond: { kind: "eq", value: "match" } },
            { kind: "column", alias: "a", column: "first_name", cond: { kind: "eq", value: "a1" } },
          ],
        },
      });
    });
  });

  // -----------------------------------------------------------------------
  // Performance benchmarks — normally skipped. Remove `.skip` to run manually.
  // These use raw SQL via knex.raw to compare JOIN+DISTINCT vs EXISTS
  // at scale, demonstrating the cross-product explosion problem.
  // -----------------------------------------------------------------------
  describe.skip("benchmarks", () => {
    const NUM_AUTHORS = 1_000;
    const BOOKS_PER_AUTHOR = 50;
    const COMMENTS_PER_AUTHOR = 50;
    const NUM_TAGS = 20;
    const TAGS_PER_AUTHOR = 5;

    beforeEach(async () => {
      const now = "now()";
      await knex.raw(`
        INSERT INTO authors (first_name, initials, number_of_books, created_at, updated_at)
        SELECT 'author_' || i::text, '', ${BOOKS_PER_AUTHOR}, ${now}, ${now}
        FROM generate_series(1, ${NUM_AUTHORS}) AS t(i)
      `);
      await knex.raw(`
        INSERT INTO books (title, author_id, notes, created_at, updated_at)
        SELECT 'book_' || a.id || '_' || j::text, a.id, '', ${now}, ${now}
        FROM authors a, generate_series(1, ${BOOKS_PER_AUTHOR}) AS t(j)
      `);
      await knex.raw(`
        INSERT INTO comments (parent_author_id, parent_tags, text, created_at, updated_at)
        SELECT a.id, '', 'comment_' || a.id || '_' || j::text, ${now}, ${now}
        FROM authors a, generate_series(1, ${COMMENTS_PER_AUTHOR}) AS t(j)
      `);
      await knex.raw(`
        INSERT INTO tags (name, created_at, updated_at)
        SELECT 'tag_' || i::text, ${now}, ${now}
        FROM generate_series(1, ${NUM_TAGS}) AS t(i)
      `);
      await knex.raw(`
        INSERT INTO authors_to_tags (author_id, tag_id)
        SELECT a.id, j
        FROM authors a, generate_series(1, ${TAGS_PER_AUTHOR}) AS t(j)
      `);
      await knex.raw(`ANALYZE authors; ANALYZE books; ANALYZE comments; ANALYZE tags; ANALYZE authors_to_tags`);
    });

    // ---- Queries under test (three approaches) ----

    // 1. JOIN + DISTINCT: naive multi-JOIN
    const joinDistinctSQL = `
      SELECT DISTINCT a.id, a.first_name
      FROM authors a
      LEFT JOIN books b ON a.id = b.author_id
      LEFT JOIN comments c ON a.id = c.parent_author_id
      WHERE b.title LIKE ? AND c.text LIKE ?
      ORDER BY a.id
    `;

    // 2. LATERAL + BOOL_OR: previous approach
    const lateralSQL = `
      SELECT a.id, a.first_name
      FROM authors a
      CROSS JOIN LATERAL (
        SELECT BOOL_OR(b.title LIKE ?) AS has_match
        FROM books b WHERE b.author_id = a.id
      ) _books
      CROSS JOIN LATERAL (
        SELECT BOOL_OR(c.text LIKE ?) AS has_match
        FROM comments c WHERE c.parent_author_id = a.id
      ) _comments
      WHERE _books.has_match AND _comments.has_match
      ORDER BY a.id
    `;

    // 3. EXISTS: current approach
    const existsSQL = `
      SELECT a.id, a.first_name
      FROM authors a
      WHERE EXISTS (
        SELECT 1 FROM books b WHERE b.author_id = a.id AND b.title LIKE ?
      )
      AND EXISTS (
        SELECT 1 FROM comments c WHERE c.parent_author_id = a.id AND c.text LIKE ?
      )
      ORDER BY a.id
    `;

    // m2m variants
    const joinDistinctM2mSQL = `
      SELECT DISTINCT a.id, a.first_name
      FROM authors a
      LEFT JOIN authors_to_tags att ON a.id = att.author_id
      LEFT JOIN tags t ON att.tag_id = t.id
      LEFT JOIN books b ON a.id = b.author_id
      WHERE t.name = ? AND b.title LIKE ?
      ORDER BY a.id
    `;

    const lateralM2mSQL = `
      SELECT a.id, a.first_name
      FROM authors a
      CROSS JOIN LATERAL (
        SELECT BOOL_OR(t.name = ?) AS has_match
        FROM authors_to_tags att
        JOIN tags t ON att.tag_id = t.id
        WHERE att.author_id = a.id
      ) _tags
      CROSS JOIN LATERAL (
        SELECT BOOL_OR(b.title LIKE ?) AS has_match
        FROM books b WHERE b.author_id = a.id
      ) _books
      WHERE _tags.has_match AND _books.has_match
      ORDER BY a.id
    `;

    const existsM2mSQL = `
      SELECT a.id, a.first_name
      FROM authors a
      WHERE EXISTS (
        SELECT 1
        FROM authors_to_tags att
        JOIN tags t ON att.tag_id = t.id
        WHERE att.author_id = a.id AND t.name = ?
      )
      AND EXISTS (
        SELECT 1 FROM books b WHERE b.author_id = a.id AND b.title LIKE ?
      )
      ORDER BY a.id
    `;

    async function timeQuery(sql: string, bindings: any[], warmup = 3, iterations = 10): Promise<number[]> {
      for (let i = 0; i < warmup; i++) {
        await knex.raw(sql, bindings);
      }
      const times: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await knex.raw(sql, bindings);
        times.push(performance.now() - start);
      }
      return times;
    }

    function stats(times: number[]) {
      const sorted = [...times].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      return { median, mean, min, max };
    }

    function fmtStats(s: ReturnType<typeof stats>): string {
      return `median=${s.median.toFixed(1)}ms  mean=${s.mean.toFixed(1)}ms  min=${s.min.toFixed(1)}ms  max=${s.max.toFixed(1)}ms`;
    }

    // ---- Timing benchmarks ----

    it("o2m x o2m: broad match", async () => {
      const bindings = ["book_1_%", "comment_1_%"];

      const joinTimes = await timeQuery(joinDistinctSQL, bindings);
      const lateralTimes = await timeQuery(lateralSQL, bindings);
      const existsTimes = await timeQuery(existsSQL, bindings);
      const jS = stats(joinTimes);
      const lS = stats(lateralTimes);
      const eS = stats(existsTimes);

      console.log("\n=== o2m x o2m: Broad match ===");
      console.log(`  JOIN+DISTINCT:    ${fmtStats(jS)}`);
      console.log(`  LATERAL+BOOL_OR:  ${fmtStats(lS)}`);
      console.log(`  EXISTS:           ${fmtStats(eS)}`);
      console.log(`  EXISTS vs JOIN:    ${(jS.median / eS.median).toFixed(2)}x faster`);
      console.log(`  EXISTS vs LATERAL: ${(lS.median / eS.median).toFixed(2)}x faster`);

      expect(eS.median).toBeLessThan(jS.median * 1.5);
    });

    it("o2m x o2m: selective match", async () => {
      const bindings = ["book_500_%", "comment_500_%"];

      const joinTimes = await timeQuery(joinDistinctSQL, bindings);
      const lateralTimes = await timeQuery(lateralSQL, bindings);
      const existsTimes = await timeQuery(existsSQL, bindings);
      const jS = stats(joinTimes);
      const lS = stats(lateralTimes);
      const eS = stats(existsTimes);

      console.log("\n=== o2m x o2m: Selective match ===");
      console.log(`  JOIN+DISTINCT:    ${fmtStats(jS)}`);
      console.log(`  LATERAL+BOOL_OR:  ${fmtStats(lS)}`);
      console.log(`  EXISTS:           ${fmtStats(eS)}`);
      console.log(`  EXISTS vs JOIN:    ${(jS.median / eS.median).toFixed(2)}x faster`);
      console.log(`  EXISTS vs LATERAL: ${(lS.median / eS.median).toFixed(2)}x faster`);
    });

    it("m2m + o2m", async () => {
      const bindings = ["tag_1", "book_%"];

      const joinTimes = await timeQuery(joinDistinctM2mSQL, bindings);
      const lateralTimes = await timeQuery(lateralM2mSQL, bindings);
      const existsTimes = await timeQuery(existsM2mSQL, bindings);
      const jS = stats(joinTimes);
      const lS = stats(lateralTimes);
      const eS = stats(existsTimes);

      console.log("\n=== m2m + o2m ===");
      console.log(`  JOIN+DISTINCT:    ${fmtStats(jS)}`);
      console.log(`  LATERAL+BOOL_OR:  ${fmtStats(lS)}`);
      console.log(`  EXISTS:           ${fmtStats(eS)}`);
      console.log(`  EXISTS vs JOIN:    ${(jS.median / eS.median).toFixed(2)}x faster`);
      console.log(`  EXISTS vs LATERAL: ${(lS.median / eS.median).toFixed(2)}x faster`);

      expect(eS.median).toBeLessThan(jS.median * 1.5);
    });

    // ---- EXPLAIN ANALYZE tests ----

    async function explainAnalyze(sql: string, bindings: any[]): Promise<any> {
      const { rows } = await knex.raw(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`, bindings);
      return rows[0]["QUERY PLAN"][0];
    }

    function extractPlanInfo(plan: any) {
      const root = plan["Plan"];
      const executionTime = plan["Execution Time"];
      const planningTime = plan["Planning Time"];

      function walkNodes(
        node: any,
        depth = 0,
      ): Array<{ type: string; actualRows: number; loops: number; depth: number }> {
        const result = [
          {
            type: node["Node Type"],
            actualRows: node["Actual Rows"],
            loops: node["Actual Loops"],
            depth,
          },
        ];
        for (const child of node["Plans"] ?? []) {
          result.push(...walkNodes(child, depth + 1));
        }
        return result;
      }

      const nodes = walkNodes(root);
      const totalActualRows = nodes.reduce((sum, n) => sum + n.actualRows * n.loops, 0);
      const hasSeqScan = nodes.some((n) => n.type === "Seq Scan");
      return { executionTime, planningTime, nodes, totalActualRows, hasSeqScan };
    }

    function fmtPlan(label: string, info: ReturnType<typeof extractPlanInfo>): string {
      return `${label} exec=${info.executionTime.toFixed(1)}ms  plan=${info.planningTime.toFixed(1)}ms  totalRows=${info.totalActualRows}`;
    }

    function logNodes(label: string, info: ReturnType<typeof extractPlanInfo>): void {
      console.log(`\n  ${label} nodes:`);
      for (const n of info.nodes) {
        console.log(`    ${"  ".repeat(n.depth)}${n.type}: rows=${n.actualRows} loops=${n.loops}`);
      }
    }

    it("EXPLAIN: broad match — three-way comparison", async () => {
      const bindings = ["book_1_%", "comment_1_%"];

      const joinPlan = await explainAnalyze(joinDistinctSQL, bindings);
      const lateralPlan = await explainAnalyze(lateralSQL, bindings);
      const existsPlan = await explainAnalyze(existsSQL, bindings);
      const jI = extractPlanInfo(joinPlan);
      const lI = extractPlanInfo(lateralPlan);
      const eI = extractPlanInfo(existsPlan);

      console.log("\n=== EXPLAIN: Broad match ===");
      console.log(`  ${fmtPlan("JOIN+DISTINCT:  ", jI)}`);
      console.log(`  ${fmtPlan("LATERAL+BOOL_OR:", lI)}`);
      console.log(`  ${fmtPlan("EXISTS:         ", eI)}`);
      logNodes("JOIN", jI);
      logNodes("LATERAL", lI);
      logNodes("EXISTS", eI);

      expect(eI.totalActualRows).toBeLessThan(jI.totalActualRows);
    });

    it("EXPLAIN: selective match — three-way comparison", async () => {
      const bindings = ["book_500_%", "comment_500_%"];

      const joinPlan = await explainAnalyze(joinDistinctSQL, bindings);
      const lateralPlan = await explainAnalyze(lateralSQL, bindings);
      const existsPlan = await explainAnalyze(existsSQL, bindings);
      const jI = extractPlanInfo(joinPlan);
      const lI = extractPlanInfo(lateralPlan);
      const eI = extractPlanInfo(existsPlan);

      console.log("\n=== EXPLAIN: Selective match ===");
      console.log(`  ${fmtPlan("JOIN+DISTINCT:  ", jI)}`);
      console.log(`  ${fmtPlan("LATERAL+BOOL_OR:", lI)}`);
      console.log(`  ${fmtPlan("EXISTS:         ", eI)}`);
      logNodes("JOIN", jI);
      logNodes("LATERAL", lI);
      logNodes("EXISTS", eI);

      console.log(`\n  Row ratio: EXISTS/JOIN = ${(eI.totalActualRows / jI.totalActualRows).toFixed(2)}x`);
      console.log(`  Row ratio: EXISTS/LATERAL = ${(eI.totalActualRows / lI.totalActualRows).toFixed(2)}x`);
    });

    it("EXPLAIN: broad predicates (match-all) — three-way comparison", async () => {
      const bindings = ["book_%", "comment_%"];

      const joinPlan = await explainAnalyze(joinDistinctSQL, bindings);
      const lateralPlan = await explainAnalyze(lateralSQL, bindings);
      const existsPlan = await explainAnalyze(existsSQL, bindings);
      const jI = extractPlanInfo(joinPlan);
      const lI = extractPlanInfo(lateralPlan);
      const eI = extractPlanInfo(existsPlan);

      console.log("\n=== EXPLAIN: Broad predicates (match-all) ===");
      console.log(`  ${fmtPlan("JOIN+DISTINCT:  ", jI)}`);
      console.log(`  ${fmtPlan("LATERAL+BOOL_OR:", lI)}`);
      console.log(`  ${fmtPlan("EXISTS:         ", eI)}`);
      logNodes("JOIN", jI);
      logNodes("LATERAL", lI);
      logNodes("EXISTS", eI);

      expect(eI.executionTime).toBeLessThan(jI.executionTime * 3);
    });
  });
});

function addCondition(query: ParsedFindQuery, condition: ParsedExpressionCondition): void {
  query.condition ??= { kind: "exp", op: "and", conditions: [] };
  query.condition.conditions.push(condition);
}

function failTest(message: string): never {
  throw new Error(message);
}
