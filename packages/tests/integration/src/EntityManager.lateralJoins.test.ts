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
          ` WHERE EXISTS (SELECT 1 FROM authors_to_tags AS att JOIN tags AS t ON att.tag_id = t.id WHERE a.id = att.author_id AND t.name = $1)`,
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
          ` JOIN book_reviews AS br ON b.id = br.book_id`,
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
          `SELECT a.* FROM authors AS a`,
          ` WHERE EXISTS (SELECT 1 FROM books AS b`,
          ` JOIN book_reviews AS br ON b.id = br.book_id`,
          ` JOIN book_advances AS ba ON b.id = ba.book_id`,
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
          ` JOIN book_reviews AS br ON b.id = br.book_id`,
          ` JOIN book_advances AS ba ON b.id = ba.book_id`,
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
          ` JOIN book_reviews AS br ON b.id = br.book_id`,
          ` JOIN book_advances AS ba ON b.id = ba.book_id`,
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
