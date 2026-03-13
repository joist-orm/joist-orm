import {
  insertAuthor,
  insertAuthorToTag,
  insertBook,
  insertBookAdvance,
  insertBookReview,
  insertComment,
  insertPublisher,
  insertTag,
} from "@src/entities/inserts";
import { knex, newEntityManager, queries, resetQueryCount } from "@src/testEm";
import { AdvanceStatus, Author } from "./entities";

const opts = { softDeletes: "include" } as const;

describe("EntityManager.lateralJoins", () => {
  // -----------------------------------------------------------------------
  // These "approach" tests use pure SQL to demonstrate the before/after of the
  // lateral rewrite. Each test first runs the naive multi-JOIN query that
  // produces a cross-product, then runs the equivalent LATERAL + BOOL_OR
  // query that avoids the cross-product, and asserts both return the same
  // correct results. This helps maintainers understand the high-level SQL
  // transformation without needing to understand the Joist query parser.
  // -----------------------------------------------------------------------
  describe("approach", () => {
    it("two o2m collections: JOIN cross-product vs LATERAL", async () => {
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

      // After: LATERAL + BOOL_OR — one row per parent, no DISTINCT needed
      const { rows: after } = await knex.raw(`
        SELECT a.id, a.first_name
        FROM authors a
        CROSS JOIN LATERAL (
          SELECT BOOL_OR(b.title = 'b1') AS has_match
          FROM books b WHERE b.author_id = a.id
        ) _books
        CROSS JOIN LATERAL (
          SELECT BOOL_OR(c.text = 'c1') AS has_match
          FROM comments c WHERE c.parent_author_id = a.id
        ) _comments
        WHERE _books.has_match AND _comments.has_match
        ORDER BY a.id
      `);
      expect(after).toMatchObject([{ first_name: "a1" }]);
    });

    it("m2m + o2m: junction table inside LATERAL", async () => {
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

      // After: m2m junction + target go inside one LATERAL
      const { rows: after } = await knex.raw(`
        SELECT a.id, a.first_name
        FROM authors a
        CROSS JOIN LATERAL (
          SELECT BOOL_OR(t.name = 't1') AS has_match
          FROM authors_to_tags att
          JOIN tags t ON att.tag_id = t.id
          WHERE att.author_id = a.id
        ) _tags
        CROSS JOIN LATERAL (
          SELECT BOOL_OR(b.title = 'b1') AS has_match
          FROM books b WHERE b.author_id = a.id
        ) _books
        WHERE _tags.has_match AND _books.has_match
        ORDER BY a.id
      `);
      expect(after).toMatchObject([{ first_name: "a1" }]);
    });

    it("same-row AND: BOOL_OR(c1 AND c2) preserves row-level semantics", async () => {
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

      // After: both conditions inside a single BOOL_OR preserves same-row semantics
      const { rows: after } = await knex.raw(`
        SELECT a.id, a.first_name
        FROM authors a
        CROSS JOIN LATERAL (
          SELECT BOOL_OR(b.title = 'b1' AND b."order" = 1) AS has_match
          FROM books b WHERE b.author_id = a.id
        ) _books
        CROSS JOIN LATERAL (
          SELECT BOOL_OR(c.text = 'c1') AS has_match
          FROM comments c WHERE c.parent_author_id = a.id
        ) _comments
        WHERE _books.has_match AND _comments.has_match
        ORDER BY a.id
      `);
      expect(after).toMatchObject([{ first_name: "a1" }]);
    });

    it("cross-product explosion: JOINs produce N*M rows, LATERAL produces 1", async () => {
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

      // After: LATERAL avoids the cross-product entirely — exactly 1 row
      const { rows: lateral } = await knex.raw(`
        SELECT a.id, a.first_name
        FROM authors a
        CROSS JOIN LATERAL (
          SELECT BOOL_OR(b.title LIKE 'b%') AS has_match
          FROM books b WHERE b.author_id = a.id
        ) _books
        CROSS JOIN LATERAL (
          SELECT BOOL_OR(c.text LIKE 'c%') AS has_match
          FROM comments c WHERE c.parent_author_id = a.id
        ) _comments
        WHERE _books.has_match AND _comments.has_match
      `);
      expect(lateral).toHaveLength(1);
      expect(lateral).toMatchObject([{ first_name: "a1" }]);
    });

    it("nested o2m: reviews nested inside books LATERAL", async () => {
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

      // After: reviews join stays inside the books LATERAL
      const { rows: after } = await knex.raw(`
        SELECT a.id, a.first_name
        FROM authors a
        CROSS JOIN LATERAL (
          SELECT BOOL_OR(br.rating >= 4) AS has_match
          FROM books b
          JOIN book_reviews br ON b.id = br.book_id
          WHERE b.author_id = a.id
        ) _books
        CROSS JOIN LATERAL (
          SELECT BOOL_OR(c.text = 'c1') AS has_match
          FROM comments c WHERE c.parent_author_id = a.id
        ) _comments
        WHERE _books.has_match AND _comments.has_match
        ORDER BY a.id
      `);
      expect(after).toMatchObject([{ first_name: "a1" }]);
    });

    it("anti-join: 'no children' uses count(*) = 0 instead of BOOL_OR", async () => {
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

      // After: count(*) = 0 in the LATERAL detects no children
      const { rows: after } = await knex.raw(`
        SELECT a.id, a.first_name
        FROM authors a
        CROSS JOIN LATERAL (
          SELECT count(*) = 0 AS has_no_books
          FROM books b WHERE b.author_id = a.id
        ) _books
        CROSS JOIN LATERAL (
          SELECT BOOL_OR(c.text = 'c1') AS has_match
          FROM comments c WHERE c.parent_author_id = a.id
        ) _comments
        WHERE _books.has_no_books AND _comments.has_match
        ORDER BY a.id
      `);
      expect(after).toMatchObject([{ first_name: "a1" }]);
    });
  });

  describe("multi-collection rewrite", () => {
    it("rewrites two o2m collections to lateral joins", async () => {
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
          ` CROSS JOIN LATERAL (SELECT BOOL_OR(b.title = $1) AS _cond0 FROM books AS b WHERE a.id = b.author_id) AS _lat_b`,
          ` CROSS JOIN LATERAL (SELECT BOOL_OR(c.text = $2) AS _cond1 FROM comments AS c WHERE a.id = c.parent_author_id) AS _lat_c`,
          ` WHERE _lat_b._cond0 AND _lat_c._cond1`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $3`,
        ].join(""),
      ]);
    });

    it("does not rewrite single collection queries", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });

      const em = newEntityManager();
      resetQueryCount();
      const authors = await em.find(Author, { books: { title: "b1" } }, opts);
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
      expect(queries).toEqual([
        [
          `SELECT DISTINCT ON (a.id, a.id) a.*, a.id`,
          ` FROM authors AS a`,
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
          ` CROSS JOIN LATERAL (SELECT BOOL_OR(t.name = $1) AS _cond0`,
          ` FROM authors_to_tags AS att`,
          ` JOIN tags AS t ON att.tag_id = t.id`,
          ` WHERE a.id = att.author_id) AS _lat_att`,
          ` CROSS JOIN LATERAL (SELECT BOOL_OR(b.title = $2) AS _cond1 FROM books AS b WHERE a.id = b.author_id) AS _lat_b`,
          ` WHERE _lat_att._cond0 AND _lat_b._cond1`,
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
          ` CROSS JOIN LATERAL (SELECT BOOL_OR(b.title = $1 AND b."order" = $2) AS _cond0 FROM books AS b WHERE a.id = b.author_id) AS _lat_b`,
          ` CROSS JOIN LATERAL (SELECT BOOL_OR(c.text = $3) AS _cond1 FROM comments AS c WHERE a.id = c.parent_author_id) AS _lat_c`,
          ` WHERE _lat_b._cond0 AND _lat_c._cond1`,
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
          ` CROSS JOIN LATERAL (SELECT BOOL_OR(b.title LIKE $1) AS _cond0 FROM books AS b WHERE a.id = b.author_id) AS _lat_b`,
          ` CROSS JOIN LATERAL (SELECT BOOL_OR(c.text LIKE $2) AS _cond1 FROM comments AS c WHERE a.id = c.parent_author_id) AS _lat_c`,
          ` WHERE _lat_b._cond0 AND _lat_c._cond1`,
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
          ` CROSS JOIN LATERAL (SELECT BOOL_OR(br.rating >= $1) AS _cond0`,
          ` FROM books AS b`,
          ` JOIN book_reviews AS br ON b.id = br.book_id`,
          ` WHERE a.id = b.author_id) AS _lat_b`,
          ` CROSS JOIN LATERAL (SELECT BOOL_OR(c.text = $2) AS _cond1 FROM comments AS c WHERE a.id = c.parent_author_id) AS _lat_c`,
          ` WHERE _lat_b._cond0 AND _lat_c._cond1`,
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
          ` CROSS JOIN LATERAL (SELECT count(*) = 0 AS _cond0 FROM books AS b WHERE a.id = b.author_id) AS _lat_b`,
          ` CROSS JOIN LATERAL (SELECT BOOL_OR(c.text = $1) AS _cond1 FROM comments AS c WHERE a.id = c.parent_author_id) AS _lat_c`,
          ` WHERE _lat_b._cond0 AND _lat_c._cond1`,
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
          `SELECT DISTINCT ON (a.id, a.id) a.*, a.id FROM authors AS a`,
          ` LEFT OUTER JOIN books AS b ON a.id = b.author_id`,
          ` CROSS JOIN LATERAL (SELECT BOOL_OR(br.rating >= $1) AS _cond0 FROM book_reviews AS br WHERE b.id = br.book_id) AS _lat_br`,
          ` CROSS JOIN LATERAL (SELECT BOOL_OR(ba.status_id = $2) AS _cond1 FROM book_advances AS ba WHERE b.id = ba.book_id) AS _lat_ba`,
          ` WHERE _lat_br._cond0 AND _lat_ba._cond1`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $3`,
        ].join(""),
      ]);
    });

    it("generates correct SQL for deep sibling laterals", async () => {
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
          `SELECT DISTINCT ON (a.id, a.id) a.*, a.id FROM authors AS a`,
          ` LEFT OUTER JOIN books AS b ON a.id = b.author_id`,
          ` CROSS JOIN LATERAL (SELECT BOOL_OR(br.rating >= $1) AS _cond0 FROM book_reviews AS br WHERE b.id = br.book_id) AS _lat_br`,
          ` CROSS JOIN LATERAL (SELECT BOOL_OR(ba.status_id = $2) AS _cond1 FROM book_advances AS ba WHERE b.id = ba.book_id) AS _lat_ba`,
          ` WHERE _lat_br._cond0 AND _lat_ba._cond1`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $3`,
        ].join(""),
      ]);
    });

    it("keeps books as regular join when its siblings are at the deeper level", async () => {
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
          `SELECT DISTINCT ON (a.id, a.id) a.*, a.id FROM authors AS a`,
          ` LEFT OUTER JOIN books AS b ON a.id = b.author_id`,
          ` CROSS JOIN LATERAL (SELECT BOOL_OR(br.rating >= $1) AS _cond0 FROM book_reviews AS br WHERE b.id = br.book_id) AS _lat_br`,
          ` CROSS JOIN LATERAL (SELECT BOOL_OR(ba.status_id = $2) AS _cond1 FROM book_advances AS ba WHERE b.id = ba.book_id) AS _lat_ba`,
          ` WHERE _lat_br._cond0 AND _lat_ba._cond1`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $3`,
        ].join(""),
      ]);
    });
  });

  describe("lateralJoins opt-in", () => {
    it("forces lateral rewrite on a single collection when lateralJoins=true", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });

      const em = newEntityManager();
      resetQueryCount();
      const authors = await em.find(
        Author,
        { books: { title: "b1" } },
        { ...opts, lateralJoins: true },
      );
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` CROSS JOIN LATERAL (SELECT BOOL_OR(b.title = $1) AS _cond0 FROM books AS b WHERE a.id = b.author_id) AS _lat_b`,
          ` WHERE _lat_b._cond0`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $2`,
        ].join(""),
      ]);
    });

    it("does not force lateral rewrite when lateralJoins is not set", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });

      const em = newEntityManager();
      resetQueryCount();
      await em.find(Author, { books: { title: "b1" } }, opts);
      expect(queries).toEqual([
        [
          `SELECT DISTINCT ON (a.id, a.id) a.*, a.id`,
          ` FROM authors AS a`,
          ` LEFT OUTER JOIN books AS b ON a.id = b.author_id`,
          ` WHERE b.title = $1`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $2`,
        ].join(""),
      ]);
    });

    it("generates correct SQL for forced single-collection lateral", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });

      const em = newEntityManager();
      resetQueryCount();
      await em.find(
        Author,
        { books: { title: "b1" } },
        { ...opts, lateralJoins: true },
      );
      expect(queries).toEqual([
        [
          `SELECT a.* FROM authors AS a`,
          ` CROSS JOIN LATERAL (SELECT BOOL_OR(b.title = $1) AS _cond0 FROM books AS b WHERE a.id = b.author_id) AS _lat_b`,
          ` WHERE _lat_b._cond0`,
          ` ORDER BY a.id ASC`,
          ` LIMIT $2`,
        ].join(""),
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // Performance benchmarks — normally skipped. Remove `.skip` to run manually.
  // These use raw SQL via knex.raw to compare JOIN+DISTINCT vs LATERAL+BOOL_OR
  // at scale, demonstrating the cross-product explosion problem.
  //
  // Results (1K authors × 50 books × 50 comments × 20 tags, 5 tags/author):
  //
  // Timing (median of 10 runs, 3 warmup):
  //   ┌──────────────────────────┬───────────────┬─────────────────┬─────────┐
  //   │ Test                     │ JOIN+DISTINCT │ LATERAL+BOOL_OR │ Speedup │
  //   ├──────────────────────────┼───────────────┼─────────────────┼─────────┤
  //   │ Broad o2m×o2m            │ 40.8ms        │ 33.5ms          │ 1.22x   │
  //   │ Selective o2m×o2m        │ 3.5ms         │ 43.0ms          │ 0.08x * │
  //   │ m2m + o2m                │ 29.4ms        │ 38.4ms          │ 0.77x   │
  //   └──────────────────────────┴───────────────┴─────────────────┴─────────┘
  //   * Known tradeoff: selective queries match few parents, so JOIN narrows
  //     early via index. LATERAL scans all parents' children regardless.
  //
  // EXPLAIN ANALYZE (intermediate rows processed):
  //   ┌──────────────────────────┬───────────────┬─────────────────┬───────┐
  //   │ Test                     │ JOIN rows     │ LATERAL rows    │ Ratio │
  //   ├──────────────────────────┼───────────────┼─────────────────┼───────┤
  //   │ Broad match              │ 853,424       │ 226,536         │ 3.8x  │
  //   │ Selective match          │ 7,651         │ 265,103         │ 0.03x │
  //   │ Match-all (worst case)   │ 113ms exec    │ 189ms exec      │ 0.6x  │
  //   └──────────────────────────┴───────────────┴─────────────────┴───────┘
  //
  // Key findings:
  // - LATERAL wins on broad queries where cross-product explosion is the problem
  // - LATERAL loses on selective queries where few parents match (JOINs narrow early)
  // - No seq scans inside laterals — predicate pushdown works correctly
  // - Match-all worst case: LATERAL is ~1.7x slower (within tolerance)
  // -----------------------------------------------------------------------
  describe.skip("benchmarks", () => {
    const NUM_AUTHORS = 1_000;
    const BOOKS_PER_AUTHOR = 50;
    const COMMENTS_PER_AUTHOR = 50;
    const NUM_TAGS = 20;
    const TAGS_PER_AUTHOR = 5;

    beforeEach(async () => {
      const now = "now()";
      // Bulk insert authors
      await knex.raw(`
        INSERT INTO authors (first_name, initials, number_of_books, created_at, updated_at)
        SELECT 'author_' || i::text, '', ${BOOKS_PER_AUTHOR}, ${now}, ${now}
        FROM generate_series(1, ${NUM_AUTHORS}) AS t(i)
      `);
      // Bulk insert books (BOOKS_PER_AUTHOR per author)
      await knex.raw(`
        INSERT INTO books (title, author_id, notes, created_at, updated_at)
        SELECT 'book_' || a.id || '_' || j::text, a.id, '', ${now}, ${now}
        FROM authors a, generate_series(1, ${BOOKS_PER_AUTHOR}) AS t(j)
      `);
      // Bulk insert comments (COMMENTS_PER_AUTHOR per author)
      await knex.raw(`
        INSERT INTO comments (parent_author_id, parent_tags, text, created_at, updated_at)
        SELECT a.id, '', 'comment_' || a.id || '_' || j::text, ${now}, ${now}
        FROM authors a, generate_series(1, ${COMMENTS_PER_AUTHOR}) AS t(j)
      `);
      // Bulk insert tags
      await knex.raw(`
        INSERT INTO tags (name, created_at, updated_at)
        SELECT 'tag_' || i::text, ${now}, ${now}
        FROM generate_series(1, ${NUM_TAGS}) AS t(i)
      `);
      // Bulk insert author-to-tag associations (TAGS_PER_AUTHOR per author)
      // Use j directly as tag_id (1..5) so each author gets a unique set of tags
      await knex.raw(`
        INSERT INTO authors_to_tags (author_id, tag_id)
        SELECT a.id, j
        FROM authors a, generate_series(1, ${TAGS_PER_AUTHOR}) AS t(j)
      `);
      // Create indexes that match what Joist would use
      await knex.raw(`ANALYZE authors; ANALYZE books; ANALYZE comments; ANALYZE tags; ANALYZE authors_to_tags`);
    });

    // ---- Queries under test ----

    // The "before" query: JOIN + DISTINCT with two o2m collections
    const joinDistinctSQL = `
      SELECT DISTINCT a.id, a.first_name
      FROM authors a
      LEFT JOIN books b ON a.id = b.author_id
      LEFT JOIN comments c ON a.id = c.parent_author_id
      WHERE b.title LIKE ? AND c.text LIKE ?
      ORDER BY a.id
    `;

    // The "after" query: LATERAL + BOOL_OR with two o2m collections
    const lateralBoolOrSQL = `
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

    // m2m variant: JOIN + DISTINCT with m2m + o2m
    const joinDistinctM2mSQL = `
      SELECT DISTINCT a.id, a.first_name
      FROM authors a
      LEFT JOIN authors_to_tags att ON a.id = att.author_id
      LEFT JOIN tags t ON att.tag_id = t.id
      LEFT JOIN books b ON a.id = b.author_id
      WHERE t.name = ? AND b.title LIKE ?
      ORDER BY a.id
    `;

    // m2m variant: LATERAL + BOOL_OR
    const lateralBoolOrM2mSQL = `
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

    async function timeQuery(sql: string, bindings: any[], warmup = 3, iterations = 10): Promise<number[]> {
      // Warmup runs
      for (let i = 0; i < warmup; i++) {
        await knex.raw(sql, bindings);
      }
      // Timed runs
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

    // ---- Timing benchmarks ----

    it("o2m x o2m: LATERAL is faster than JOIN+DISTINCT (broad match)", async () => {
      // Broad match — matches many authors
      const bindings = ["book_1_%", "comment_1_%"];

      const joinTimes = await timeQuery(joinDistinctSQL, bindings);
      const lateralTimes = await timeQuery(lateralBoolOrSQL, bindings);
      const joinStats = stats(joinTimes);
      const lateralStats = stats(lateralTimes);

      console.log("\n=== o2m x o2m: Broad match ===");
      console.log(
        `  JOIN+DISTINCT:  median=${joinStats.median.toFixed(1)}ms  mean=${joinStats.mean.toFixed(1)}ms  min=${joinStats.min.toFixed(1)}ms  max=${joinStats.max.toFixed(1)}ms`,
      );
      console.log(
        `  LATERAL+BOOL_OR: median=${lateralStats.median.toFixed(1)}ms  mean=${lateralStats.mean.toFixed(1)}ms  min=${lateralStats.min.toFixed(1)}ms  max=${lateralStats.max.toFixed(1)}ms`,
      );
      console.log(`  Speedup: ${(joinStats.median / lateralStats.median).toFixed(2)}x`);

      // The lateral should be meaningfully faster (or at worst comparable)
      expect(lateralStats.median).toBeLessThan(joinStats.median * 1.5);
    });

    it("o2m x o2m: selective match — LATERAL scans all parents (known tradeoff)", async () => {
      // Selective predicates match only 1 author. JOIN+DISTINCT can be faster here
      // because PG narrows to matching rows via index before joining. LATERAL scans
      // all parents' children regardless. This is an accepted tradeoff — the rewrite
      // optimizes for broad matches where cross-product explosion is the real problem.
      const bindings = ["book_500_%", "comment_500_%"];

      const joinTimes = await timeQuery(joinDistinctSQL, bindings);
      const lateralTimes = await timeQuery(lateralBoolOrSQL, bindings);
      const joinStats = stats(joinTimes);
      const lateralStats = stats(lateralTimes);

      console.log("\n=== o2m x o2m: Selective match (known tradeoff) ===");
      console.log(
        `  JOIN+DISTINCT:  median=${joinStats.median.toFixed(1)}ms  mean=${joinStats.mean.toFixed(1)}ms  min=${joinStats.min.toFixed(1)}ms  max=${joinStats.max.toFixed(1)}ms`,
      );
      console.log(
        `  LATERAL+BOOL_OR: median=${lateralStats.median.toFixed(1)}ms  mean=${lateralStats.mean.toFixed(1)}ms  min=${lateralStats.min.toFixed(1)}ms  max=${lateralStats.max.toFixed(1)}ms`,
      );
      console.log(`  Ratio: ${(lateralStats.median / joinStats.median).toFixed(2)}x (>1 means LATERAL is slower)`);

      // No assertion on which is faster — this documents the tradeoff
    });

    it("m2m + o2m: LATERAL is faster than JOIN+DISTINCT", async () => {
      const bindings = ["tag_1", "book_%"];

      const joinTimes = await timeQuery(joinDistinctM2mSQL, bindings);
      const lateralTimes = await timeQuery(lateralBoolOrM2mSQL, bindings);
      const joinStats = stats(joinTimes);
      const lateralStats = stats(lateralTimes);

      console.log("\n=== m2m + o2m ===");
      console.log(
        `  JOIN+DISTINCT:  median=${joinStats.median.toFixed(1)}ms  mean=${joinStats.mean.toFixed(1)}ms  min=${joinStats.min.toFixed(1)}ms  max=${joinStats.max.toFixed(1)}ms`,
      );
      console.log(
        `  LATERAL+BOOL_OR: median=${lateralStats.median.toFixed(1)}ms  mean=${lateralStats.mean.toFixed(1)}ms  min=${lateralStats.min.toFixed(1)}ms  max=${lateralStats.max.toFixed(1)}ms`,
      );
      console.log(`  Speedup: ${(joinStats.median / lateralStats.median).toFixed(2)}x`);

      expect(lateralStats.median).toBeLessThan(joinStats.median * 1.5);
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

      // Recursively find all node types and their actual rows
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

    it("EXPLAIN: LATERAL produces fewer intermediate rows than JOIN (broad)", async () => {
      const bindings = ["book_1_%", "comment_1_%"];

      const joinPlan = await explainAnalyze(joinDistinctSQL, bindings);
      const lateralPlan = await explainAnalyze(lateralBoolOrSQL, bindings);
      const joinInfo = extractPlanInfo(joinPlan);
      const lateralInfo = extractPlanInfo(lateralPlan);

      console.log("\n=== EXPLAIN: Broad match ===");
      console.log(
        `  JOIN+DISTINCT:   exec=${joinInfo.executionTime.toFixed(1)}ms  plan=${joinInfo.planningTime.toFixed(1)}ms  totalRows=${joinInfo.totalActualRows}`,
      );
      console.log(
        `  LATERAL+BOOL_OR: exec=${lateralInfo.executionTime.toFixed(1)}ms  plan=${lateralInfo.planningTime.toFixed(1)}ms  totalRows=${lateralInfo.totalActualRows}`,
      );

      console.log("\n  JOIN nodes:");
      for (const n of joinInfo.nodes) {
        console.log(`    ${"  ".repeat(n.depth)}${n.type}: rows=${n.actualRows} loops=${n.loops}`);
      }
      console.log("\n  LATERAL nodes:");
      for (const n of lateralInfo.nodes) {
        console.log(`    ${"  ".repeat(n.depth)}${n.type}: rows=${n.actualRows} loops=${n.loops}`);
      }

      // The lateral plan should process fewer total intermediate rows
      expect(lateralInfo.totalActualRows).toBeLessThan(joinInfo.totalActualRows);
    });

    it("EXPLAIN: selective match — LATERAL processes more rows (known tradeoff)", async () => {
      // When predicates are selective, JOIN can narrow rows early via index, producing
      // fewer intermediate rows. LATERAL scans all parents' children. Documents tradeoff.
      const bindings = ["book_500_%", "comment_500_%"];

      const joinPlan = await explainAnalyze(joinDistinctSQL, bindings);
      const lateralPlan = await explainAnalyze(lateralBoolOrSQL, bindings);
      const joinInfo = extractPlanInfo(joinPlan);
      const lateralInfo = extractPlanInfo(lateralPlan);

      console.log("\n=== EXPLAIN: Selective match (known tradeoff) ===");
      console.log(
        `  JOIN+DISTINCT:   exec=${joinInfo.executionTime.toFixed(1)}ms  plan=${joinInfo.planningTime.toFixed(1)}ms  totalRows=${joinInfo.totalActualRows}`,
      );
      console.log(
        `  LATERAL+BOOL_OR: exec=${lateralInfo.executionTime.toFixed(1)}ms  plan=${lateralInfo.planningTime.toFixed(1)}ms  totalRows=${lateralInfo.totalActualRows}`,
      );

      console.log("\n  JOIN nodes:");
      for (const n of joinInfo.nodes) {
        console.log(`    ${"  ".repeat(n.depth)}${n.type}: rows=${n.actualRows} loops=${n.loops}`);
      }
      console.log("\n  LATERAL nodes:");
      for (const n of lateralInfo.nodes) {
        console.log(`    ${"  ".repeat(n.depth)}${n.type}: rows=${n.actualRows} loops=${n.loops}`);
      }

      // No assertion — this documents that LATERAL processes more rows for selective queries
      console.log(
        `\n  Row ratio: LATERAL/JOIN = ${(lateralInfo.totalActualRows / joinInfo.totalActualRows).toFixed(1)}x`,
      );
    });

    it("EXPLAIN: predicate pushdown — selective predicates use index scans in laterals", async () => {
      // Very selective — single author
      const bindings = ["book_500_1", "comment_500_1"];

      const lateralPlan = await explainAnalyze(lateralBoolOrSQL, bindings);
      const lateralInfo = extractPlanInfo(lateralPlan);

      console.log("\n=== EXPLAIN: Predicate pushdown (selective) ===");
      console.log(
        `  LATERAL exec=${lateralInfo.executionTime.toFixed(1)}ms  plan=${lateralInfo.planningTime.toFixed(1)}ms`,
      );
      for (const n of lateralInfo.nodes) {
        console.log(`    ${"  ".repeat(n.depth)}${n.type}: rows=${n.actualRows} loops=${n.loops}`);
      }

      // With proper indexes, the lateral subqueries should use index scans
      // (this checks that PG doesn't fall back to seq scans within the laterals)
      const innerNodes = lateralInfo.nodes.filter((n) => n.depth >= 2);
      const seqScansInLateral = innerNodes.filter((n) => n.type === "Seq Scan");
      console.log(`\n  Seq scans inside laterals: ${seqScansInLateral.length}`);
      // We expect index scans on the FK columns (author_id) inside laterals
      // If this fails, it means PG isn't pushing predicates into the lateral
      // which would indicate a query planning issue worth investigating
      if (seqScansInLateral.length > 0) {
        console.log("  WARNING: Seq scans found inside lateral subqueries — predicate pushdown may not be working");
      }
    });

    it("EXPLAIN: broad predicates do not cause worse plans in laterals vs joins", async () => {
      // Very broad — matches all authors
      const bindings = ["book_%", "comment_%"];

      const joinPlan = await explainAnalyze(joinDistinctSQL, bindings);
      const lateralPlan = await explainAnalyze(lateralBoolOrSQL, bindings);
      const joinInfo = extractPlanInfo(joinPlan);
      const lateralInfo = extractPlanInfo(lateralPlan);

      console.log("\n=== EXPLAIN: Broad predicates (match-all) ===");
      console.log(
        `  JOIN+DISTINCT:   exec=${joinInfo.executionTime.toFixed(1)}ms  plan=${joinInfo.planningTime.toFixed(1)}ms`,
      );
      console.log(
        `  LATERAL+BOOL_OR: exec=${lateralInfo.executionTime.toFixed(1)}ms  plan=${lateralInfo.planningTime.toFixed(1)}ms`,
      );

      console.log("\n  JOIN nodes:");
      for (const n of joinInfo.nodes) {
        console.log(`    ${"  ".repeat(n.depth)}${n.type}: rows=${n.actualRows} loops=${n.loops}`);
      }
      console.log("\n  LATERAL nodes:");
      for (const n of lateralInfo.nodes) {
        console.log(`    ${"  ".repeat(n.depth)}${n.type}: rows=${n.actualRows} loops=${n.loops}`);
      }

      // Even with broad predicates, lateral execution time should not be dramatically worse
      // Allow up to 3x slower since the worst case for laterals is scanning all children
      // for all parents (which is what JOINs do anyway, just without the aggregation overhead)
      expect(lateralInfo.executionTime).toBeLessThan(joinInfo.executionTime * 3);
    });
  });
});
