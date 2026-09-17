import { expectTypeOf } from "expect-type";
import { type CaseElse, type CaseWhen, type Query, type ScalarQuery, expr, query, sql, table, tables } from "joist-orm";
import { Author, Book, User } from "src/entities";
import { insertAuthor, insertBook, insertUser, update } from "src/entities/inserts";
import { PasswordValue } from "src/entities/types";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("em.query / expressions", () => {
  describe("select", () => {
    it("treats expression literals under keyword keys as named columns", async () => {
      // Given an Author without a last name
      await insertAuthor({ first_name: "Alice", age: 30 });
      // And an Author table with fixture SQL excluded from the snapshot
      const em = newEntityManager();
      const a = table(Author);
      resetQueryCount();

      // When expression keywords are used as projection names
      const rows = await em.query({
        from: a,
        select: {
          coalesce: { coalesce: [a.last_name, a.first_name] },
          case: { case: [{ when: a.age.gte(18), then: a.first_name }, { else: "Child" }] },
        },
        orderBy: [{ coalesce: "ASC" }, { case: "ASC" }],
      });

      // Then each object key names a result column, including when its value uses the same keyword
      expect(rows).toEqual([{ coalesce: "Alice", case: "Alice" }]);
      expectTypeOf(rows).toEqualTypeOf<{ coalesce: string; case: string }[]>();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT COALESCE(a.last_name, a.first_name) AS coalesce, (CASE WHEN (a.age >= $1) THEN a.first_name ELSE $2::varchar END) AS "case" FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY coalesce ASC, "case" ASC",
       ]
      `);
    });

    it("rejects operand arrays used as named select values", async () => {
      // Given an Author table for selecting name candidates
      const em = newEntityManager();
      const a = table(Author);

      // When a coalesce column is given an operand array instead of an expression
      // Then the object is rejected as an invalid projection rather than interpreted as scalar SQL
      await expect(
        // @ts-expect-error Named projection values must be expressions, not operand arrays
        em.query({ from: a, select: { coalesce: [a.last_name, a.first_name] } }),
      ).rejects.toThrow("select.coalesce must be a column, an expression, or an expression literal");

      // When a case column is given WHEN entries instead of an expression
      // Then CASE also requires an explicit expr wrapper for a scalar select
      await expect(
        // @ts-expect-error CASE entries alone are not a named projection value
        em.query({ from: a, select: { case: [{ when: a.age.gte(18), then: a.first_name }] } }),
      ).rejects.toThrow("select.case must be a column, an expression, or an expression literal");
      expect(queries).toMatchInlineSnapshot(`[]`);
    });

    it("selects a scalar CASE with expr", async () => {
      // Given an adult Author
      await insertAuthor({ first_name: "Alice", age: 30 });
      // And an Author whose age is unknown
      await insertAuthor({ first_name: "Bob" });
      // And an Author table with fixture SQL excluded from the snapshot
      const em = newEntityManager();
      const a = table(Author);
      resetQueryCount();

      // When an explicit CASE expression is the entire select
      const rows = await em.query({
        from: a,
        select: expr({ case: [{ when: a.age.gte(18), then: a.first_name }, { else: "Unknown" }] }),
        orderBy: [{ sort: a.id, order: "ASC" }],
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

    it("selects scalar Author names with expr", async () => {
      // Given an Author without a last name
      await insertAuthor({ first_name: "Alice" });
      // And an Author with a last name
      await insertAuthor({ first_name: "Bob", last_name: "Brown" });
      // And an Author table with fixture SQL excluded from the snapshot
      const em = newEntityManager();
      const a = table(Author);
      resetQueryCount();

      // When selecting the first available Author name with an explicit expression
      const rows = await em.query({
        from: a,
        select: expr({ coalesce: [a.last_name, a.first_name] }),
        orderBy: [{ sort: a.id, order: "ASC" }],
      });

      // Then each row is the first available name
      expect(rows).toEqual(["Alice", "Brown"]);
      expectTypeOf(rows).toEqualTypeOf<string[]>();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT COALESCE(a.last_name, a.first_name) AS value FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY a.id ASC",
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
          nullIf: { nullIf: [a.last_name, ""] },
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
    it("builds correlated scalar queries from expression literals", async () => {
      // Given an Author with a Book
      await insertAuthor({ first_name: "Alice" });
      await insertBook({ title: "Apple", author_id: 1 });
      // And an Author without Books
      await insertAuthor({ first_name: "Bob" });
      // And a scalar Book query correlated to each Author
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      const firstBook = query({
        from: b,
        where: b.author_id.eq(a.id),
        select: expr({ nullIf: [b.id, "b:9"] }),
        limit: 1,
      });
      // And a scalar query selecting an outer Author column, which must keep correlation working
      const outerName = query({
        from: b,
        where: b.author_id.eq(a.id),
        select: expr({ coalesce: [a.last_name, a.first_name] }),
        limit: 1,
      });
      resetQueryCount();

      // When COALESCE supplies fallbacks for the empty scalar queries
      const rows = await em.query({
        from: a,
        select: {
          id: { coalesce: [firstBook, "b:10"] },
          name: { coalesce: [outerName, "No books"] },
        },
        orderBy: [{ sort: a.id, order: "ASC" }],
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

    it("exposes expression results as typed derived-table columns", async () => {
      // Given an Author without a last name
      await insertAuthor({ first_name: "Alice" });
      // And a reusable query with a computed name
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

    it("combines computed names in set operands", async () => {
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

    it("executes reusable query objects with expression literals", async () => {
      // Given an Author without a last name
      await insertAuthor({ first_name: "Alice" });
      // And a reusable scalar select checked with satisfies Query
      const em = newEntityManager();
      const a = table(Author);
      const input = { from: a, select: expr({ coalesce: [a.last_name, a.first_name] }) } satisfies Query;
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

  describe("nullIf", () => {
    it("treats empty Author last names as missing before choosing a fallback", async () => {
      // Given an Author whose last name is an empty string
      await insertAuthor({ first_name: "Alice", last_name: "" });
      // And an Author whose last name is SQL NULL
      await insertAuthor({ first_name: "Bob", last_name: null });
      // And an Author with a nonempty last name
      await insertAuthor({ first_name: "Carol", last_name: "Clark" });
      // And an Author table for choosing display names
      const em = newEntityManager();
      const a = table(Author);

      // And the Author setup is excluded from the SQL snapshot
      resetQueryCount();

      // When NULLIF removes empty strings before COALESCE chooses a name
      const rows = await em.query({
        from: a,
        select: {
          lastName: { nullIf: [a.last_name, ""] },
          name: { coalesce: [{ nullIf: [a.last_name, ""] }, a.first_name] },
        },
        orderBy: [{ sort: a.id, order: "ASC" }],
      });

      // Then empty and null last names use the first name, while other last names remain unchanged
      expect(rows).toEqual([
        { lastName: null, name: "Alice" },
        { lastName: null, name: "Bob" },
        { lastName: "Clark", name: "Clark" },
      ]);
      expectTypeOf(rows).toEqualTypeOf<{ lastName: string | null; name: string }[]>();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT NULLIF(a.last_name, $1::varchar) AS "lastName", COALESCE(NULLIF(a.last_name, $2::varchar), a.first_name) AS name FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY a.id ASC",
       ]
      `);
    });

    it("retains the Book join when only NULLIF's comparison operand references it", async () => {
      // Given an Author with a Book whose title matches her name
      await insertAuthor({ first_name: "Alice" });
      await insertBook({ title: "Alice", author_id: 1 });
      // And an Author without Books
      await insertAuthor({ first_name: "Bob" });
      // And a LEFT-joined Book table used only for comparison
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);

      // And the Author and Book setup is excluded from the SQL snapshot
      resetQueryCount();

      // When comparing Author names to their Book titles
      const rows = await em.query({
        from: a,
        join: [a.books.as(b)],
        select: { name: { nullIf: [a.first_name, b.title] } },
        orderBy: [{ sort: a.id, order: "ASC" }],
      });

      // Then equal values return null, but a null comparison operand leaves the Author name intact
      expect(rows).toEqual([{ name: null }, { name: "Bob" }]);
      expectTypeOf(rows).toEqualTypeOf<{ name: string | null }[]>();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT NULLIF(a.first_name, b.title) AS name FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE a.deleted_at IS NULL ORDER BY a.id ASC",
       ]
      `);
    });
  });

  describe("greatest and least", () => {
    it("bounds Author ages with nested GREATEST and LEAST expressions", async () => {
      // Given an Author younger than the lower age bound
      await insertAuthor({ first_name: "Alice", age: 10 });
      // And an Author within the age bounds
      await insertAuthor({ first_name: "Bob", age: 30 });
      // And an Author older than the upper age bound
      await insertAuthor({ first_name: "Carol", age: 80 });
      // And an Author whose age is unknown
      await insertAuthor({ first_name: "Dan" });
      // And an Author table for comparing ages
      const em = newEntityManager();
      const a = table(Author);

      // And the Author setup is excluded from the SQL snapshot
      resetQueryCount();

      // When comparing ages with both non-null bounds and SQL NULL
      const rows = await em.query({
        from: a,
        select: {
          greatest: { greatest: [a.age, null, 18] },
          least: { least: [a.age, null, 65] },
          bounded: { least: [{ greatest: [a.age, 18] }, 65] },
          nullableGreatest: { greatest: [a.age, null] },
          nullableLeast: { least: [null, a.age] },
        },
        orderBy: [{ sort: a.id, order: "ASC" }],
      });

      // Then null operands are ignored, and only all-null inputs return null
      expect(rows).toEqual([
        { greatest: 18, least: 10, bounded: 18, nullableGreatest: 10, nullableLeast: 10 },
        { greatest: 30, least: 30, bounded: 30, nullableGreatest: 30, nullableLeast: 30 },
        { greatest: 80, least: 65, bounded: 65, nullableGreatest: 80, nullableLeast: 80 },
        { greatest: 18, least: 65, bounded: 18, nullableGreatest: null, nullableLeast: null },
      ]);
      expectTypeOf(rows).toEqualTypeOf<
        {
          greatest: number;
          least: number;
          bounded: number;
          nullableGreatest: number | null;
          nullableLeast: number | null;
        }[]
      >();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT GREATEST(a.age, $1::int4, $2::int4) AS greatest, LEAST(a.age, $3::int4, $4::int4) AS least, LEAST(GREATEST(a.age, $5::int4), $6::int4) AS bounded, GREATEST(a.age, $7::int4) AS "nullableGreatest", LEAST($8::int4, a.age) AS "nullableLeast" FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY a.id ASC",
       ]
      `);
    });

    it("ignores missing LEFT-joined Book titles when a non-null name is available", async () => {
      // Given an Author without Books
      await insertAuthor({ first_name: "Alice" });
      // And a LEFT-joined Book table whose title will be null
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);

      // And the Author setup is excluded from the SQL snapshot
      resetQueryCount();

      // When comparing missing titles with and without a non-null Author name
      const rows = await em.query({
        from: a,
        join: [a.books.as(b)],
        select: {
          greatest: { greatest: [b.title, a.first_name] },
          least: { least: [a.first_name, b.title] },
          missingGreatest: { greatest: [b.title] },
          missingLeast: { least: [b.title, null] },
          missingFirst: { nullIf: [b.title, a.first_name] },
        },
      });

      // Then GREATEST and LEAST can return the Author name, while NULLIF keeps its null first operand
      expect(rows).toEqual([
        {
          greatest: "Alice",
          least: "Alice",
          missingGreatest: null,
          missingLeast: null,
          missingFirst: null,
        },
      ]);
      expectTypeOf(rows).toEqualTypeOf<
        {
          greatest: string;
          least: string;
          missingGreatest: string | null;
          missingLeast: string | null;
          missingFirst: string | null;
        }[]
      >();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT GREATEST(b.title, a.first_name) AS greatest, LEAST(a.first_name, b.title) AS least, GREATEST(b.title) AS "missingGreatest", LEAST(b.title, $1::varchar) AS "missingLeast", NULLIF(b.title, a.first_name) AS "missingFirst" FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE a.deleted_at IS NULL",
       ]
      `);
    });

    it("supports mapped NULLIF candidates and dynamic comparison lists", async () => {
      // Given an Author with an empty last name
      await insertAuthor({ first_name: "Alice", last_name: "", age: 30 });
      // And a dynamic list of Author names to normalize
      const em = newEntityManager();
      const a = table(Author);
      const names = [a.last_name, a.first_name];
      // And a possibly empty list of extra age bounds
      const bounds: number[] = [];

      // And the Author setup is excluded from the SQL snapshot
      resetQueryCount();

      // When mapping NULLIF expression objects and adding fixed bounds around a dynamic list
      const rows = await em.query({
        from: a,
        select: {
          name: { coalesce: [...names.map((name) => ({ nullIf: [name, ""] })), "Unknown"] },
          greatest: { greatest: [a.age, ...bounds, 18] },
          least: { least: [65, ...bounds, a.age] },
          middleBound: { greatest: [...bounds, 18, a.age] },
          dynamic: { greatest: [a.age, ...bounds] },
        },
      });

      // Then fixed non-null candidates guarantee values even when the extra bounds are empty
      expect(rows).toEqual([{ name: "Alice", greatest: 30, least: 30, middleBound: 30, dynamic: 30 }]);
      expectTypeOf(rows).toEqualTypeOf<
        { name: string; greatest: number; least: number; middleBound: number; dynamic: number | null }[]
      >();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT COALESCE(NULLIF(a.last_name, $1::varchar), NULLIF(a.first_name, $2::varchar), $3::varchar) AS name, GREATEST(a.age, $4::int4) AS greatest, LEAST($5::int4, a.age) AS least, GREATEST($6::int4, a.age) AS "middleBound", GREATEST(a.age) AS dynamic FROM authors AS a WHERE a.deleted_at IS NULL",
       ]
      `);
    });
  });

  describe("comparison codecs and SQL", () => {
    it("preserves Book id codecs in NULLIF, GREATEST, and LEAST", async () => {
      // Given an Author with a Book
      await insertAuthor({ first_name: "Alice" });
      await insertBook({ title: "Apple", author_id: 1 });
      // And a Book table for comparing stored integer ids with tagged literal ids
      const em = newEntityManager();
      const b = table(Book);
      // And a reusable Book id expression for both filtering and selecting
      const greatest = expr({ greatest: [b.id, "b:10"] });

      // And the Author and Book setup is excluded from the SQL snapshot
      resetQueryCount();

      // When selecting id comparisons through a derived table and reusing their codec in a predicate
      const ids = query({
        from: b,
        where: greatest.eq("b:10"),
        select: {
          equal: { nullIf: [b.id, "b:1"] },
          different: { nullIf: [b.id, "b:10"] },
          nullFirst: { nullIf: [null, b.id] },
          greatest,
          least: { least: ["b:10", b.id] },
        },
      });
      const rows = await em.query({ from: ids, select: ids });

      // Then PostgreSQL compares integer ids and Joist returns the selected ids with Book tags
      expect(rows).toEqual([{ equal: null, different: "b:1", nullFirst: null, greatest: "b:10", least: "b:1" }]);
      expectTypeOf(rows).toEqualTypeOf<
        {
          equal: Book["id"] | null;
          different: Book["id"] | null;
          nullFirst: null;
          greatest: Book["id"];
          least: Book["id"];
        }[]
      >();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT sq.equal AS equal, sq.different AS different, sq."nullFirst" AS "nullFirst", sq.greatest AS greatest, sq.least AS least FROM (SELECT NULLIF(b.id, $1::int4) AS equal, NULLIF(b.id, $2::int4) AS different, NULLIF($3::int4, b.id) AS "nullFirst", GREATEST(b.id, $4::int4) AS greatest, LEAST($5::int4, b.id) AS least FROM books AS b WHERE GREATEST(b.id, $6::int4) = $7 AND b.deleted_at IS NULL) AS sq",
       ]
      `);
    });

    it("binds literal NULLIF, GREATEST, and LEAST operands in SQL order", async () => {
      // Given an Author to select one row of computed values
      await insertAuthor({ first_name: "Alice" });
      // And a fresh query log for the expression SQL
      const em = newEntityManager();
      const a = table(Author);
      resetQueryCount();

      // When nesting comparisons with distinct parameter values
      const rows = await em.query({
        from: a,
        select: {
          value: { greatest: [{ nullIf: [12, 12] }, { least: [8, 3] }, 7] },
          different: { nullIf: [4, 5] },
          nullComparison: { nullIf: [4, null] },
          allNull: { least: [null, null] },
        },
      });

      // Then parameter order matches SQL order and numeric results remain numbers
      expect(rows).toEqual([{ value: 7, different: 4, nullComparison: 4, allNull: null }]);
      expectTypeOf(rows).toEqualTypeOf<
        { value: number; different: number | null; nullComparison: number | null; allNull: null }[]
      >();
      expect(queries).toMatchInlineSnapshot(`
            [
              "SELECT GREATEST(NULLIF($1::float8, $2::float8), LEAST($3::float8, $4::float8), $5::float8) AS value, NULLIF($6::float8, $7::float8) AS different, NULLIF($8::float8, $9::float8) AS "nullComparison", LEAST($10::text, $11::text) AS "allNull" FROM authors AS a WHERE a.deleted_at IS NULL",
            ]
          `);
    });
  });

  describe("comparison validation", () => {
    it("rejects invalid operand counts and incompatible types in value comparisons", async () => {
      // Given an Author table and an empty dynamic list of age candidates
      const em = newEntityManager();
      const a = table(Author);
      const ages: (typeof a.age)[] = [];
      // And a dynamic NULLIF argument list with three values instead of two
      const comparisons: number[] = [1, 2, 3];

      // When NULLIF has one operand
      // Then both TypeScript and runtime validation require a second operand
      // @ts-expect-error NULLIF requires exactly two values
      await expect(em.query({ from: a, select: { value: { nullIf: [a.age] } } })).rejects.toThrow(
        "NULLIF needs exactly two values",
      );

      // When NULLIF has three operands
      // Then both fixed and dynamic argument lists are rejected
      // @ts-expect-error NULLIF requires exactly two values
      await expect(em.query({ from: a, select: { value: { nullIf: [a.age, 1, 2] } } })).rejects.toThrow(
        "NULLIF needs exactly two values",
      );
      await expect(em.query({ from: a, select: { value: { nullIf: comparisons } } })).rejects.toThrow(
        "NULLIF needs exactly two values",
      );

      // When GREATEST has no operands
      // Then both fixed and dynamic argument lists are rejected
      // @ts-expect-error GREATEST requires a value
      await expect(em.query({ from: a, select: { value: { greatest: [] } } })).rejects.toThrow(
        "GREATEST needs at least one value",
      );
      await expect(em.query({ from: a, select: { value: { greatest: ages } } })).rejects.toThrow(
        "GREATEST needs at least one value",
      );

      // When LEAST has no operands
      // Then both fixed and dynamic argument lists are rejected
      // @ts-expect-error LEAST requires a value
      await expect(em.query({ from: a, select: { value: { least: [] } } })).rejects.toThrow(
        "LEAST needs at least one value",
      );
      await expect(em.query({ from: a, select: { value: { least: ages } } })).rejects.toThrow(
        "LEAST needs at least one value",
      );

      // When NULLIF compares an age to a string
      // Then its operands must have compatible types
      await expect(
        // @ts-expect-error Ages are numbers
        em.query({ from: a, select: { value: { nullIf: [a.age, "Unknown"] } } }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Expression values must have compatible types: expected int4 (domain Number), got 'Unknown' (string)"`,
      );

      // When GREATEST compares an age to a string
      // Then its operands must have compatible types
      await expect(
        // @ts-expect-error Ages are numbers
        em.query({ from: a, select: { value: { greatest: [a.age, "Unknown"] } } }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Expression values must have compatible types: expected int4 (domain Number), got 'Unknown' (string)"`,
      );

      // When LEAST compares an age to a string
      // Then its operands must have compatible types
      await expect(
        // @ts-expect-error Ages are numbers
        em.query({ from: a, select: { value: { least: [a.age, "Unknown"] } } }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Expression values must have compatible types: expected int4 (domain Number), got 'Unknown' (string)"`,
      );
      expect(queries).toMatchInlineSnapshot(`[]`);
    });
  });

  describe("coalesce", () => {
    it("tries each conditional Author name until one is not null", async () => {
      // Given an Author whose last name is unknown
      await insertAuthor({ first_name: "Alice", last_name: null });
      // And another Author with a known last name
      await insertAuthor({ first_name: "Bob", last_name: "Brown" });
      // And a dynamic list of candidate Author names
      const em = newEntityManager();
      const a = table(Author);
      const candidates = [a.first_name];
      // And a reusable conditional name expression for both filtering and selecting
      const name = expr({
        coalesce: [
          { case: { when: a.id.ne(null), then: a.last_name } },
          ...candidates.map((candidate) => ({ case: { when: a.id.ne(null), then: candidate } })),
        ],
      });

      // And the Author setup is excluded from the SQL snapshot
      resetQueryCount();

      // When choosing names and reusing the expression in a predicate
      const rows = await em.query({ from: a, where: name.ne("Missing"), select: { name }, orderBy: { name: "ASC" } });

      // Then a true condition with a null name still lets COALESCE try the next candidate
      expect(rows).toEqual([{ name: "Alice" }, { name: "Brown" }]);
      expectTypeOf(rows).toEqualTypeOf<{ name: string | null }[]>();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT COALESCE((CASE WHEN (a.id IS NOT NULL) THEN a.last_name END), (CASE WHEN (a.id IS NOT NULL) THEN a.first_name END)) AS name FROM authors AS a WHERE COALESCE((CASE WHEN (a.id IS NOT NULL) THEN a.last_name END), (CASE WHEN (a.id IS NOT NULL) THEN a.first_name END)) != $1 AND a.deleted_at IS NULL ORDER BY name ASC",
       ]
      `);
    });

    it("uses a fallback after an empty list of conditional Author names", async () => {
      // Given an Author without a last name
      await insertAuthor({ first_name: "Alice" });
      // And an empty dynamic list of additional names
      const em = newEntityManager();
      const a = table(Author);
      const names: (typeof a.first_name)[] = [];

      // And the Author setup is excluded from the SQL snapshot
      resetQueryCount();

      // When choosing a name with and without a final non-null fallback
      const rows = await em.query({
        from: a,
        select: {
          nullable: {
            coalesce: [a.last_name, ...names.map((name) => ({ case: { when: a.id.ne(null), then: name } }))],
          },
          fallback: { coalesce: [a.last_name, ...names, "Unknown"] },
          onlyDynamic: { coalesce: [null, ...names] },
        },
      });

      // Then a fixed fallback guarantees a name, while the empty dynamic list does not
      expect(rows).toEqual([{ nullable: null, fallback: "Unknown", onlyDynamic: null }]);
      expectTypeOf(rows).toEqualTypeOf<{ nullable: string | null; fallback: string; onlyDynamic: string | null }[]>();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT COALESCE(a.last_name) AS nullable, COALESCE(a.last_name, $1::varchar) AS fallback, COALESCE($2::text) AS "onlyDynamic" FROM authors AS a WHERE a.deleted_at IS NULL",
       ]
      `);
    });

    it("accounts for LEFT-joined Book titles separately from Author fallbacks", async () => {
      // Given an Author without Books
      await insertAuthor({ first_name: "Alice" });
      // And a LEFT-joined Book table whose required title will be null for Alice
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);

      // And the Author setup is excluded from the SQL snapshot
      resetQueryCount();

      // When choosing among Book titles, Author names, and literal fallbacks
      const rows = await em.query({
        from: a,
        join: [a.books.as(b)],
        select: {
          title: { coalesce: [b.title] },
          name: { coalesce: [b.title, a.first_name] },
          literal: { coalesce: [b.title, "Unknown"] },
          conditional: { case: [{ when: a.id.ne(null), then: b.title }, { else: "Unknown" }] },
          nested: { coalesce: [{ case: { when: a.id.ne(null), then: b.title } }, a.first_name] },
          bookId: { coalesce: [b.id, "b:9"] },
          missingId: { case: { when: b.id.ne(null), then: b.id } },
        },
      });

      // Then only candidates that can all be null produce nullable result types
      expect(rows).toEqual([
        {
          title: null,
          name: "Alice",
          literal: "Unknown",
          conditional: null,
          nested: "Alice",
          bookId: "b:9",
          missingId: null,
        },
      ]);
      expectTypeOf(rows).toEqualTypeOf<
        {
          title: string | null;
          name: string;
          literal: string;
          conditional: string | null;
          nested: string;
          bookId: Book["id"];
          missingId: Book["id"] | null;
        }[]
      >();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT COALESCE(b.title) AS title, COALESCE(b.title, a.first_name) AS name, COALESCE(b.title, $1::varchar) AS literal, (CASE WHEN (a.id IS NOT NULL) THEN b.title ELSE $2::varchar END) AS conditional, COALESCE((CASE WHEN (a.id IS NOT NULL) THEN b.title END), a.first_name) AS nested, COALESCE(b.id, $3::int4) AS "bookId", (CASE WHEN (b.id IS NOT NULL) THEN b.id END) AS "missingId" FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE a.deleted_at IS NULL",
       ]
      `);
    });
  });

  describe("case", () => {
    it("accepts dynamic WHEN entries followed by a final ELSE", async () => {
      // Given an Author whose age is unknown
      await insertAuthor({ first_name: "Alice" });
      // And an optional list of age conditions
      const em = newEntityManager();
      const a = table(Author);
      const arms = [{ when: a.age.gte(18), then: a.first_name }];
      // And a dynamic array whose type does not guarantee that an ELSE is present
      const dynamic = [...arms, { else: "Unknown" }] satisfies (CaseWhen | CaseElse)[];
      // And the Author setup is excluded from the SQL snapshot
      resetQueryCount();

      // When selecting CASE expressions with a fixed or dynamically placed fallback
      const rows = await em.query({
        from: a,
        select: {
          fixed: { case: [...arms, { else: "Unknown" }] },
          dynamic: { case: dynamic },
          nullable: { case: [...arms, { else: null }] },
          nested: { case: [...arms, { else: { coalesce: [a.last_name, a.first_name] } }] },
        },
      });

      // Then the ELSE entries provide values, while dynamic arrays retain conservative nullability
      expect(rows).toEqual([{ fixed: "Unknown", dynamic: "Unknown", nullable: null, nested: "Alice" }]);
      expectTypeOf(rows).toEqualTypeOf<
        { fixed: string; dynamic: string | null; nullable: string | null; nested: string }[]
      >();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT (CASE WHEN (a.age >= $1) THEN a.first_name ELSE $2::varchar END) AS fixed, (CASE WHEN (a.age >= $3) THEN a.first_name ELSE $4::varchar END) AS dynamic, (CASE WHEN (a.age >= $5) THEN a.first_name ELSE $6::varchar END) AS nullable, (CASE WHEN (a.age >= $7) THEN a.first_name ELSE COALESCE(a.last_name, a.first_name) END) AS nested FROM authors AS a WHERE a.deleted_at IS NULL",
       ]
      `);
    });

    it("rejects misplaced or repeated ELSE entries", async () => {
      // Given an Author name that can be selected by a WHEN arm
      const em = newEntityManager();
      const a = table(Author);
      const arm = { when: a.id.ne(null), then: a.first_name };
      // And a dynamic array with a WHEN entry after ELSE
      const entries: (CaseWhen | CaseElse)[] = [arm, { else: "Unknown" }, arm];

      // When CASE has an ELSE but no WHEN
      // Then an ELSE alone is not a CASE expression
      // @ts-expect-error CASE requires a WHEN before ELSE
      await expect(em.query({ from: a, select: { value: { case: [{ else: "Unknown" }] } } })).rejects.toThrow(
        "CASE needs a WHEN arm before ELSE",
      );

      // When a WHEN follows ELSE
      // Then both fixed and dynamic arrays require ELSE to be last
      // @ts-expect-error ELSE must be last
      await expect(em.query({ from: a, select: { value: { case: [arm, { else: "Unknown" }, arm] } } })).rejects.toThrow(
        "CASE ELSE must be last",
      );
      await expect(em.query({ from: a, select: { value: { case: entries } } })).rejects.toThrow(
        "CASE ELSE must be last",
      );

      // When a named CASE has ELSE before WHEN
      // Then named projections also check CASE ordering before SQL
      await expect(
        em.query({
          from: a,
          // @ts-expect-error ELSE must follow a WHEN arm
          select: { name: { case: [{ else: "Unknown" }, arm] } },
        }),
      ).rejects.toThrow("CASE needs a WHEN arm before ELSE");

      // When CASE contains two ELSE entries
      // Then only one final ELSE is allowed
      await expect(
        // @ts-expect-error Only one ELSE is allowed
        em.query({ from: a, select: { value: { case: [arm, { else: "First" }, { else: "Second" }] } } }),
      ).rejects.toThrow("CASE ELSE must be last");

      // When ELSE appears outside the CASE array
      // Then the former sibling syntax is rejected
      // @ts-expect-error ELSE belongs inside the CASE array
      await expect(em.query({ from: a, select: { value: { case: [arm], else: "Unknown" } } })).rejects.toThrow(
        "Unknown expression key 'else'",
      );
      expect(queries).toMatchInlineSnapshot(`[]`);
    });

    it("uses the first matching CASE arm and an explicit fallback", async () => {
      // Given an adult Author
      await insertAuthor({ first_name: "Alice", age: 30 });
      // And an Author whose age is unknown, so comparisons with it return SQL NULL
      await insertAuthor({ first_name: "Bob" });
      // And an Author table for classifying ages
      const em = newEntityManager();
      const a = table(Author);
      // And the Author setup is excluded from the SQL snapshot
      resetQueryCount();

      // When describing ages with ordered CASE arms and with an omitted ELSE
      const rows = await em.query({
        from: a,
        select: {
          category: {
            case: [{ when: a.age.gte(18), then: "Adult" }, { when: a.age.gte(0), then: "Child" }, { else: "Unknown" }],
          },
          adultName: { case: { when: a.age.gte(18), then: a.first_name } },
          stopsAtNull: {
            case: [
              { when: a.age.gte(18), then: null },
              { when: a.age.gte(0), then: a.first_name },
              { else: "Unknown" },
            ],
          },
        },
        orderBy: [{ sort: a.id, order: "ASC" }],
      });

      // Then CASE stops at the first true arm, even when that arm returns null
      expect(rows).toEqual([
        { category: "Adult", adultName: "Alice", stopsAtNull: null },
        { category: "Unknown", adultName: null, stopsAtNull: "Unknown" },
      ]);
      expectTypeOf(rows).toEqualTypeOf<{ category: string; adultName: string | null; stopsAtNull: string | null }[]>();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT (CASE WHEN (a.age >= $1) THEN $2::text WHEN (a.age >= $3) THEN $4::text ELSE $5::text END) AS category, (CASE WHEN (a.age >= $6) THEN a.first_name END) AS "adultName", (CASE WHEN (a.age >= $7) THEN $8::varchar WHEN (a.age >= $9) THEN a.first_name ELSE $10::varchar END) AS "stopsAtNull" FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY a.id ASC",
       ]
      `);
    });

    it("retains a Book join used only by a CASE condition", async () => {
      // Given an Author with a Book
      await insertAuthor({ first_name: "Alice" });
      await insertBook({ title: "Apple", author_id: 1 });
      // And an Author without Books
      await insertAuthor({ first_name: "Bob" });
      // And a Book table used only to decide whether the Author has a name in this projection
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);

      // And the Author and Book setup is excluded from the SQL snapshot
      resetQueryCount();

      // When using the joined Book in a CASE condition
      const rows = await em.query({
        from: a,
        join: [a.books.as(b)],
        select: { name: { case: { when: b.id.ne(null), then: a.first_name } } },
        orderBy: [{ sort: a.id, order: "ASC" }],
      });

      // Then the Book's presence decides which Author names are returned
      expect(rows).toEqual([{ name: "Alice" }, { name: null }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT (CASE WHEN (b.id IS NOT NULL) THEN a.first_name END) AS name FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE a.deleted_at IS NULL ORDER BY a.id ASC",
       ]
      `);
    });

    it("prunes optional CASE arms and their Book joins", async () => {
      // Given an Author with two Books, which would duplicate the Author if the join remained
      await insertAuthor({ first_name: "Alice" });
      await insertBook({ title: "Apple", author_id: 1 });
      await insertBook({ title: "Zebra", author_id: 1 });
      // And a Book title condition omitted by the caller
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);

      // And the Author and Book setup is excluded from the SQL snapshot
      resetQueryCount();

      // When every CASE arm disappears, with and without an explicit ELSE
      const rows = await em.query({
        from: a,
        join: [a.books.as(b)],
        select: {
          name: { case: [{ when: { and: [b.title.eq(undefined)] }, then: b.title }, { else: a.first_name }] },
          missing: { case: { when: undefined, then: b.title } },
        },
      });

      // Then the CASE fallback remains and the unused Book join does not duplicate Alice
      expect(rows).toEqual([{ name: "Alice", missing: null }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS name, $1::varchar AS missing FROM authors AS a WHERE a.deleted_at IS NULL",
       ]
      `);
    });

    it("uses a correlated Book query in a CASE condition", async () => {
      // Given an Author with a Book
      await insertAuthor({ first_name: "Alice" });
      await insertBook({ title: "Apple", author_id: 1 });
      // And an Author without Books
      await insertAuthor({ first_name: "Bob" });
      // And a Book query correlated to the Author being selected
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      const books = query({ from: b, where: b.author_id.eq(a.id), select: b.id });

      // And the Author and Book setup is excluded from the SQL snapshot
      resetQueryCount();

      // When selecting the Author's name only if a Book exists
      const rows = await em.query({
        from: a,
        select: { name: { case: [{ when: { exists: books }, then: a.first_name }, { else: "No books" }] } },
        orderBy: [{ sort: a.id, order: "ASC" }],
      });

      // Then the CASE condition checks Books separately for each Author
      expect(rows).toEqual([{ name: "Alice" }, { name: "No books" }]);
      expectTypeOf(rows).toEqualTypeOf<{ name: string }[]>();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT (CASE WHEN (EXISTS (SELECT b.id AS value FROM books AS b WHERE b.author_id = a.id AND b.deleted_at IS NULL)) THEN a.first_name ELSE $1::varchar END) AS name FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY a.id ASC",
       ]
      `);
    });
  });

  describe("fallback codecs and SQL", () => {
    it("encodes Book id fallbacks and decodes the selected result", async () => {
      // Given an Author without Books
      await insertAuthor({ first_name: "Alice" });
      // And an absent Book whose id supplies the codec for literal fallbacks
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      // And a reusable Book id fallback for both filtering and selecting
      const id = expr({ coalesce: [b.id, { case: { when: a.id.ne(null), then: "b:9" } }] });

      // And the Author setup is excluded from the SQL snapshot
      resetQueryCount();

      // When comparing and selecting the fallback through a derived table
      const chosen = query({ from: a, join: [a.books.as(b)], where: id.eq("b:9"), select: { id } });
      const rows = await em.query({ from: chosen, select: chosen });

      // Then the fallback reaches SQL as an integer and returns as a tagged Book id
      expect(rows).toEqual([{ id: "b:9" }]);
      expectTypeOf(rows).toEqualTypeOf<{ id: Book["id"] | null }[]>();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT sq.id AS id FROM (SELECT COALESCE(b.id, (CASE WHEN (a.id IS NOT NULL) THEN $1::int4 END)) AS id FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE COALESCE(b.id, (CASE WHEN (a.id IS NOT NULL) THEN $2::int4 END)) = $3 AND a.deleted_at IS NULL) AS sq",
       ]
      `);
    });

    it("uses custom value and array codecs for literal fallbacks", async () => {
      // Given a User with the fixture's default password
      await insertUser({ name: "Alice", email: "alice@example.com" });
      // And a SQL NULL password so the User needs a fallback instead of the fixture's value
      await update("users", { id: 1, password: null });
      // And an Author without Books
      await insertAuthor({ first_name: "Alice" });
      // And expressions whose result codecs must also encode their fallback values
      const em = newEntityManager();
      const u = table(User);
      const [a, b] = tables(Author, Book);
      const password = new PasswordValue("secret");

      // And the User and Author setup is excluded from the SQL snapshot
      resetQueryCount();

      // When using a custom PasswordValue fallback
      const users = await em.query({ from: u, select: { password: { coalesce: [u.password, password] } } });

      // Then the User's password codec decodes the literal fallback
      expect(users[0].password).toEqual(password);
      expectTypeOf(users[0].password).toEqualTypeOf<PasswordValue>();

      // When using tagged Book ids as an array fallback
      const authors = await em.query({
        from: a,
        select: { ids: { coalesce: [query({ from: b, select: b.id.arrayAgg() }), ["b:9"]] } },
      });

      // Then each fallback element uses the Book id codec
      expect(authors).toEqual([{ ids: ["b:9"] }]);
      expectTypeOf(authors).toEqualTypeOf<{ ids: Book["id"][] }[]>();
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT COALESCE(u.password, $1::varchar) AS password FROM users AS u",
         "SELECT COALESCE((SELECT array_agg(b.id) AS value FROM books AS b WHERE b.deleted_at IS NULL), $1::int4[]) AS ids FROM authors AS a WHERE a.deleted_at IS NULL",
       ]
      `);
    });

    it("binds nested CASE conditions and values in SQL order", async () => {
      // Given an Author whose age selects the second CASE arm
      await insertAuthor({ first_name: "Alice", age: 30 });
      // And a fresh query log for the computed label
      const em = newEntityManager();
      const a = table(Author);
      resetQueryCount();

      // When each condition and value has its own parameter
      const rows = await em.query({
        from: a,
        select: {
          label: {
            coalesce: [
              {
                case: [
                  { when: a.age.lt(18), then: "Child" },
                  {
                    when: { and: [a.age.gte(30), sql.condition`${a.first_name} = ${"Alice"}`] },
                    then: { coalesce: [null, "Adult"] },
                  },
                ],
              },
              "Unknown",
            ],
          },
          number: { coalesce: [null, 42] },
          flag: { case: [{ when: a.age.gte(18), then: true }, { else: false }] },
        },
      });

      // Then each placeholder receives the intended value and standalone literals keep their types
      expect(rows).toEqual([{ label: "Adult", number: 42, flag: true }]);
      expectTypeOf(rows).toEqualTypeOf<{ label: string; number: number; flag: boolean }[]>();
      expect(queries).toMatchInlineSnapshot(`
            [
              "SELECT COALESCE((CASE WHEN (a.age < $1) THEN $2::text WHEN (a.age >= $3 AND a.first_name = $4) THEN COALESCE($5::text, $6::text) END), $7::text) AS label, COALESCE($8::float8, $9::float8) AS number, (CASE WHEN (a.age >= $10) THEN $11::bool ELSE $12::bool END) AS flag FROM authors AS a WHERE a.deleted_at IS NULL",
            ]
          `);
    });
  });

  describe("validation", () => {
    it("rejects keyed ordering for a scalar select", async () => {
      // Given an Author table and a scalar COALESCE select
      const em = newEntityManager();
      const a = table(Author);

      // When treating coalesce as a named result column
      // Then scalar ordering requires an expression rather than a projection key
      await expect(
        // @ts-expect-error A scalar select has no named output columns
        em.query({ from: a, select: expr({ coalesce: [a.last_name, a.first_name] }), orderBy: { coalesce: "ASC" } }),
      ).rejects.toThrow("the keyed orderBy form needs a POJO or entity select");
      expect(queries).toMatchInlineSnapshot(`[]`);
    });

    it("checks expression operands inside set queries", async () => {
      // Given an Author table for a compound named projection
      const em = newEntityManager();
      const a = table(Author);

      // When a set operand contains a COALESCE with no candidates
      // Then set queries retain the expression validation
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

    it("reports incompatible SQL storage types for Author ages", async () => {
      // Given an Author age column stored as int4 and a sum returned as int8
      const em = newEntityManager();
      const a = table(Author);

      // When combining them despite their shared TypeScript number type
      // Then the error names the SQL types that need different result handling
      await expect(
        em.query({ from: a, select: { value: { coalesce: [a.age, a.age.sum()] } } }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Expression operands need matching SQL types and codecs: int4 (domain Number) vs int8 (domain Number); mismatched SQL type"`,
      );
      expect(queries).toMatchInlineSnapshot(`[]`);
    });

    it("reports different codecs for User text columns", async () => {
      // Given a User name and password with different value conversions
      const em = newEntityManager();
      const u = table(User);

      // When combining a string name with a PasswordValue
      // Then the error distinguishes their conversion domains
      await expect(
        // @ts-expect-error Strings and PasswordValues are different value types
        em.query({ from: u, select: { value: { coalesce: [u.name, u.password] } } }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Expression operands need matching SQL types and codecs: varchar (domain String) vs varchar (domain { toDb: [Function: toDb], fromDb: [Function: fromDb] }); mismatched domain"`,
      );
      expect(queries).toMatchInlineSnapshot(`[]`);
    });

    it("rejects incompatible Book and Author id codecs", async () => {
      // Given ids with the same SQL storage type but different entity tags
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);

      // When combining those ids into one result
      // Then type checks and runtime decoding both keep Author and Book ids separate
      await expect(
        // @ts-expect-error AuthorId and BookId are different value types
        em.query({ from: a, select: { value: { coalesce: [a.id, b.id] } } }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Expression operands need matching SQL types and codecs: int4 (domain 'key:a', ID target Author) vs int4 (domain 'key:b', ID target Book); mismatched domain, ID target"`,
      );
      expect(queries).toMatchInlineSnapshot(`[]`);
    });

    it("rejects unknown result codecs even when their TypeScript types agree", async () => {
      // Given a modeled Author name and a raw expression annotated as a name
      const em = newEntityManager();
      const a = table(Author);
      const rawName = sql.string`'Alice'`;

      // When combining them without runtime evidence of a shared result codec
      // Then the raw annotation cannot select the Author column's decoder
      await expect(
        em.query({ from: a, select: { value: { coalesce: [a.first_name, rawName] } } }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Expression operands need matching SQL types and codecs: varchar (domain String) vs unknown codec; mismatched unknown codec"`,
      );
      expect(queries).toMatchInlineSnapshot(`[]`);
    });

    it("rejects a Book title fallback when Book is not joined", async () => {
      // Given Author and Book tables without a join between them
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      // When selecting a Book title with a non-null fallback from only Author
      // Then both TypeScript and SQL preparation require the Book join
      // @ts-expect-error Book is not in this query's from or joins
      await expect(em.query({ from: a, select: { title: { coalesce: [b.title, "Unknown"] } } })).rejects.toThrow(
        "is not in this query's from/join",
      );
      expect(queries).toMatchInlineSnapshot(`[]`);
    });

    it("rejects dynamically empty candidate lists", async () => {
      // Given an Author table and a dynamic list with no name candidates
      const em = newEntityManager();
      const a = table(Author);
      const names: (typeof a.first_name)[] = [];
      // And a dynamic list with no conditional name candidates
      const arms: { when: ReturnType<typeof a.id.ne>; then: typeof a.first_name }[] = [];

      // When building COALESCE from the empty name list
      // Then runtime validation rejects the missing values
      await expect(em.query({ from: a, select: { value: { coalesce: names } } })).rejects.toThrow(
        "COALESCE needs at least one value",
      );

      // When building CASE from the empty conditional name list
      // Then an ELSE alone does not supply a CASE arm
      await expect(em.query({ from: a, select: { value: { case: [...arms, { else: "Unknown" }] } } })).rejects.toThrow(
        "CASE needs a WHEN arm before ELSE",
      );
      expect(queries).toMatchInlineSnapshot(`[]`);
    });

    it("rejects malformed expression objects and incompatible value types", async () => {
      // Given an Author table for checking invalid expression objects through the public API
      const em = newEntityManager();
      const a = table(Author);

      // When passing a literal instead of an expression object
      // Then the entry point requires a supported expression object
      // @ts-expect-error The root must be an expression object
      expect(() => expr(42)).toThrow("expr expects an object with case, coalesce, nullIf, greatest, or least");

      // When describing an empty COALESCE
      // Then both TypeScript and runtime validation reject it
      // @ts-expect-error COALESCE needs a value
      await expect(em.query({ from: a, select: { value: { coalesce: [] } } })).rejects.toThrow(
        "COALESCE needs at least one value",
      );

      // When describing a CASE without arms
      // Then both TypeScript and runtime validation reject it
      // @ts-expect-error CASE needs an arm
      await expect(em.query({ from: a, select: { value: { case: [] } } })).rejects.toThrow(
        "CASE needs at least one arm",
      );

      // When mixing numeric and string literals
      // Then neither CASE nor COALESCE can select one compatible value type
      await expect(
        // @ts-expect-error Numeric and string values are incompatible
        em.query({ from: a, select: { value: { coalesce: [1, "name"] } } }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Expression values must have compatible types: expected float8 (domain Number), got 'name' (string)"`,
      );
      await expect(
        // @ts-expect-error Numeric and string branches are incompatible
        em.query({ from: a, select: { value: { case: [{ when: a.id.ne(null), then: 1 }, { else: "name" }] } } }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Expression values must have compatible types: expected float8 (domain Number), got 'name' (string)"`,
      );

      // When a branch uses undefined instead of SQL NULL
      // Then the value must be explicit
      await expect(
        // @ts-expect-error Undefined is not a SQL value
        em.query({ from: a, select: { value: { case: { when: a.id.ne(null), then: undefined } } } }),
      ).rejects.toThrow("Use null for a SQL NULL value");

      // When using a number as an Author name fallback
      // Then column-backed expressions also reject incompatible literal types
      await expect(
        // @ts-expect-error An Author name is not a number
        em.query({ from: a, select: { value: { coalesce: [a.first_name, 42] } } }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Expression values must have compatible types: expected varchar (domain String), got 42 (number)"`,
      );

      // When an Author age and name are alternatives in the same expression
      // Then column expressions must also have compatible result types
      await expect(
        // @ts-expect-error Names and ages are incompatible
        em.query({ from: a, select: { value: { coalesce: [a.first_name, a.age] } } }),
      ).rejects.toThrow("Expression operands need matching SQL types and codecs");

      // When mixing CASE and COALESCE keys in one expression object
      // Then the extra key is rejected instead of ignored
      await expect(
        em.query({
          from: a,
          // @ts-expect-error An expression object has exactly one operation
          select: { value: { coalesce: [a.first_name], case: { when: a.id.ne(null), then: a.first_name } } },
        }),
      ).rejects.toThrow("Unknown expression key 'case'");

      // When a CASE arm has a misspelled result key
      // Then the missing THEN value is rejected
      await expect(
        // @ts-expect-error Each arm needs then
        em.query({ from: a, select: { value: { case: { when: a.id.ne(null), value: a.first_name } } } }),
      ).rejects.toThrow("A CASE arm needs when and then");
      expect(queries).toMatchInlineSnapshot(`[]`);
    });
  });
});
