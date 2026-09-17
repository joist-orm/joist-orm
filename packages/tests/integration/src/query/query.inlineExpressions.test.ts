import { expectTypeOf } from "expect-type";
import { type Query, type ScalarQuery, expr, query, table, tables } from "joist-orm";
import { Author, Book } from "src/entities";
import { insertAuthor, insertBook } from "src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("em.query / inline expressions", () => {
  describe("select", () => {
    it("selects a scalar CASE without mistaking case for a projection key", async () => {
      // Given an adult Author
      await insertAuthor({ first_name: "Alice", age: 30 });
      // And an Author whose age is unknown
      await insertAuthor({ first_name: "Bob" });
      // And an Author table with fixture SQL excluded from the snapshot
      const em = newEntityManager();
      const a = table(Author);
      resetQueryCount();

      // When a CASE array is the entire select
      const rows = await em.query({
        from: a,
        select: { case: [{ when: a.age.gte(18), then: a.first_name }, { else: "Unknown" }] },
        orderBy: [{ asc: a.id }],
      });

      // Then each row is the chosen name, not an object with a case property
      expect(rows).toEqual(["Alice", "Unknown"]);
      expectTypeOf(rows).toEqualTypeOf<string[]>();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT (CASE WHEN (a.age >= $1) THEN a.first_name ELSE $2::varchar END) AS value FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY a.id ASC",
       ]
      `);
    });

    it("selects a scalar COALESCE without an expr wrapper", async () => {
      // Given an Author without a last name
      await insertAuthor({ first_name: "Alice" });
      // And an Author with a last name
      await insertAuthor({ first_name: "Bob", last_name: "Brown" });
      // And an Author table with fixture SQL excluded from the snapshot
      const em = newEntityManager();
      const a = table(Author);
      resetQueryCount();

      // When selecting the first available Author name directly
      const rows = await em.query({
        from: a,
        select: { coalesce: [a.last_name, a.first_name] },
        orderBy: [{ asc: a.id }],
      });

      // Then each row is a string, just as with an explicitly built scalar expression
      expect(rows).toEqual(["Alice", "Brown"]);
      expectTypeOf(rows).toEqualTypeOf<string[]>();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT COALESCE(a.last_name, a.first_name) AS value FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY a.id ASC",
       ]
      `);
    });

    it("mixes named inline expressions with columns and reusable expressions", async () => {
      // Given an Author with an empty last name and a known age
      await insertAuthor({ first_name: "Alice", last_name: "", age: 30 });
      // And a dynamic list of name candidates
      const em = newEntityManager();
      const a = table(Author);
      const candidates = [a.last_name];
      // And a reusable expression whose comparison method selects Alice
      const name = expr({ coalesce: [{ nullIf: [a.last_name, ""] }, a.first_name] });
      resetQueryCount();

      // When selecting nested CASE, COALESCE, NULLIF, GREATEST, and LEAST objects
      const rows = await em.query({
        from: a,
        where: name.eq("Alice"),
        select: {
          firstName: a.first_name,
          name,
          inlineName: { coalesce: [...candidates.map((candidate) => ({ nullIf: [candidate, ""] })), a.first_name] },
          category: { case: [{ when: a.age.gte(18), then: "Adult" }, { else: "Child" }] },
          age: { least: [{ greatest: [a.age, 18] }, 65] },
        },
        orderBy: { inlineName: "ASC" },
      });

      // Then inline and reusable expressions preserve their values and inferred types
      expect(rows).toEqual([{ firstName: "Alice", name: "Alice", inlineName: "Alice", category: "Adult", age: 30 }]);
      expectTypeOf(rows).toEqualTypeOf<
        { firstName: string; name: string; inlineName: string; category: string; age: number }[]
      >();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS "firstName", COALESCE(NULLIF(a.last_name, $1::varchar), a.first_name) AS name, COALESCE(NULLIF(a.last_name, $2::varchar), a.first_name) AS "inlineName", (CASE WHEN (a.age >= $3) THEN $4::text ELSE $5::text END) AS category, LEAST(GREATEST(a.age, $6::int4), $7::int4) AS age FROM authors AS a WHERE COALESCE(NULLIF(a.last_name, $8::varchar), a.first_name) = $9 AND a.deleted_at IS NULL ORDER BY "inlineName" ASC",
       ]
      `);
    });

    it("preserves LEFT-join nullability and tagged Book id fallbacks", async () => {
      // Given an Author without Books
      await insertAuthor({ first_name: "Alice" });
      // And a LEFT-joined Book table
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      resetQueryCount();

      // When selecting absent Book values and inline fallbacks
      const rows = await em.query({
        from: a,
        join: [a.books.as(b)],
        select: {
          title: { coalesce: [b.title] },
          name: { coalesce: [b.title, a.first_name] },
          bookId: { coalesce: [b.id, "b:9"] },
          missingId: { case: { when: b.id.ne(null), then: b.id } },
        },
      });

      // Then missing Books add null only where no non-null fallback exists
      expect(rows).toEqual([{ title: null, name: "Alice", bookId: "b:9", missingId: null }]);
      expectTypeOf(rows).toEqualTypeOf<
        { title: string | null; name: string; bookId: Book["id"]; missingId: Book["id"] | null }[]
      >();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT COALESCE(b.title) AS title, COALESCE(b.title, a.first_name) AS name, COALESCE(b.id, $1::int4) AS "bookId", (CASE WHEN (b.id IS NOT NULL) THEN b.id END) AS "missingId" FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE a.deleted_at IS NULL",
       ]
      `);
    });

    it("keeps expression keywords available as named projection keys", async () => {
      // Given an Author with no last name and an unknown age
      await insertAuthor({ first_name: "Alice" });
      // And an Author table with fixture SQL excluded from the snapshot
      const em = newEntityManager();
      const a = table(Author);
      resetQueryCount();

      // When expression keywords name columns whose values are columns or expression objects
      const rows = await em.query({
        from: a,
        select: {
          coalesce: a.first_name,
          case: { coalesce: [a.last_name, a.first_name] },
          nullIf: expr({ nullIf: [a.last_name, ""] }),
          greatest: { greatest: [a.age, 18] },
          least: { least: [a.age, 65] },
        },
        orderBy: [{ coalesce: "ASC" }, { case: "ASC" }],
      });

      // Then the result remains a named projection rather than becoming a scalar expression
      expect(rows).toEqual([{ coalesce: "Alice", case: "Alice", nullIf: null, greatest: 18, least: 65 }]);
      expectTypeOf(rows).toEqualTypeOf<
        { coalesce: string; case: string; nullIf: string | null; greatest: number; least: number }[]
      >();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS coalesce, COALESCE(a.last_name, a.first_name) AS "case", NULLIF(a.last_name, $1::varchar) AS "nullIf", GREATEST(a.age, $2::int4) AS greatest, LEAST(a.age, $3::int4) AS least FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY coalesce ASC, "case" ASC",
       ]
      `);
    });
  });

  describe("query composition", () => {
    it("builds correlated scalar queries from inline expressions", async () => {
      // Given an Author with a Book
      await insertAuthor({ first_name: "Alice" });
      await insertBook({ title: "Apple", author_id: 1 });
      // And an Author without Books
      await insertAuthor({ first_name: "Bob" });
      // And a scalar Book query correlated to each Author
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      const firstBook = query({ from: b, where: b.author_id.eq(a.id), select: { nullIf: [b.id, "b:9"] }, limit: 1 });
      // And a scalar query selecting an outer Author column, which must keep correlation working
      const outerName = query({
        from: b,
        where: b.author_id.eq(a.id),
        select: { coalesce: [a.last_name, a.first_name] },
        limit: 1,
      });
      resetQueryCount();

      // When inline COALESCE objects recover the empty scalar queries
      const rows = await em.query({
        from: a,
        select: {
          id: { coalesce: [firstBook, "b:10"] },
          name: { coalesce: [outerName, "No books"] },
        },
        orderBy: [{ asc: a.id }],
      });

      // Then query returns scalar expressions with codecs and correlation intact
      expect(rows).toEqual([
        { id: "b:1", name: "Alice" },
        { id: "b:10", name: "No books" },
      ]);
      expectTypeOf(firstBook).toEqualTypeOf<ScalarQuery<Book["id"] | null>>();
      expectTypeOf(rows).toEqualTypeOf<{ id: Book["id"]; name: string }[]>();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT COALESCE((SELECT NULLIF(b.id, $1::int4) AS value FROM books AS b WHERE b.author_id = a.id AND b.deleted_at IS NULL LIMIT $2), $3::int4) AS id, COALESCE((SELECT COALESCE(a.last_name, a.first_name) AS value FROM books AS b1 WHERE b1.author_id = a.id AND b1.deleted_at IS NULL LIMIT $4), $5::varchar) AS name FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY a.id ASC",
       ]
      `);
    });

    it("exposes inline projection values as typed derived-table columns", async () => {
      // Given an Author without a last name
      await insertAuthor({ first_name: "Alice" });
      // And a reusable query with an inline name expression
      const em = newEntityManager();
      const a = table(Author);
      const names = query({ from: a, select: { id: a.id, name: { coalesce: [a.last_name, a.first_name] } } });
      resetQueryCount();

      // When using the computed column in a CTE predicate and selecting its row
      const rows = await em.query({ with: names, from: names, where: names.name.eq("Alice"), select: names });

      // Then the derived columns retain their name and Author id types
      expect(rows).toEqual([{ id: "a:1", name: "Alice" }]);
      expectTypeOf(rows).toEqualTypeOf<{ id: Author["id"]; name: string }[]>();
      expect(queries).toMatchInlineSnapshot(`
       [
         "WITH cte AS (SELECT a.id AS id, COALESCE(a.last_name, a.first_name) AS name FROM authors AS a WHERE a.deleted_at IS NULL) SELECT cte.id AS id, cte.name AS name FROM cte WHERE cte.name = $1",
       ]
      `);
    });

    it("combines inline select values in set operands", async () => {
      // Given an Author and a Book with different display names
      await insertAuthor({ first_name: "Alice" });
      await insertBook({ title: "Apple", author_id: 1 });
      // And Author and Book tables for the combined names
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      resetQueryCount();

      // When combining a computed Author name and a computed Book title
      const rows = await em.query({
        unionAll: [
          { from: a, select: { name: { coalesce: [a.last_name, a.first_name] } } },
          { from: b, select: { name: { nullIf: [b.title, ""] } } },
        ],
        orderBy: { name: "ASC" },
      });

      // Then the combined rows retain the nullable name type from NULLIF
      expect(rows).toEqual([{ name: "Alice" }, { name: "Apple" }]);
      expectTypeOf(rows).toEqualTypeOf<{ name: string | null }[]>();
      expect(queries).toMatchInlineSnapshot(`
       [
         "(SELECT COALESCE(a.last_name, a.first_name) AS name FROM authors AS a WHERE a.deleted_at IS NULL) UNION ALL (SELECT NULLIF(b.title, $1::varchar) AS name FROM books AS b WHERE b.deleted_at IS NULL) ORDER BY name ASC",
       ]
      `);
    });

    it("executes reusable query objects with inline selects", async () => {
      // Given an Author without a last name
      await insertAuthor({ first_name: "Alice" });
      // And a reusable scalar select checked with satisfies Query
      const em = newEntityManager();
      const a = table(Author);
      const input = { from: a, select: { coalesce: [a.last_name, a.first_name] } } as const satisfies Query;
      resetQueryCount();

      // When executing the read through the execute API
      const result = await em.execute(input);

      // Then the scalar row type and command count are preserved
      expect(result.rows).toEqual(["Alice"]);
      expect(result.rowCount).toEqual(1);
      expectTypeOf(result.rows).toEqualTypeOf<string[]>();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT COALESCE(a.last_name, a.first_name) AS value FROM authors AS a WHERE a.deleted_at IS NULL",
       ]
      `);
    });
  });

  describe("validation", () => {
    it("validates inline scalar operands before executing SQL", async () => {
      // Given an Author table for invalid scalar expressions
      const em = newEntityManager();
      const a = table(Author);

      // When NULLIF is missing its comparison operand
      // Then inline expressions get the same compile-time and runtime arity checks as expr
      // @ts-expect-error NULLIF needs exactly two operands
      await expect(em.query({ from: a, select: { nullIf: [a.age] } })).rejects.toThrow(
        "NULLIF needs exactly two values",
      );

      // When COALESCE mixes names and ages
      // Then both TypeScript and runtime checks reject incompatible values
      // @ts-expect-error Names and ages are incompatible
      await expect(em.query({ from: a, select: { coalesce: [a.first_name, a.age] } })).rejects.toThrow(
        "Expression operands need matching SQL types and codecs",
      );
      expect(queries).toMatchInlineSnapshot(`[]`);
    });

    it("validates named inline expressions and their table references", async () => {
      // Given Author and Book tables without a Book join
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);

      // When a named inline expression references Book.title
      // Then a non-null fallback does not remove the need for the Book join
      // @ts-expect-error Book is not joined
      await expect(em.query({ from: a, select: { title: { coalesce: [b.title, "Unknown"] } } })).rejects.toThrow(
        "is not in this query's from/join",
      );

      // When a named CASE has ELSE before WHEN
      // Then inline CASE ordering is checked before SQL
      await expect(
        em.query({
          from: a,
          // @ts-expect-error ELSE must follow a WHEN arm
          select: { name: { case: [{ else: "Unknown" }, { when: a.id.ne(null), then: a.first_name }] } },
        }),
      ).rejects.toThrow("CASE needs a WHEN arm before ELSE");
      expect(queries).toMatchInlineSnapshot(`[]`);
    });

    it("rejects keyed ordering for a scalar inline select", async () => {
      // Given an Author table and a scalar COALESCE select
      const em = newEntityManager();
      const a = table(Author);

      // When treating coalesce as a named result column
      // Then scalar ordering requires an expression rather than a projection key
      await expect(
        // @ts-expect-error A scalar select has no named output columns
        em.query({ from: a, select: { coalesce: [a.last_name, a.first_name] }, orderBy: { coalesce: "ASC" } }),
      ).rejects.toThrow("the keyed orderBy form needs a POJO or entity select");
      expect(queries).toMatchInlineSnapshot(`[]`);
    });

    it("checks inline expression operands inside set queries", async () => {
      // Given an Author table for a compound named projection
      const em = newEntityManager();
      const a = table(Author);

      // When a set operand contains a COALESCE with no candidates
      // Then set queries retain the inline expression validation
      await expect(
        em.query({
          // @ts-expect-error COALESCE needs at least one value
          unionAll: [
            { from: a, select: { name: { coalesce: [] } } },
            { from: a, select: { name: a.first_name } },
          ],
        }),
      ).rejects.toThrow("COALESCE needs at least one value");
      expect(queries).toMatchInlineSnapshot(`[]`);
    });
  });
});
