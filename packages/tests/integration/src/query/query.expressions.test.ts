import { expectTypeOf } from "expect-type";
import { expr, query, sql, table, tables } from "joist-orm";
import { Author, Book, User } from "src/entities";
import { insertAuthor, insertBook, insertUser, update } from "src/entities/inserts";
import { PasswordValue } from "src/entities/types";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("em.query / expression descriptions", () => {
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

    // When NULLIF removes empty strings before COALESCE chooses a name
    const rows = await em.query({
      from: a,
      select: {
        lastName: expr({ nullIf: [a.last_name, ""] }),
        name: expr({ coalesce: [{ nullIf: [a.last_name, ""] }, a.first_name] }),
      },
      orderBy: [{ asc: a.id }],
    });

    // Then empty and null last names use the first name, while other last names remain unchanged
    expect(rows).toEqual([
      { lastName: null, name: "Alice" },
      { lastName: null, name: "Bob" },
      { lastName: "Clark", name: "Clark" },
    ]);
    expectTypeOf(rows).toEqualTypeOf<{ lastName: string | null; name: string }[]>();
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

    // When comparing Author names to their Book titles
    const rows = await em.query({
      from: a,
      join: [a.books.as(b)],
      select: { name: expr({ nullIf: [a.first_name, b.title] }) },
      orderBy: [{ asc: a.id }],
    });

    // Then equal values return null, but a null comparison operand leaves the Author name intact
    expect(rows).toEqual([{ name: null }, { name: "Bob" }]);
    expectTypeOf(rows).toEqualTypeOf<{ name: string | null }[]>();
  });

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

    // When comparing ages with both non-null bounds and SQL NULL
    const rows = await em.query({
      from: a,
      select: {
        greatest: expr({ greatest: [a.age, null, 18] }),
        least: expr({ least: [a.age, null, 65] }),
        bounded: expr({ least: [{ greatest: [a.age, 18] }, 65] }),
        nullableGreatest: expr({ greatest: [a.age, null] }),
        nullableLeast: expr({ least: [null, a.age] }),
      },
      orderBy: [{ asc: a.id }],
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
  });

  it("ignores missing LEFT-joined Book titles when a non-null name is available", async () => {
    // Given an Author without Books
    await insertAuthor({ first_name: "Alice" });
    // And a LEFT-joined Book table whose title will be null
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);

    // When comparing missing titles with and without a non-null Author name
    const rows = await em.query({
      from: a,
      join: [a.books.as(b)],
      select: {
        greatest: expr({ greatest: [b.title, a.first_name] }),
        least: expr({ least: [a.first_name, b.title] }),
        missingGreatest: expr({ greatest: [b.title] }),
        missingLeast: expr({ least: [b.title, null] }),
        missingFirst: expr({ nullIf: [b.title, a.first_name] }),
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

    // When mapping NULLIF descriptions and adding fixed bounds around a dynamic list
    const rows = await em.query({
      from: a,
      select: {
        name: expr({ coalesce: [...names.map((name) => ({ nullIf: [name, ""] })), "Unknown"] }),
        greatest: expr({ greatest: [a.age, ...bounds, 18] }),
        least: expr({ least: [65, ...bounds, a.age] }),
        middleBound: expr({ greatest: [...bounds, 18, a.age] }),
        dynamic: expr({ greatest: [a.age, ...bounds] }),
      },
    });

    // Then fixed non-null candidates guarantee values even when the extra bounds are empty
    expect(rows).toEqual([{ name: "Alice", greatest: 30, least: 30, middleBound: 30, dynamic: 30 }]);
    expectTypeOf(rows).toEqualTypeOf<
      { name: string; greatest: number; least: number; middleBound: number; dynamic: number | null }[]
    >();
  });

  it("preserves Book id codecs in NULLIF, GREATEST, and LEAST", async () => {
    // Given an Author with a Book
    await insertAuthor({ first_name: "Alice" });
    await insertBook({ title: "Apple", author_id: 1 });
    // And a Book table for comparing stored integer ids with tagged literal ids
    const em = newEntityManager();
    const b = table(Book);
    const greatest = expr({ greatest: [b.id, "b:10"] });

    // When selecting id comparisons through a derived table and reusing their codec in a predicate
    const ids = query({
      from: b,
      where: greatest.eq("b:10"),
      select: {
        equal: expr({ nullIf: [b.id, "b:1"] }),
        different: expr({ nullIf: [b.id, "b:10"] }),
        nullFirst: expr({ nullIf: [null, b.id] }),
        greatest,
        least: expr({ least: ["b:10", b.id] }),
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
        value: expr({ greatest: [{ nullIf: [12, 12] }, { least: [8, 3] }, 7] }),
        different: expr({ nullIf: [4, 5] }),
        nullComparison: expr({ nullIf: [4, null] }),
        allNull: expr({ least: [null, null] }),
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

  it("rejects invalid operand counts and incompatible types in value comparisons", () => {
    // Given an Author table and an empty dynamic list of age candidates
    const a = table(Author);
    const ages: (typeof a.age)[] = [];
    // And a dynamic NULLIF argument list with three values instead of two
    const comparisons: number[] = [1, 2, 3];

    // When NULLIF has one operand
    // Then both TypeScript and runtime validation require a second operand
    // @ts-expect-error NULLIF requires exactly two values
    expect(() => expr({ nullIf: [a.age] })).toThrow("NULLIF needs exactly two values");

    // When NULLIF has three operands
    // Then both fixed and dynamic argument lists are rejected
    // @ts-expect-error NULLIF requires exactly two values
    expect(() => expr({ nullIf: [a.age, 1, 2] })).toThrow("NULLIF needs exactly two values");
    expect(() => expr({ nullIf: comparisons })).toThrow("NULLIF needs exactly two values");

    // When GREATEST has no operands
    // Then both fixed and dynamic argument lists are rejected
    // @ts-expect-error GREATEST requires a value
    expect(() => expr({ greatest: [] })).toThrow("GREATEST needs at least one value");
    expect(() => expr({ greatest: ages })).toThrow("GREATEST needs at least one value");

    // When LEAST has no operands
    // Then both fixed and dynamic argument lists are rejected
    // @ts-expect-error LEAST requires a value
    expect(() => expr({ least: [] })).toThrow("LEAST needs at least one value");
    expect(() => expr({ least: ages })).toThrow("LEAST needs at least one value");

    // When NULLIF compares an age to a string
    // Then its operands must have compatible types
    // @ts-expect-error Ages are numbers
    expect(() => expr({ nullIf: [a.age, "Unknown"] })).toThrow("Expression values must have compatible types");

    // When GREATEST compares an age to a string
    // Then its operands must have compatible types
    // @ts-expect-error Ages are numbers
    expect(() => expr({ greatest: [a.age, "Unknown"] })).toThrow("Expression values must have compatible types");

    // When LEAST compares an age to a string
    // Then its operands must have compatible types
    // @ts-expect-error Ages are numbers
    expect(() => expr({ least: [a.age, "Unknown"] })).toThrow("Expression values must have compatible types");
  });

  it("tries each conditional Author name until one is not null", async () => {
    // Given an Author whose last name is unknown
    await insertAuthor({ first_name: "Alice", last_name: null });
    // And another Author with a known last name
    await insertAuthor({ first_name: "Bob", last_name: "Brown" });
    // And a dynamic list of name candidates, like the parent-market names
    const em = newEntityManager();
    const a = table(Author);
    const candidates = [a.first_name];
    const name = expr({
      coalesce: [
        { case: { when: a.id.ne(null), then: a.last_name } },
        ...candidates.map((candidate) => ({ case: { when: a.id.ne(null), then: candidate } })),
      ],
    });

    // When choosing names and reusing the expression in a predicate
    const rows = await em.query({ from: a, where: name.ne("Missing"), select: { name }, orderBy: { name: "ASC" } });

    // Then a true condition with a null name still lets COALESCE try the next candidate
    expect(rows).toEqual([{ name: "Alice" }, { name: "Brown" }]);
    expectTypeOf(rows).toEqualTypeOf<{ name: string | null }[]>();
  });

  it("uses the first matching CASE arm and an explicit fallback", async () => {
    // Given an adult Author
    await insertAuthor({ first_name: "Alice", age: 30 });
    // And an Author whose age is unknown, so comparisons with it return SQL NULL
    await insertAuthor({ first_name: "Bob" });
    // And an Author table for the age descriptions
    const em = newEntityManager();
    const a = table(Author);

    // When describing ages with ordered CASE arms and with an omitted ELSE
    const rows = await em.query({
      from: a,
      select: {
        category: expr({
          case: [
            { when: a.age.gte(18), then: "Adult" },
            { when: a.age.gte(0), then: "Child" },
          ],
          else: "Unknown",
        }),
        adultName: expr({ case: { when: a.age.gte(18), then: a.first_name } }),
        stopsAtNull: expr({
          case: [
            { when: a.age.gte(18), then: null },
            { when: a.age.gte(0), then: a.first_name },
          ],
          else: "Unknown",
        }),
      },
      orderBy: [{ asc: a.id }],
    });

    // Then CASE stops at the first true arm, even when that arm returns null
    expect(rows).toEqual([
      { category: "Adult", adultName: "Alice", stopsAtNull: null },
      { category: "Unknown", adultName: null, stopsAtNull: "Unknown" },
    ]);
    expectTypeOf(rows).toEqualTypeOf<{ category: string; adultName: string | null; stopsAtNull: string | null }[]>();
  });

  it("uses a fallback after an empty list of conditional Author names", async () => {
    // Given an Author without a last name
    await insertAuthor({ first_name: "Alice" });
    // And an empty dynamic list of additional names
    const em = newEntityManager();
    const a = table(Author);
    const names: (typeof a.first_name)[] = [];

    // When choosing a name with and without a final non-null fallback
    const rows = await em.query({
      from: a,
      select: {
        nullable: expr({
          coalesce: [a.last_name, ...names.map((name) => ({ case: { when: a.id.ne(null), then: name } }))],
        }),
        fallback: expr({ coalesce: [a.last_name, ...names, "Unknown"] }),
        onlyDynamic: expr({ coalesce: [null, ...names] }),
      },
    });

    // Then a fixed fallback guarantees a name, while the empty dynamic list does not
    expect(rows).toEqual([{ nullable: null, fallback: "Unknown", onlyDynamic: null }]);
    expectTypeOf(rows).toEqualTypeOf<{ nullable: string | null; fallback: string; onlyDynamic: string | null }[]>();
  });

  it("accounts for LEFT-joined Book titles separately from Author fallbacks", async () => {
    // Given an Author without Books
    await insertAuthor({ first_name: "Alice" });
    // And a LEFT-joined Book table whose required title will be null for Alice
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);

    // When choosing among Book titles, Author names, and literal fallbacks
    const rows = await em.query({
      from: a,
      join: [a.books.as(b)],
      select: {
        title: expr({ coalesce: [b.title] }),
        name: expr({ coalesce: [b.title, a.first_name] }),
        literal: expr({ coalesce: [b.title, "Unknown"] }),
        conditional: expr({ case: { when: a.id.ne(null), then: b.title }, else: "Unknown" }),
        nested: expr({ coalesce: [expr({ case: { when: a.id.ne(null), then: b.title } }), a.first_name] }),
      },
    });

    // Then only candidates that can all be null produce nullable result types
    expect(rows).toEqual([{ title: null, name: "Alice", literal: "Unknown", conditional: null, nested: "Alice" }]);
    expectTypeOf(rows).toEqualTypeOf<
      { title: string | null; name: string; literal: string; conditional: string | null; nested: string }[]
    >();
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

    // When using the joined Book in a CASE condition
    const rows = await em.query({
      from: a,
      join: [a.books.as(b)],
      select: { name: expr({ case: { when: b.id.ne(null), then: a.first_name } }) },
      orderBy: [{ asc: a.id }],
    });

    // Then the Book's presence decides which Author names are returned
    expect(rows).toEqual([{ name: "Alice" }, { name: null }]);
  });

  it("prunes optional CASE arms and their Book joins", async () => {
    // Given an Author with two Books, which would duplicate the Author if the join remained
    await insertAuthor({ first_name: "Alice" });
    await insertBook({ title: "Apple", author_id: 1 });
    await insertBook({ title: "Zebra", author_id: 1 });
    // And a Book title condition omitted by the caller
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);

    // When every CASE arm disappears, with and without an explicit ELSE
    const rows = await em.query({
      from: a,
      join: [a.books.as(b)],
      select: {
        name: expr({ case: { when: { and: [b.title.eq(undefined)] }, then: b.title }, else: a.first_name }),
        missing: expr({ case: { when: undefined, then: b.title } }),
      },
    });

    // Then the CASE fallback remains and the unused Book join does not duplicate Alice
    expect(rows).toEqual([{ name: "Alice", missing: null }]);
  });

  it("uses a correlated Book query in a CASE condition", async () => {
    // Given an Author with a Book
    await insertAuthor({ first_name: "Alice" });
    await insertBook({ title: "Apple", author_id: 1 });
    // And an Author without Books
    await insertAuthor({ first_name: "Bob" });
    // And a Book query correlated to the Author being described
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    const books = query({ from: b, where: b.author_id.eq(a.id), select: b.id });

    // When selecting the Author's name only if a Book exists
    const rows = await em.query({
      from: a,
      select: { name: expr({ case: { when: { exists: books }, then: a.first_name }, else: "No books" }) },
      orderBy: [{ asc: a.id }],
    });

    // Then the CASE condition checks Books separately for each Author
    expect(rows).toEqual([{ name: "Alice" }, { name: "No books" }]);
    expectTypeOf(rows).toEqualTypeOf<{ name: string }[]>();
  });

  it("encodes Book id fallbacks and decodes the selected result", async () => {
    // Given an Author without Books
    await insertAuthor({ first_name: "Alice" });
    // And an absent Book whose id supplies the codec for literal fallbacks
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    const id = expr({ coalesce: [b.id, { case: { when: a.id.ne(null), then: "b:9" } }] });

    // When comparing and selecting the fallback through a derived table
    const chosen = query({ from: a, join: [a.books.as(b)], where: id.eq("b:9"), select: { id } });
    const rows = await em.query({ from: chosen, select: chosen });

    // Then the fallback reaches SQL as an integer and returns as a tagged Book id
    expect(rows).toEqual([{ id: "b:9" }]);
    expectTypeOf(rows).toEqualTypeOf<{ id: Book["id"] | null }[]>();
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

    // When using a custom PasswordValue fallback
    const users = await em.query({ from: u, select: { password: expr({ coalesce: [u.password, password] }) } });

    // Then the User's password codec decodes the literal fallback
    expect(users[0].password).toEqual(password);
    expectTypeOf(users[0].password).toEqualTypeOf<PasswordValue>();

    // When using tagged Book ids as an array fallback
    const authors = await em.query({
      from: a,
      select: { ids: expr({ coalesce: [query({ from: b, select: b.id.arrayAgg() }), ["b:9"]] }) },
    });

    // Then each fallback element uses the Book id codec
    expect(authors).toEqual([{ ids: ["b:9"] }]);
    expectTypeOf(authors).toEqualTypeOf<{ ids: Book["id"][] }[]>();
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
        label: expr({
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
        }),
        number: expr({ coalesce: [null, 42] }),
        flag: expr({ case: { when: a.age.gte(18), then: true }, else: false }),
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

  it("rejects incompatible Book and Author id codecs", () => {
    // Given ids with the same SQL storage type but different entity tags
    const [a, b] = tables(Author, Book);

    // When combining those ids into one result
    // Then one entity's decoder cannot be used for the other entity's ids
    expect(() => expr({ coalesce: [a.id, b.id] })).toThrow("Expression operands need matching SQL types and codecs");
  });

  it("rejects unknown result codecs even when their TypeScript types agree", () => {
    // Given a modeled Author name and a raw expression annotated as a name
    const a = table(Author);
    const rawName = sql.string`'Alice'`;

    // When combining them without runtime evidence of a shared result codec
    // Then the raw annotation cannot select the Author column's decoder
    expect(() => expr({ coalesce: [a.first_name, rawName] })).toThrow(
      "Expression operands need matching SQL types and codecs",
    );
  });

  it("rejects a Book title fallback when Book is not joined", async () => {
    // Given Author and Book tables without a join between them
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    // And a non-null fallback that still references the Book title
    const title = expr({ coalesce: [b.title, "Unknown"] });

    // When selecting that expression from only Author
    // Then both TypeScript and SQL preparation require the Book join
    // @ts-expect-error Book is not in this query's from or joins
    await expect(em.query({ from: a, select: { title } })).rejects.toThrow("is not in this query's from/join");
  });

  it("rejects dynamically empty candidate lists", () => {
    // Given an Author table and a dynamic list with no name candidates
    const a = table(Author);
    const names: (typeof a.first_name)[] = [];
    // And a dynamic list with no conditional name candidates
    const arms: { when: ReturnType<typeof a.id.ne>; then: typeof a.first_name }[] = [];

    // When building COALESCE from the empty name list
    // Then runtime validation rejects the missing values
    expect(() => expr({ coalesce: names })).toThrow("COALESCE needs at least one value");

    // When building CASE from the empty conditional name list
    // Then an ELSE alone does not supply a CASE arm
    expect(() => expr({ case: arms, else: "Unknown" })).toThrow("CASE needs at least one arm");
  });

  it("rejects malformed descriptions and incompatible value types", () => {
    // Given an Author table for checking invalid descriptions through the public API
    const a = table(Author);

    // When passing a literal instead of a description
    // Then the entry point requires a supported expression description
    // @ts-expect-error The root must be an expression description
    expect(() => expr(42)).toThrow("expr expects a case, coalesce, nullIf, greatest, or least description");

    // When describing an empty COALESCE
    // Then both TypeScript and runtime validation reject it
    // @ts-expect-error COALESCE needs a value
    expect(() => expr({ coalesce: [] })).toThrow("COALESCE needs at least one value");

    // When describing a CASE without arms
    // Then both TypeScript and runtime validation reject it
    // @ts-expect-error CASE needs an arm
    expect(() => expr({ case: [] })).toThrow("CASE needs at least one arm");

    // When mixing numeric and string literals
    // Then neither CASE nor COALESCE can select one compatible value type
    // @ts-expect-error Numeric and string values are incompatible
    expect(() => expr({ coalesce: [1, "name"] })).toThrow("Expression values must have compatible types");
    // @ts-expect-error Numeric and string branches are incompatible
    expect(() => expr({ case: { when: a.id.ne(null), then: 1 }, else: "name" })).toThrow(
      "Expression values must have compatible types",
    );

    // When a branch uses undefined instead of SQL NULL
    // Then the value must be explicit
    // @ts-expect-error Undefined is not a SQL value
    expect(() => expr({ case: { when: a.id.ne(null), then: undefined } })).toThrow("Use null for a SQL NULL value");

    // When using a number as an Author name fallback
    // Then column-backed descriptions also reject incompatible literal types
    // @ts-expect-error An Author name is not a number
    expect(() => expr({ coalesce: [a.first_name, 42] })).toThrow("Expression values must have compatible types");

    // When mixing CASE and COALESCE keys in one description
    // Then the extra key is rejected instead of ignored
    // @ts-expect-error A description has exactly one operation
    expect(() => expr({ coalesce: [a.first_name], case: { when: a.id.ne(null), then: a.first_name } })).toThrow(
      "Unknown expression key 'case'",
    );

    // When a CASE arm has a misspelled result key
    // Then the missing THEN value is rejected
    // @ts-expect-error Each arm needs then
    expect(() => expr({ case: { when: a.id.ne(null), value: a.first_name } })).toThrow(
      "A CASE arm needs when and then",
    );
  });
});
