import { expectTypeOf } from "expect-type";
import {
  type Loaded,
  Query,
  type RawCondition,
  alias,
  getAliasMgmt,
  getMetadata,
  query,
  sql,
  table,
  tables,
} from "joist-orm";
import {
  Author,
  Book,
  BookRange,
  BookReview,
  Color,
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
  User,
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
  insertUser,
  update,
} from "src/entities/inserts";
import { PasswordValue } from "src/entities/types";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";
import { ZodError } from "zod";

/**
 * `em.query`: SQL-shaped queries as plain object literals.
 *
 * Author/Book/BookReview scenarios cover relationship filters, aggregate reports, reusable page/count
 * queries, and raw SQL expressions, including how optional filters affect joins and returned rows.
 */
describe("EntityManager.rawQueries", () => {
  it("selects typed SQL shortcuts for an Author", async () => {
    // Given an Author with a known name and age
    await insertAuthor({ first_name: "Alice", age: 30 });
    // And an Author table for the computed projections
    const em = newEntityManager();
    const a = table(Author);

    // When computing numeric, string, and boolean values with typed SQL shortcuts
    const rows = await em.query({
      from: a,
      select: {
        age: sql.number`${a.age} + ${2}`,
        name: sql.string`upper(${a.first_name})`,
        adult: sql.boolean`${a.age.gte(18)}`,
      },
      where: sql.number`${a.age} + ${2}`.eq(32),
    });

    // Then the Author's computed values have the declared runtime and inferred types
    expect(rows).toEqual([{ age: 32, name: "ALICE", adult: true }]);
    expectTypeOf(rows).toEqualTypeOf<{ age: number; name: string; adult: boolean }[]>();
  });

  it("selects nullable SQL shortcuts for Authors with known and unknown ages", async () => {
    // Given an Author with a known age
    await insertAuthor({ first_name: "Alice", age: 30 });
    // And an Author whose age is unknown
    await insertAuthor({ first_name: "Bob" });
    // And an Author table for the nullable projections
    const em = newEntityManager();
    const a = table(Author);

    // When computing nullable numeric, string, and boolean values from each Author's age
    const rows = await em.query({
      from: a,
      select: {
        age: sql.numberOrNull`${a.age} + ${2}`,
        label: sql.stringOrNull`${a.age}::text`,
        adult: sql.booleanOrNull`${a.age.gte(18)}`,
      },
      orderBy: [{ asc: a.first_name }],
    });

    // Then known ages produce typed values and unknown ages remain null
    expect(rows).toEqual([
      { age: 32, label: "30", adult: true },
      { age: null, label: null, adult: null },
    ]);
    expectTypeOf(rows).toEqualTypeOf<{ age: number | null; label: string | null; adult: boolean | null }[]>();
  });

  describe("select shapes", () => {
    it("populates selected Authors and their nested Book relations", async () => {
      // Given an Author with a Book
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      // And another Author without Books
      await insertAuthor({ first_name: "a2" });
      // And the first Author already in the identity map with unloaded Books
      const em = newEntityManager();
      const existing = await em.load(Author, "a:1");
      const a = table(Author);
      expect(existing.books.isLoaded).toBe(false);

      // When selecting Authors with their Books and each Book's Author populated
      const authors = await em.query({ from: a, select: a, orderBy: { id: "ASC" } }, { populate: { books: "author" } });

      // Then the identity map is preserved and nested relations are available synchronously
      expectTypeOf(authors).toEqualTypeOf<Loaded<Author, { readonly books: "author" }>[]>();
      expect(authors[0]).toBe(existing);
      expect(authors[0].books.get.map((book) => book.title)).toEqual(["b1"]);
      expect(authors[0].books.get[0].author.get).toBe(existing);
      expect(authors[1].books.get).toEqual([]);
    });

    it("populates reusable Author queries", async () => {
      // Given an Author with a Book
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      // And a reusable query selecting Authors
      const em = newEntityManager();
      const a = table(Author);
      const allAuthors = query({ from: a, select: a });

      // When selecting Authors from the reusable query with Books populated
      const authors = await em.query(allAuthors, { populate: "books" });

      // Then Books are available synchronously with loaded types
      expectTypeOf(authors).toEqualTypeOf<Loaded<Author, "books">[]>();
      expect(authors[0].books.get.map((book) => book.title)).toEqual(["b1"]);
    });

    it("preserves empty Author results when population is requested", async () => {
      // Given an Author whose name does not match the requested name
      await insertAuthor({ first_name: "a1" });
      // And an Author table for selecting matching entities
      const em = newEntityManager();
      const a = table(Author);

      // When selecting Authors whose name does not exist
      const missing = await em.query({ from: a, select: a, where: a.first_name.eq("missing") }, { populate: "books" });

      // Then population preserves the empty result
      expect(missing).toEqual([]);
    });

    it("rejects population of non-entity selections before executing SQL", async () => {
      // Given an Author table with no loaded entities
      const em = newEntityManager();
      const a = table(Author);
      resetQueryCount();

      // When requesting Books on a projection instead of Author entities
      // Then the query fails before reaching PostgreSQL, even with no matching Authors
      await expect(
        // @ts-expect-error Population requires an entity selection
        em.query({ from: a, select: { name: a.first_name } }, { populate: "books" }),
      ).rejects.toThrow("em.query populate requires an entity selection");
      expect(queries).toEqual([]);
    });

    it("filters Authors by a domain field through an alias", async () => {
      // Given an Author matching the firstName condition
      await insertAuthor({ first_name: "a1" });
      // And another Author excluded by that condition
      await insertAuthor({ first_name: "a2" });
      const em = newEntityManager();
      const a = alias(Author);
      // And frozen ID, raw, and cross-column conditions can be reused by find
      const conditions = {
        and: [
          Object.freeze(a.id.eq("a:1")!),
          Object.freeze(a.firstName.eq("a1")!),
          Object.freeze(a.firstName.raw("LIKE ?", ["a1"])),
          Object.freeze(a.id.eq(a.id)!),
        ],
      };
      Object.freeze(conditions.and);
      Object.freeze(conditions);
      // When finding Authors twice with the same immutable conditions
      const authors = await em.find(Author, { as: a }, { conditions });
      const again = await newEntityManager().find(Author, { as: a }, { conditions });
      // Then only the matching Author is returned
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
      expect(again).toMatchEntity([{ firstName: "a1" }]);
    });

    it("reuses custom alias conditions for Authors and their mentors", async () => {
      // Given an Author who mentors another Author
      await insertAuthor({ first_name: "mentor" });
      // And a mentee whose name does not match the mentor condition
      await insertAuthor({ first_name: "mentee", mentor_id: 1 });
      // And a frozen custom condition that resolves the Author name in each query
      const a = alias(Author);
      const sqlAliases: string[] = [];
      const conditions = Object.freeze(
        getAliasMgmt(a).condition((meta, sqlAlias) => {
          expect(meta).toBe(getMetadata(Author));
          sqlAliases.push(sqlAlias);
          return {
            kind: "raw",
            aliases: [sqlAlias],
            condition: `${sqlAlias}.first_name = ?`,
            bindings: ["mentor"],
            pruneable: false,
          };
        }),
      );

      // When constructing the condition without finding Authors
      // Then no query binding has been requested
      expectTypeOf(conditions).toEqualTypeOf<Readonly<RawCondition>>();
      expect(sqlAliases).toEqual([]);

      // When using the same condition for the root Author and a joined mentor
      const [authors, mentees] = await Promise.all([
        newEntityManager().find(Author, { as: a }, { conditions: { and: [conditions] } }),
        newEntityManager().find(Author, { mentor: { as: a } }, { conditions: { and: [conditions] } }),
      ]);

      // Then each query uses its own SQL alias and retains the mentor join
      expect(authors).toMatchEntity([{ firstName: "mentor" }]);
      expect(mentees).toMatchEntity([{ firstName: "mentee" }]);
      expect(sqlAliases.sort()).toEqual(["a", "a1"]);
      expect(conditions.condition).toBe("unset");
      expect(conditions.aliases).toEqual([]);
    });

    it("rejects custom alias conditions without a bound Author", async () => {
      // Given an Author alias that is absent from the find filter
      const a = alias(Author);
      // And a custom condition that requires that Author's SQL alias
      const conditions = getAliasMgmt(a).condition((_meta, sqlAlias) => ({
        kind: "raw",
        aliases: [sqlAlias],
        condition: `${sqlAlias}.first_name = ?`,
        bindings: ["mentor"],
        pruneable: false,
      }));

      // When finding Authors without binding the condition's alias
      // Then the missing binding is rejected before SQL execution
      await expect(newEntityManager().find(Author, {}, { conditions: { and: [conditions] } })).rejects.toThrow(
        "Alias for authors is not bound to this query's join literal",
      );
      expect(queries).toEqual([]);
    });

    it("returns entities for a bare alias", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      const em = newEntityManager();
      const [a] = tables(Author);
      resetQueryCount();
      const authors = await em.query({ from: a, where: { and: [a.first_name.eq("a1")] }, select: a });
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
      const [a] = tables(Author);
      const [found] = await em.query({ from: a, select: a });
      expect(found).toBe(a1);
    });

    it("returns POJOs and decodes ids, enums, and nulls", async () => {
      // Given Author a1 with an age and a stored BookRange enum id
      await insertAuthor({ first_name: "a1", age: 30, range_of_books: 1 });
      // And Author a2 with null age and rangeOfBooks fields
      await insertAuthor({ first_name: "a2" });
      const em = newEntityManager();
      const [a] = tables(Author);
      const rows = await em.query({
        from: a,
        select: { authorId: a.id, name: a.first_name, age: a.age, range: a.range_of_books },
        orderBy: [{ asc: a.first_name }],
      });
      expect(rows).toEqual([
        { authorId: "a:1", name: "a1", age: 30, range: BookRange.Few },
        { authorId: "a:2", name: "a2", age: null, range: null },
      ]);
    });

    it("decodes custom passwords in projections and hydration without converting nulls", async () => {
      // Given User u1 with an encoded password and no manager, so its left join has an absent row
      const password = PasswordValue.fromPlainText("secret");
      await insertUser({ name: "u1", password: password.encoded });
      // And User u2 initially has the insert fixture's default password
      await insertUser({ name: "u2" });
      // And u2 has a SQL NULL password and references u1 as its manager, giving the left join a matching row
      await update("users", { id: 2, password: null, manager_id: 1 });
      const em = newEntityManager();
      const u = table(User);
      const m = table(User, "manager");
      // When selecting each User's password and its manager's password
      const rows = await em.query({
        from: u,
        join: [{ left: m, on: u.manager_id.eq(m.id) }],
        select: { name: u.name, password: u.password, managerPassword: m.password },
        orderBy: [{ asc: u.name }],
      });
      // Then stored passwords decode to PasswordValue while missing passwords or managers remain null
      expect(rows).toEqual([
        { name: "u1", password, managerPassword: null },
        { name: "u2", password: null, managerPassword: password },
      ]);
      expect(rows[0].password!.matches("secret")).toBe(true);
      // When loading the same Users as entities
      const users = await em.loadAll(User, ["u:1", "u:2"]);
      // Then stored passwords decode to PasswordValue while SQL NULL becomes an unset password
      expect(users).toMatchEntity([{ password }, { password: undefined }]);
      expect(users[0].password!.matches("secret")).toBe(true);
    });

    it("preserves null enum array projections while hydration defaults them to empty arrays", async () => {
      // Given Author a1 with two stored Color ids
      await insertAuthor({ first_name: "a1", favorite_colors: [1, 2] });
      // And Author a2 initially has the schema's empty-array default
      await insertAuthor({ first_name: "a2" });
      // And a2's favorite_colors is SQL NULL instead of that empty-array default
      await update("authors", { id: 2, favorite_colors: null });
      // And Author a3 retains the schema's empty-array default
      await insertAuthor({ first_name: "a3" });
      const em = newEntityManager();
      const a = table(Author);
      const rows = await em.query({
        from: a,
        select: { name: a.first_name, colors: a.favorite_colors },
        orderBy: [{ asc: a.first_name }],
      });
      expect(rows).toEqual([
        { name: "a1", colors: [Color.Red, Color.Green] },
        { name: "a2", colors: null },
        { name: "a3", colors: [] },
      ]);
      // Bare scalar selects must also preserve NULL without the POJO decoder's null handling.
      expect(await em.query({ from: a, select: a.favorite_colors, orderBy: [{ asc: a.first_name }] })).toEqual([
        [Color.Red, Color.Green],
        null,
        [],
      ]);
      expect(await em.loadAll(Author, ["a:1", "a:2", "a:3"])).toMatchEntity([
        { favoriteColors: [Color.Red, Color.Green] },
        { favoriteColors: [] },
        { favoriteColors: [] },
      ]);
      // The Author getter also defaults to [], so check the column's own default directly.
      const column = getMetadata(Author).fields.favoriteColors.serde!.columns[0];
      expect(column.mapFromDb(null)).toEqual([]);
      expect(column.mapFromDb(undefined)).toEqual([]);
    });

    it("parses schema-backed JSON projections like hydrated fields", async () => {
      // Given Author a1 with a valid street and an extra JSON key that AddressSchema strips
      await insertAuthor({ first_name: "a1", business_address: { street: "123 Main", extra: "not in the schema" } });
      // And Author a2 has SQL NULL for its optional businessAddress
      await insertAuthor({ first_name: "a2" });
      const em = newEntityManager();
      const a = table(Author);
      // When projecting each Author's businessAddress
      const rows = await em.query({
        from: a,
        select: { name: a.first_name, address: a.business_address },
        orderBy: [{ asc: a.first_name }],
      });
      // Then AddressSchema strips a1's extra key while a2's missing address remains null
      expect(rows).toEqual([
        { name: "a1", address: { street: "123 Main" } },
        { name: "a2", address: null },
      ]);
      // When loading the same Authors as entities
      const authors = await em.loadAll(Author, ["a:1", "a:2"]);
      // Then hydration also strips a1's extra key but represents a2's missing address as undefined
      expect(authors).toMatchEntity([{ businessAddress: { street: "123 Main" } }, { businessAddress: undefined }]);
    });

    it("rejects schema-backed JSON projections with an invalid street", async () => {
      // Given Author a1 with a numeric street instead of the string required by AddressSchema
      await insertAuthor({ first_name: "a1", business_address: { street: 123 } });
      const em = newEntityManager();
      const a = table(Author);
      // When projecting a1's invalid businessAddress
      const invalidAddressQuery = em.query({ from: a, where: a.id.eq("a:1"), select: { address: a.business_address } });
      // Then AddressSchema rejects the numeric street instead of returning unvalidated JSON
      await expect(invalidAddressQuery).rejects.toThrow(ZodError);
    });

    it("returns a subquery's rows for a bare subquery", async () => {
      // Given adult Author a1, included by the subquery's age filter
      await insertAuthor({ first_name: "a1", age: 30 });
      // And underage Author a2, excluded from the subquery's rows
      await insertAuthor({ first_name: "a2", age: 10 });
      const em = newEntityManager();
      const [a] = tables(Author);
      // And a subquery that exposes only adult Author ids and names
      const adults = query({ from: a, where: { and: [a.age.gte(18)] }, select: { id: a.id, name: a.first_name } });
      const rows = await em.query({ from: adults, select: adults, orderBy: [{ asc: adults.name }] });
      expect(rows).toEqual([{ id: "a:1", name: "a1" }]);
    });

    it("selects CTI base rows without implicit subtype joins", async () => {
      // Given a SmallPublisher with its name stored on the Publisher base table
      await insertPublisher({ id: 1, name: "small" });
      // And a LargePublisher with a base-table name and a subtype-table country
      await insertLargePublisher({ id: 2, name: "large", country: "us" });
      const em = newEntityManager();
      const [p] = tables(Publisher);
      resetQueryCount();
      const publishers = await em.query({ from: p, select: { name: p.name }, orderBy: [{ asc: p.id }] });
      expect(publishers).toEqual([{ name: "small" }, { name: "large" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT p.name AS name FROM publishers AS p WHERE p.deleted_at IS NULL ORDER BY p.id ASC",
       ]
      `);
    });

    it("selects CTI subtype and base fields through an explicit join", async () => {
      // Given a SmallPublisher with name on publishers and city on small_publishers; both must project
      await insertPublisher({ id: 1, name: "p1", city: "sf" });
      const em = newEntityManager();
      const [sp, p] = tables(SmallPublisher, Publisher);
      resetQueryCount();
      const rows = await em.query({
        from: sp,
        join: [{ inner: p, on: sp.id.eq(p.id) }],
        select: { name: p.name, city: sp.city },
      });
      expect(rows).toEqual([{ name: "p1", city: "sf" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT p.name AS name, sp.city AS city FROM small_publishers AS sp JOIN publishers AS p ON sp.id = p.id",
       ]
      `);
    });

    it("filters a CTI base field through an explicit subtype join", async () => {
      // Given a SmallPublisher excluded by its base-table name
      await insertPublisher({ id: 1, name: "p1" });
      // And a SmallPublisher matching the requested base-table name
      await insertPublisher({ id: 2, name: "p2", city: "sf" });
      const em = newEntityManager();
      const [p, sp] = tables(Publisher, SmallPublisher);
      resetQueryCount();
      const rows = await em.query({
        from: p,
        join: [p.smallPublisher.inner(sp)],
        where: p.name.eq("p2"),
        select: { name: p.name, city: sp.city },
      });
      expect(rows).toEqual([{ name: "p2", city: "sf" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT p.name AS name, sp.city AS city FROM publishers AS p JOIN small_publishers AS sp ON p.id = sp.id WHERE p.name = $1 AND p.deleted_at IS NULL",
       ]
      `);
    });

    it("rejects inherited CTI columns and relationships on a physical subtype handle", () => {
      // Given a SmallPublisher handle whose name and authors belong to publishers
      const sp = table(SmallPublisher);
      resetQueryCount();
      expect(() => Reflect.get(sp, "name")).toThrow(
        "No physical field name on SmallPublisher; join its base table explicitly",
      );
      expect(() => Reflect.get(sp, "authors")).toThrow(
        "No physical field authors on SmallPublisher; join its base table explicitly",
      );
      expect(queries).toMatchInlineSnapshot(`[]`);
    });

    it("rejects entity selects from physical CTI and STI handles before SQL", async () => {
      // Given physical base and subtype handles that cannot provide complete entities
      const [p, sp, t, tn] = tables(Publisher, SmallPublisher, Task, TaskNew);
      const em = newEntityManager();
      resetQueryCount();
      // The casts cross the static rejection to verify the runtime guard for untyped callers.
      await expect(em.query({ from: p, select: p } as any)).rejects.toThrow(
        "Inherited table Publisher cannot be selected as entities; select its columns individually",
      );
      await expect(em.query({ from: sp, select: sp } as any)).rejects.toThrow(
        "Inherited table SmallPublisher cannot be selected as entities; select its columns individually",
      );
      await expect(em.query({ from: t, select: t } as any)).rejects.toThrow(
        "Inherited table Task cannot be selected as entities; select its columns individually",
      );
      await expect(em.query({ from: tn, select: tn } as any)).rejects.toThrow(
        "Inherited table TaskNew cannot be selected as entities; select its columns individually",
      );
      expect(queries).toMatchInlineSnapshot(`[]`);
    });

    it("rejects selecting a joined alias or subquery", async () => {
      const em = newEntityManager();
      // Given distinct Author aliases sharing the type-level name "Author", so the call-site check
      // cannot tell them apart; these queries compile, but the runtime check compares handles and is exact
      const [a, a2] = tables(Author, Author);
      // And an invalid entity select of the joined Author instead of the from Author
      await expect(em.query({ from: a, join: [{ left: a2, on: a2.mentor_id.eq(a.id) }], select: a2 })).rejects.toThrow(
        new Error(
          "Selecting a joined table is not supported yet; select the from table, or select its columns individually",
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
      const [a] = tables(Author);
      // And a subquery name containing a quote and SQL comment marker; it must stay one identifier
      // at its declaration and every reference (column refs, select-star), not become SQL
      const evil = query({ from: a, select: { name: a.first_name }, as: 'x" --' });
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
      const [a] = tables(Author);
      // And a SQL-shaped key crossing an `any` boundary; like legal display names (i.e. CSV headers),
      // it must stay one quoted identifier instead of becoming SQL
      const evil = 'name" FROM authors; --';
      const rows = await em.query({ from: a, select: { "Book Count": a.age, [evil]: a.first_name } } as any);
      expect(rows).toEqual([{ "Book Count": null, [evil]: "a1" }]);
      // And an invalid 64-byte select key; PG silently truncates identifiers over 63 bytes,
      // which would break decoding, so those fail fast
      await expect(em.query({ from: a, select: { ["x".repeat(64)]: a.first_name } } as any)).rejects.toThrow(
        new Error(`Identifier '${"x".repeat(64)}' is longer than PG's 63-byte limit`),
      );
    });
  });

  describe("joins", () => {
    it("selects and joins a physical polymorphic Author component", async () => {
      // Given a Comment whose parent is Author a1
      await insertAuthor({ first_name: "a1" });
      await insertComment({ text: "on author", parent_author_id: 1 });
      // And a Comment whose parent is Book b1, leaving its Author component null
      await insertBook({ title: "b1", author_id: 1 });
      await insertComment({ text: "on book", parent_book_id: 1 });
      const em = newEntityManager();
      const [c, a] = tables(Comment, Author);
      // When selecting the physical component and joining it to Authors
      const rows = await em.query({
        from: c,
        join: [{ left: a, on: c.parent_author_id.eq(a.id) }],
        select: { text: c.text, authorId: c.parent_author_id, author: a.first_name },
        orderBy: { text: "ASC" },
      });
      // Then Author ids decode with their tag and other parent components remain null
      expect(rows).toEqual([
        { text: "on author", authorId: "a:1", author: "a1" },
        { text: "on book", authorId: null, author: null },
      ]);
    });

    it("joins only the explicitly requested CTI physical tables", async () => {
      // Given a SmallPublisher with its name on the Publisher base table
      await insertPublisher({ name: "p1", city: "sf" });
      // And an Author referencing that Publisher
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const [a, p] = tables(Author, Publisher);
      const sp = table(SmallPublisher);
      resetQueryCount();
      // Joining the CTI base adds no subtype joins.
      const viaBase = await em.query({
        from: a,
        join: [{ inner: p, on: a.publisher_id.eq(p.id) }],
        select: { name: p.name },
      });
      expect(viaBase).toEqual([{ name: "p1" }]);
      // Joining a CTI subtype does not add its base table.
      const viaSubtype = await em.query({
        from: a,
        join: [{ inner: sp, on: a.publisher_id.eq(sp.id) }],
        select: { city: sp.city },
      });
      expect(viaSubtype).toEqual([{ city: "sf" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT p.name AS name FROM authors AS a JOIN publishers AS p ON a.publisher_id = p.id WHERE a.deleted_at IS NULL",
         "SELECT sp.city AS city FROM authors AS a JOIN small_publishers AS sp ON a.publisher_id = sp.id WHERE a.deleted_at IS NULL",
       ]
      `);
    });

    it("can inner join with an on condition, in either direction", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      const fromAuthor = await em.query({
        from: a,
        join: [{ inner: b, on: b.author_id.eq(a.id) }],
        select: { author: a.first_name, title: b.title },
      });
      expect(fromAuthor).toEqual([{ author: "a1", title: "b1" }]);
      const fromBook = await em.query({
        from: b,
        join: [{ inner: a, on: b.author_id.eq(a.id) }],
        select: { author: a.first_name, title: b.title },
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
      const [a, b] = tables(Author, Book);
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [{ left: b, on: b.author_id.eq(a.id) }],
        select: { author: a.first_name, title: b.title },
        orderBy: [{ asc: a.first_name }],
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
      const [a] = tables(Author);
      const m = table(Author, "m");
      const rows = await em.query({
        from: a,
        join: [{ inner: m, on: a.mentor_id.eq(m.id) }],
        where: { and: [m.age.gt(a.age)] },
        select: { mentee: a.first_name, mentor: m.first_name },
      });
      expect(rows).toEqual([{ mentee: "mentee", mentor: "mentor" }]);
    });
  });

  describe("relationship join sugar", () => {
    it("retains Authors when a Publisher or its SmallPublisher row is missing", async () => {
      // Given a SmallPublisher with a subtype city
      await insertPublisher({ id: 1, name: "small", city: "sf" });
      // And a LargePublisher without a small_publishers row
      await insertLargePublisher({ id: 2, name: "large" });
      // And an Author referencing the SmallPublisher
      await insertAuthor({ first_name: "small", publisher_id: 1 });
      // And an Author referencing the LargePublisher
      await insertAuthor({ first_name: "large", publisher_id: 2 });
      // And an Author without any Publisher
      await insertAuthor({ first_name: "none" });
      const em = newEntityManager();
      const [a, p, sp] = tables(Author, Publisher, SmallPublisher);
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [a.publisher.as(p), p.smallPublisher(sp)],
        select: { author: a.first_name, publisher: p.name, city: sp.city },
        orderBy: [{ asc: a.id }],
      });
      expect(rows).toEqual([
        { author: "small", publisher: "small", city: "sf" },
        { author: "large", publisher: "large", city: null },
        { author: "none", publisher: null, city: null },
      ]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS author, p.name AS publisher, sp.city AS city FROM authors AS a LEFT OUTER JOIN publishers AS p ON a.publisher_id = p.id LEFT OUTER JOIN small_publishers AS sp ON p.id = sp.id WHERE a.deleted_at IS NULL ORDER BY a.id ASC",
       ]
      `);
    });

    it("joins a large collection like any o2m", async () => {
      await insertPublisherGroup({ name: "pg1" });
      await insertCritic({ name: "c1", group_id: 1 });
      const em = newEntityManager();
      const [pg, c] = tables(PublisherGroup, Critic);
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
      const [a, b] = tables(Author, Book);
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [a.books.as(b)],
        select: { author: a.first_name, title: b.title },
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
      const [a, b] = tables(Author, Book);
      const rows = await em.query({
        from: a,
        join: [a.books.inner(b)],
        select: { author: a.first_name, title: b.title },
      });
      expect(rows).toEqual([{ author: "a1", title: "b1" }]);
    });

    it("joins a required reference as an inner join", async () => {
      // Given Author a1 as the target of a required reference
      await insertAuthor({ first_name: "a1" });
      // And Book b1 storing a1's id in its physical author_id column
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      resetQueryCount();
      const rows = await em.query({
        from: b,
        join: [b.author.as(a)],
        select: { title: b.title, author: a.first_name, authorId: b.author_id },
      });
      expect(rows).toEqual([{ title: "b1", author: "a1", authorId: "a:1" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT b.title AS title, a.first_name AS author, b.author_id AS "authorId" FROM books AS b JOIN authors AS a ON b.author_id = a.id WHERE b.deleted_at IS NULL",
       ]
      `);
    });

    it("joins a nullable reference as a left join, with a named self-join alias", async () => {
      // Given a mentor Author with no mentor of their own
      await insertAuthor({ first_name: "mentor" });
      // And a mentee Author referencing that mentor, so only one side has a null mentor
      await insertAuthor({ first_name: "mentee", mentor_id: 1 });
      const em = newEntityManager();
      const [a] = tables(Author);
      const m = table(Author, "m");
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [a.mentor.as(m)],
        select: { name: a.first_name, mentor: m.first_name },
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
      const [b] = tables(Book);
      const s = table(Book, "s");
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
      const [a, t] = tables(Author, Tag);
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [a.tags.as(t)],
        select: { author: a.first_name, tag: t.name },
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
      const [c, a] = tables(Comment, Author);
      resetQueryCount();
      const rows = await em.query({ from: c, join: [c.parent.as(a)], select: { text: c.text, author: a.first_name } });
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
      const [a, b, t] = tables(Author, Book, Tag);
      // And absent Book title and Tag name filters, leaving neither collection join referenced
      const filter: string | undefined = undefined;
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [a.books.as(b), a.tags.as(t)],
        where: { and: [b.title.eq(filter), t.name.eq(filter)] },
        select: { name: a.first_name },
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
      const [a, b, br] = tables(Author, Book, BookReview);
      const rows = await em.query({
        from: a,
        join: [a.books.inner(b), { left: br, on: br.book_id.eq(b.id) }],
        select: { title: b.title, rating: br.rating },
      });
      expect(rows).toEqual([{ title: "b1", rating: 5 }]);
    });

    it("rejects a sugar join whose receiver is not in the query", async () => {
      const em = newEntityManager();
      const [a, b, t] = tables(Author, Book, Tag);
      // Given an invalid Tag join from an Author alias absent from the Book query's from/join
      await expect(em.query({ from: b, join: [a.tags.as(t)], select: { tag: t.name } })).rejects.toThrow(
        new Error("Table for authors is not in this query's from/join"),
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
      const [a, b] = tables(Author, Book);
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [{ inner: b, on: b.author_id.eq(a.id) }],
        groupBy: [a.first_name],
        select: { name: a.first_name, bookCount: b.id.count() },
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
      const [a] = tables(Author);
      const [row] = await em.query({
        from: a,
        select: {
          total: a.id.count(),
          distinctNames: a.first_name.countDistinct(),
          sumAge: a.age.sum(),
          avgAge: a.age.avg(),
          minAge: a.age.min(),
          maxAge: a.age.max(),
          names: a.first_name.stringAgg(", "),
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

    it("returns zero counts and null aggregates when no Authors match", async () => {
      // Given a persisted Author outside the requested name filter
      await insertAuthor({ first_name: "Other" });
      const em = newEntityManager();
      const a = table(Author);
      // When aggregating an empty result over a physically required derived count
      const rows = await em.query({
        from: a,
        where: a.first_name.eq("Missing"),
        select: {
          count: a.number_of_books.count(),
          distinct: a.number_of_books.countDistinct(),
          sum: a.number_of_books.sum(),
          avg: a.number_of_books.avg(),
          min: a.number_of_books.min(),
          max: a.number_of_books.max(),
          array: a.number_of_books.arrayAgg(),
          names: a.first_name.stringAgg(","),
        },
      });
      // Then PostgreSQL's empty-input results survive decoding without hydration
      expect(rows).toEqual([
        { count: 0, distinct: 0, sum: null, avg: null, min: null, max: null, array: null, names: null },
      ]);
      expect(em.entities).toEqual([]);
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
      const [a, b] = tables(Author, Book);
      const rows = await em.query({
        from: a,
        join: [{ inner: b, on: b.author_id.eq(a.id) }],
        groupBy: [a.first_name],
        having: { and: [b.id.count().gt(1)] },
        select: { name: a.first_name, bookCount: b.id.count() },
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
      const [a, b] = tables(Author, Book);
      const rows = await em.query({
        from: a,
        join: [{ inner: b, on: b.author_id.eq(a.id) }],
        where: { and: [a.first_name.nin(["a2"])] },
        groupBy: [a.first_name],
        select: { name: a.first_name, titles: b.title.arrayAgg(), bookIds: b.id.arrayAgg() },
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
      const [a, b] = tables(Author, Book);
      const rows = await em.query({
        from: a,
        join: [a.books.as(b)],
        groupBy: [a.id],
        select: {
          name: a.first_name,
          titles: b.title.arrayAgg(),
          fallback: query({ from: b, where: b.author_id.eq(a.id), select: b.id.arrayAgg().coalesce(["b:9"]) }),
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
      const [a, b] = tables(Author, Book);
      const authors = await em.query({
        from: a,
        join: [{ inner: b, on: b.author_id.eq(a.id) }],
        groupBy: [a.id],
        select: a,
        orderBy: [{ desc: b.id.count() }],
      });
      expect(authors).toMatchEntity([{ firstName: "a2" }, { firstName: "a1" }]);
    });
  });

  describe("pruning", () => {
    it("encodes both between bounds and expands search words", async () => {
      // Given an Author at the lower BookRange bound with separated search words
      await insertAuthor({ first_name: "Alice Mary Smith", range_of_books: 1 });
      // And an Author at the upper bound with differently cased search words
      await insertAuthor({ first_name: "ALICE SMITH", range_of_books: 2 });
      // And an Author inside the range whose name does not match the search
      await insertAuthor({ first_name: "Bob Smith", range_of_books: 1 });
      // And an Author matching the search but without a BookRange, excluded by between
      await insertAuthor({ first_name: "Alice Smith" });
      const em = newEntityManager();
      const a = table(Author);
      resetQueryCount();
      const rows = await em.query({
        from: a,
        where: { and: [a.range_of_books.between(BookRange.Few, BookRange.Lot), a.first_name.search("alice smith")] },
        select: a.first_name,
        orderBy: [{ asc: a.id }],
      });
      expect(rows).toEqual(["Alice Mary Smith", "ALICE SMITH"]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS value FROM authors AS a WHERE (a.range_of_books BETWEEN $1 AND $2 AND a.first_name ILIKE $3) AND a.deleted_at IS NULL ORDER BY a.id ASC",
       ]
      `);
    });

    it("encodes enum array operators and compares array columns without encoding them", async () => {
      // Given an Author whose colors contain both requested colors
      await insertAuthor({ first_name: "Both", favorite_colors: [1, 2] });
      // And an Author whose colors overlap but do not contain both colors
      await insertAuthor({ first_name: "Red", favorite_colors: [1], mentor_id: 1 });
      // And an Author with no overlapping colors
      await insertAuthor({ first_name: "Empty", favorite_colors: [], mentor_id: 1 });
      const em = newEntityManager();
      const a = table(Author);
      const m = table(Author, "mentor");
      resetQueryCount();
      const contains = await em.query({
        from: a,
        where: a.favorite_colors.contains([Color.Red, Color.Green]),
        select: a.first_name,
      });
      const ncontains = await em.query({
        from: a,
        where: a.favorite_colors.ncontains([Color.Red, Color.Green]),
        select: a.first_name,
        orderBy: [{ asc: a.id }],
      });
      const overlaps = await em.query({
        from: a,
        where: a.favorite_colors.overlaps([Color.Green]),
        select: a.first_name,
      });
      const noverlaps = await em.query({
        from: a,
        where: a.favorite_colors.noverlaps([Color.Green]),
        select: a.first_name,
        orderBy: [{ asc: a.id }],
      });
      expect(contains).toEqual(["Both"]);
      expect(ncontains).toEqual(["Red", "Empty"]);
      expect(overlaps).toEqual(["Both"]);
      expect(noverlaps).toEqual(["Red", "Empty"]);
      const containingMentor = await em.query({
        from: a,
        join: [a.mentor.inner(m)],
        where: m.favorite_colors.contains(a.favorite_colors),
        select: a.first_name,
        orderBy: [{ asc: a.id }],
      });
      const notContainingMentor = await em.query({
        from: a,
        join: [a.mentor.inner(m)],
        where: a.favorite_colors.ncontains(m.favorite_colors),
        select: a.first_name,
        orderBy: [{ asc: a.id }],
      });
      const overlappingMentor = await em.query({
        from: a,
        join: [a.mentor.inner(m)],
        where: a.favorite_colors.overlaps(m.favorite_colors),
        select: a.first_name,
      });
      const notOverlappingMentor = await em.query({
        from: a,
        join: [a.mentor.inner(m)],
        where: a.favorite_colors.noverlaps(m.favorite_colors),
        select: a.first_name,
      });
      expect(containingMentor).toEqual(["Red", "Empty"]);
      expect(notContainingMentor).toEqual(["Red", "Empty"]);
      expect(overlappingMentor).toEqual(["Red"]);
      expect(notOverlappingMentor).toEqual(["Empty"]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS value FROM authors AS a WHERE a.favorite_colors @> $1 AND a.deleted_at IS NULL",
         "SELECT a.first_name AS value FROM authors AS a WHERE NOT (a.favorite_colors @> $1) AND a.deleted_at IS NULL ORDER BY a.id ASC",
         "SELECT a.first_name AS value FROM authors AS a WHERE a.favorite_colors && $1 AND a.deleted_at IS NULL",
         "SELECT a.first_name AS value FROM authors AS a WHERE NOT (a.favorite_colors && $1) AND a.deleted_at IS NULL ORDER BY a.id ASC",
         "SELECT a.first_name AS value FROM authors AS a JOIN authors AS a1 ON a.mentor_id = a1.id WHERE a1.favorite_colors @> a.favorite_colors AND a.deleted_at IS NULL ORDER BY a.id ASC",
         "SELECT a.first_name AS value FROM authors AS a JOIN authors AS a1 ON a.mentor_id = a1.id WHERE NOT ((a.favorite_colors @> a1.favorite_colors)) AND a.deleted_at IS NULL ORDER BY a.id ASC",
         "SELECT a.first_name AS value FROM authors AS a JOIN authors AS a1 ON a.mentor_id = a1.id WHERE a.favorite_colors && a1.favorite_colors AND a.deleted_at IS NULL",
         "SELECT a.first_name AS value FROM authors AS a JOIN authors AS a1 ON a.mentor_id = a1.id WHERE NOT ((a.favorite_colors && a1.favorite_colors)) AND a.deleted_at IS NULL",
       ]
      `);
    });

    it("rewrites array in to containment and rejects array nin before SQL", async () => {
      // Given an Author whose colors contain both requested colors
      await insertAuthor({ first_name: "Both", favorite_colors: [1, 2] });
      // And an Author with only one requested color, which overlap semantics would incorrectly include
      await insertAuthor({ first_name: "Red", favorite_colors: [1] });
      const em = newEntityManager();
      const a = table(Author);
      resetQueryCount();
      const rows = await em.query({
        from: a,
        // @ts-expect-error The legacy array IN rewrite takes elements, not the declared array-of-arrays.
        where: a.favorite_colors.in([Color.Red, Color.Green]),
        select: a.first_name,
      });
      expect(rows).toEqual(["Both"]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS value FROM authors AS a WHERE a.favorite_colors @> $1 AND a.deleted_at IS NULL",
       ]
      `);
      resetQueryCount();
      expect(() => a.favorite_colors.nin([[Color.Red]])).toThrow(
        "The nin operator is not supported on array columns yet",
      );
      expect(queries).toMatchInlineSnapshot(`[]`);
    });

    it("bypasses the address codec for JSON paths and containment operands", async () => {
      // Given an Author whose stored JSON includes a key that AddressSchema strips
      await insertAuthor({ first_name: "Selected", business_address: { street: "Main", extra: "kept" } });
      // And an Author with the same valid street but a different extra value
      await insertAuthor({ first_name: "Other", business_address: { street: "Main", extra: "other" } });
      const em = newEntityManager();
      const a = table(Author);
      resetQueryCount();
      const exists = await em.query({
        from: a,
        where: a.business_address.pathExists('$.extra ? (@ == "kept")'),
        select: a.first_name,
      });
      const isTrue = await em.query({
        from: a,
        where: a.business_address.pathIsTrue('$.extra == "kept"'),
        select: a.first_name,
      });
      const contains = await em.query({
        from: a,
        where: a.business_address.contains('{"extra":"kept"}'),
        select: a.first_name,
      });
      const ncontains = await em.query({
        from: a,
        where: a.business_address.ncontains('{"extra":"kept"}'),
        select: a.first_name,
      });
      expect(exists).toEqual(["Selected"]);
      expect(isTrue).toEqual(["Selected"]);
      expect(contains).toEqual(["Selected"]);
      expect(ncontains).toEqual(["Other"]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS value FROM authors AS a WHERE a.business_address @? $1 AND a.deleted_at IS NULL",
         "SELECT a.first_name AS value FROM authors AS a WHERE a.business_address @@ $1 AND a.deleted_at IS NULL",
         "SELECT a.first_name AS value FROM authors AS a WHERE a.business_address @> $1 AND a.deleted_at IS NULL",
         "SELECT a.first_name AS value FROM authors AS a WHERE NOT (a.business_address @> $1) AND a.deleted_at IS NULL",
       ]
      `);
    });

    it("keeps a CTI relationship chain for its subtype predicate and prunes omitted filters", async () => {
      // Given a SmallPublisher whose city is stored on small_publishers
      await insertPublisher({ name: "Selected", city: "sf" });
      // And an Author referencing that SmallPublisher
      await insertAuthor({ first_name: "Published", publisher_id: 1 });
      // And an Author without a Publisher, excluded only when the city predicate survives
      await insertAuthor({ first_name: "Unpublished" });
      const em = newEntityManager();
      const [a, p, sp] = tables(Author, Publisher, SmallPublisher);
      resetQueryCount();
      const filtered = await em.query({
        from: a,
        join: [a.publisher.as(p), p.smallPublisher(sp)],
        where: sp.city.eq("sf"),
        select: a.first_name,
      });
      const omitted = await em.query({
        from: a,
        join: [a.publisher.as(p), p.smallPublisher(sp)],
        where: { and: [sp.city.eq(undefined), sp.city.search(""), sp.city.between(undefined, "Z")] },
        select: a.first_name,
        orderBy: [{ asc: a.id }],
      });
      const prunedGroup = await em.query({
        from: a,
        join: [a.publisher.as(p), p.smallPublisher(sp)],
        where: { and: [sp.city.eq("sf"), sp.city.search(undefined)], pruneIfUndefined: "any" },
        select: a.first_name,
        orderBy: [{ asc: a.id }],
      });
      expect(filtered).toEqual(["Published"]);
      expect(omitted).toEqual(["Published", "Unpublished"]);
      expect(prunedGroup).toEqual(["Published", "Unpublished"]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS value FROM authors AS a LEFT OUTER JOIN publishers AS p ON a.publisher_id = p.id LEFT OUTER JOIN small_publishers AS sp ON p.id = sp.id WHERE sp.city = $1 AND a.deleted_at IS NULL",
         "SELECT a.first_name AS value FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY a.id ASC",
         "SELECT a.first_name AS value FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY a.id ASC",
       ]
      `);
    });

    it("distinguishes null, empty, and omitted Author enum lists", async () => {
      // Given an Author with a stored BookRange enum id
      await insertAuthor({ first_name: "Few", range_of_books: 1 });
      // And another Author has a different enum id
      await insertAuthor({ first_name: "Many", range_of_books: 2 });
      // And an Author has SQL NULL rather than a BookRange value
      await insertAuthor({ first_name: "Unset" });
      const em = newEntityManager();
      const a = table(Author);
      resetQueryCount();
      // When comparing nulls and lists through the real enum column codec
      const absent = await em.query({ from: a, where: a.range_of_books.eq(null), select: a.first_name });
      const present = await em.query({
        from: a,
        where: a.range_of_books.ne(null),
        select: a.first_name,
        orderBy: [{ asc: a.id }],
      });
      const included = await em.query({
        from: a,
        where: a.range_of_books.in([BookRange.Few, null]),
        select: a.first_name,
        orderBy: [{ asc: a.id }],
      });
      const excluded = await em.query({
        from: a,
        where: a.range_of_books.nin([BookRange.Few, null]),
        select: a.first_name,
      });
      const empty = await em.query({ from: a, where: a.range_of_books.in([]), select: a.first_name });
      const notEmpty = await em.query({ from: a, where: a.range_of_books.nin([]), select: a.id.count() });
      const omitted = await em.query({ from: a, where: a.range_of_books.in(undefined), select: a.id.count() });
      // Then IN includes unset ranges, while NOT IN removes null operands and excludes unset ranges
      expect(absent).toEqual(["Unset"]);
      expect(present).toEqual(["Few", "Many"]);
      expect(included).toEqual(["Few", "Unset"]);
      expect(excluded).toEqual(["Many"]);
      expect(empty).toEqual([]);
      expect(notEmpty).toEqual([3]);
      expect(omitted).toEqual([3]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS value FROM authors AS a WHERE a.range_of_books IS NULL AND a.deleted_at IS NULL",
         "SELECT a.first_name AS value FROM authors AS a WHERE a.range_of_books IS NOT NULL AND a.deleted_at IS NULL ORDER BY a.id ASC",
         "SELECT a.first_name AS value FROM authors AS a WHERE (a.range_of_books IS NULL OR a.range_of_books = ANY($1)) AND a.deleted_at IS NULL ORDER BY a.id ASC",
         "SELECT a.first_name AS value FROM authors AS a WHERE a.range_of_books != ALL($1) AND a.deleted_at IS NULL",
         "SELECT a.first_name AS value FROM authors AS a WHERE a.range_of_books = ANY($1) AND a.deleted_at IS NULL",
         "SELECT count(a.id)::int AS value FROM authors AS a WHERE a.range_of_books != ALL($1) AND a.deleted_at IS NULL",
         "SELECT count(a.id)::int AS value FROM authors AS a WHERE a.deleted_at IS NULL",
       ]
      `);
    });

    it("encodes custom PasswordValue lists without passing nulls to the codec", async () => {
      // Given a User with a password stored as encoded text
      const password = PasswordValue.fromPlainText("secret");
      await insertUser({ name: "Selected", password: password.encoded });
      // And another User has a different encoded password
      await insertUser({ name: "Other", password: PasswordValue.fromPlainText("other").encoded });
      // And a third User starts with the fixture's default password
      await insertUser({ name: "Unset" });
      // And its password is SQL NULL instead of encoded text
      await update("users", { id: 3, password: null });
      const em = newEntityManager();
      const u = table(User);
      resetQueryCount();
      // When filtering by domain objects and SQL NULL through the custom column
      const included = await em.query({
        from: u,
        where: u.password.in([password, null]),
        select: u.name,
        orderBy: [{ asc: u.id }],
      });
      const excluded = await em.query({ from: u, where: u.password.nin([password]), select: u.name });
      const absent = await em.query({ from: u, where: u.password.eq(null), select: u.name });
      // Then each non-null operand is encoded while NULL remains a SQL value
      expect(included).toEqual(["Selected", "Unset"]);
      expect(excluded).toEqual(["Other"]);
      expect(absent).toEqual(["Unset"]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT u.name AS value FROM users AS u WHERE u.password IS NULL OR u.password = ANY($1) ORDER BY u.id ASC",
         "SELECT u.name AS value FROM users AS u WHERE u.password != ALL($1)",
         "SELECT u.name AS value FROM users AS u WHERE u.password IS NULL",
       ]
      `);
    });

    it("resolves a frozen Author id list independently in outer and inner scopes", async () => {
      // Given an Author selected by a tagged-id list
      await insertAuthor({ first_name: "Selected" });
      // And another Author must not leak into either use of the list
      await insertAuthor({ first_name: "Other" });
      const em = newEntityManager();
      const a = table(Author);
      // And both scopes share the exact same immutable table predicate and table handle
      const where = Object.freeze(a.id.in(Object.freeze(["a:1"]))!);
      const count = query({ from: a, where, select: a.id.count() });
      resetQueryCount();
      // When resolving the shared predicate in two scopes and then using it alone again
      const nested = await em.query({ from: a, where, select: { id: a.id, count } });
      const again = await em.query({ from: a, where, select: a.id });
      // Then neither scope captures the other's SQL alias or double-encodes the tagged id
      expect(nested).toEqual([{ id: "a:1", count: 1 }]);
      expect(again).toEqual(["a:1"]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.id AS id, (SELECT count(a1.id)::int AS value FROM authors AS a1 WHERE a1.id = ANY($1) AND a1.deleted_at IS NULL) AS "count" FROM authors AS a WHERE a.id = ANY($2) AND a.deleted_at IS NULL",
         "SELECT a.id AS value FROM authors AS a WHERE a.id = ANY($1) AND a.deleted_at IS NULL",
       ]
      `);
    });

    it.each(["where", "having", "join", "template"] as const)(
      "rejects domain alias conditions in SQL %s before execution",
      async (clause) => {
        // Given a persisted Author that a domain alias can find
        await insertAuthor({ first_name: "Selected" });
        const em = newEntityManager();
        const a = table(Author);
        const b = table(Book);
        // And the domain condition is already bound by em.find, not merely an unresolved alias
        const domain = alias(Author);
        const condition = domain.firstName.eq("Selected");
        expect(await em.find(Author, { as: domain }, { conditions: { and: [condition] } })).toMatchEntity([
          { firstName: "Selected" },
        ]);
        resetQueryCount();
        // When the find-only condition is reused in an otherwise SQL-shaped query
        const clauses =
          clause === "where"
            ? { where: { and: [a.id.eq("a:1"), condition] } }
            : clause === "having"
              ? { groupBy: [a.id], having: condition }
              : clause === "join"
                ? { join: [{ inner: b, on: condition, keep: true }] }
                : { where: sql.condition`${condition}` };
        // Then every SQL condition entry point rejects the domain alias before issuing SQL
        await expect(em.query({ from: a, ...clauses, select: a.id })).rejects.toThrow(
          "Domain alias conditions are only supported by em.find; use table(...) predicates in SQL queries and mutations.",
        );
        expect(queries).toMatchInlineSnapshot(`[]`);
      },
    );

    it("accepts a single bare condition for where and having", async () => {
      // Given Author a1 below the age threshold and without Books
      await insertAuthor({ first_name: "a1", age: 20 });
      // And Author a2 above the age threshold
      await insertAuthor({ first_name: "a2", age: 40 });
      // And a Book for a2, so it passes both the age filter and the positive Book count filter
      await insertBook({ title: "b1", author_id: 2 });
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      resetQueryCount();
      // No `{ and: [...] }` wrapper needed for a single condition, in `where` or `having`
      const rows = await em.query({
        from: a,
        join: [a.books.inner(b)],
        where: a.age.gte(30),
        groupBy: [a.first_name],
        having: b.id.count().gt(0),
        select: { name: a.first_name },
      });
      expect(rows).toEqual([{ name: "a2" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS name FROM authors AS a JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE a.age >= $1 AND a.deleted_at IS NULL GROUP BY a.first_name HAVING count(b.id)::int > $2",
       ]
      `);
    });

    it("reuses frozen read predicates without resolving the caller's conditions in place", async () => {
      // Given an Author selected by the reusable report
      await insertAuthor({ first_name: "Alice" });
      // And another Author that must remain outside its predicates
      await insertAuthor({ first_name: "Bob" });
      const em = newEntityManager();
      const a = table(Author);
      // And immutable ID, cross-column, raw, template, and optional predicates
      const where = {
        and: [
          Object.freeze(a.id.eq("a:1")!),
          Object.freeze(a.id.eq(a.id)!),
          Object.freeze(a.first_name.raw("LIKE ?", ["A%"])),
          Object.freeze(sql.condition`${a.first_name} = ${"Alice"}`!),
          a.id.eq(undefined),
        ],
      };
      Object.freeze(where.and);
      Object.freeze(where);
      // And a frozen aggregate predicate and report root
      const report = Object.freeze({
        from: a,
        where,
        having: Object.freeze(a.id.count().eq(1)!),
        select: Object.freeze({ count: a.id.count() }),
      });
      // When executing the same report twice
      const first = await em.query(report);
      const second = await em.query(report);
      // Then all predicates remain usable and the result stays a decoded POJO
      expect(first).toEqual([{ count: 1 }]);
      expect(second).toEqual(first);
      expect(em.entities).toEqual([]);
    });

    it("prunes a bare where condition given undefined", async () => {
      // Given an Author that should remain when no name filter is supplied
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const [a] = tables(Author);
      // And an absent name filter, rather than a filter for a null name
      const nameFilter: string | undefined = undefined;
      const rows = await em.query({ from: a, where: a.first_name.eq(nameFilter), select: { name: a.first_name } });
      expect(rows).toEqual([{ name: "a1" }]);
    });

    it("prunes undefined conditions", async () => {
      // Given two Authors with different names, both of which should remain without a name filter
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      const em = newEntityManager();
      const [a] = tables(Author);
      // And an absent name filter inside the AND condition
      const nameFilter: string | undefined = undefined;
      resetQueryCount();
      const rows = await em.query({
        from: a,
        where: { and: [a.first_name.eq(nameFilter)] },
        select: { name: a.first_name },
        orderBy: [{ asc: a.first_name }],
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
      const [a, b] = tables(Author, Book);
      // And an absent Book title filter, removing the join's only reference
      const titleFilter: string | undefined = undefined;
      resetQueryCount();
      // The join is declared unconditionally; its only reference is the pruned condition
      const rows = await em.query({
        from: a,
        join: [{ inner: b, on: b.author_id.eq(a.id) }],
        where: { and: [b.title.eq(titleFilter)] },
        select: { name: a.first_name },
        orderBy: [{ asc: a.first_name }],
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
        join: [{ inner: b, on: b.author_id.eq(a.id) }],
        where: { and: [b.title.eq("b1")] },
        select: { name: a.first_name },
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
      const [a] = tables(Author);
      // And an Author subquery named like a physical CTI alias (sp_b0); these aliases are tracked
      // explicitly, so pruning must not credit its references to a phantom "book" alias
      const sub = query({ from: a, select: { id: a.id, name: a.first_name }, as: "book_b0" });
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
      const a = table(Author);
      // And a subquery whose name matches the old unresolved-alias placeholder
      const sub = query({ from: a, select: { name: a.first_name }, as: "unset" });
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
      const [a, b] = tables(Author, Book);
      // An inner join used as an existence filter would otherwise prune
      const rows = await em.query({
        from: a,
        join: [{ inner: b, on: b.author_id.eq(a.id), keep: true }],
        select: { name: a.first_name },
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
      const [a, b] = tables(Author, Book);
      const rows = await em.query({
        from: a,
        join: [{ inner: b, on: b.author_id.eq(a.id) }],
        select: { name: a.first_name },
        pruneJoins: false,
      });
      expect(rows).toEqual([{ name: "a1" }]);
    });

    it("fails when a referenced join has no on condition left", async () => {
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      // Given an absent Author id that prunes the Book join's entire ON condition
      const authorId: string | undefined = undefined;
      // And an invalid query that still selects the Book title, so the conditionless join cannot prune
      await expect(
        em.query({ from: a, join: [{ inner: b, on: b.author_id.eq(authorId) }], select: { title: b.title } }),
      ).rejects.toThrow(
        new Error("Join Table for books has no ON condition left (they all pruned), but the query still references it"),
      );
    });

    it("rejects a join whose ON references a later join", async () => {
      const em = newEntityManager();
      const [a, b, br] = tables(Author, Book, BookReview);
      // Given an invalid join order: BookReview's ON needs Book before the Book join is in scope
      await expect(
        em.query({
          from: a,
          join: [
            { left: br, on: br.book_id.eq(b.id) },
            { left: b, on: b.author_id.eq(a.id) },
          ],
          select: { rating: br.rating },
        }),
      ).rejects.toThrow(
        new Error(
          "Join Table for book_reviews references 'b', which is joined later; move that join earlier in the join array",
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
      const [a, b, br, c] = tables(Author, Book, BookReview, Comment);
      // And a minimum BookReview rating that keeps both the BookReview and its Book join
      const minRating: number | undefined = 4;
      // And no Comment text filter, so the Comment join is unused despite having a matching row
      const commentText: string | undefined = undefined;
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [
          { left: b, on: b.author_id.eq(a.id) },
          { left: br, on: br.book_id.eq(b.id) },
          { left: c, on: c.parent.eq(a.id) },
        ],
        where: { and: [br.rating.gte(minRating), c.text.eq(commentText)] },
        distinct: true,
        select: { name: a.first_name },
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
    it.each(["object", "array"])("can order by select keys with the %s form", async (form) => {
      // Given Authors a1 and a2 as separate aggregate groups
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And Author a0 inserted last, whose name sorts before both other Authors
      await insertAuthor({ first_name: "a0" });
      // And two Books for a1
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      // And one Book for a2, giving the selected bookCount key distinct values to sort
      await insertBook({ title: "b3", author_id: 2 });
      // And one Book for a0, tying a2's count so name must break the tie without overriding count
      await insertBook({ title: "b4", author_id: 3 });
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [{ inner: b, on: b.author_id.eq(a.id) }],
        groupBy: [a.first_name],
        select: { name: a.first_name, bookCount: b.id.count() },
        orderBy:
          form === "object"
            ? { bookCount: "DESC", name: "ASC NULLS LAST" }
            : [{ bookCount: "DESC" }, { name: "ASC NULLS LAST" }],
      });
      expect(rows).toEqual([
        { name: "a1", bookCount: 2 },
        { name: "a0", bookCount: 1 },
        { name: "a2", bookCount: 1 },
      ]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS name, count(b.id)::int AS "bookCount" FROM authors AS a JOIN books AS b ON b.author_id = a.id WHERE a.deleted_at IS NULL GROUP BY a.first_name ORDER BY "bookCount" DESC, name ASC NULLS LAST",
       ]
      `);
    });

    it.each(["object", "array"])("can order entities with the keyed %s form", async (form) => {
      // Given Authors inserted in ascending name order, opposite to the requested sort
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      const em = newEntityManager();
      const [a] = tables(Author);
      const authors = await em.query({
        from: a,
        select: a,
        orderBy: form === "object" ? { first_name: "DESC" } : [{ first_name: "DESC" }],
      });
      expect(authors).toMatchEntity([{ firstName: "a2" }, { firstName: "a1" }]);
    });

    it.each(["object", "array"])("prunes keyed orderBy entries given undefined in the %s form", async (form) => {
      // Given Authors inserted in reverse name order with null ages
      await insertAuthor({ first_name: "a2" });
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const [a] = tables(Author);
      // And an absent age sort, with undefined and empty array entries also leaving name as the only ordering key
      const byAge: "ASC" | undefined = undefined;
      resetQueryCount();
      const rows = await em.query({
        from: a,
        select: { name: a.first_name, age: a.age },
        orderBy: form === "object" ? { age: byAge, name: "ASC" } : [undefined, {}, { age: byAge }, { name: "ASC" }],
      });
      expect(rows).toEqual([
        { name: "a1", age: null },
        { name: "a2", age: null },
      ]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS name, a.age AS age FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY name ASC",
       ]
      `);
    });

    it.each(["object", "array"])("rejects an orderBy key not in select in the %s form", async (form) => {
      const em = newEntityManager();
      const [a] = tables(Author);
      // Given an invalid lastName sort key when the Author projection exposes only name
      await expect(
        em.query({
          from: a,
          select: { name: a.first_name },
          orderBy: (form === "object" ? { lastName: "ASC" } : [{ lastName: "ASC" }]) as any,
        }),
      ).rejects.toThrow(new Error("orderBy key 'lastName' is not a key of select"));
    });

    it("rejects an invalid orderBy nulls", async () => {
      const em = newEntityManager();
      const [a] = tables(Author);
      // Given SQL punctuation in the Author name sort's nulls option instead of first or last
      await expect(
        em.query({
          from: a,
          select: { name: a.first_name },
          orderBy: [{ asc: a.first_name, nulls: "last;--" as any }],
        }),
      ).rejects.toThrow(new Error("Invalid orderBy nulls 'last;--'"));
    });

    it.each(["object", "array"])("rejects an invalid orderBy direction in the %s form", async (form) => {
      const em = newEntityManager();
      const [a] = tables(Author);
      // Given an injected SQL fragment instead of a valid direction for the Author name sort
      await expect(
        em.query({
          from: a,
          select: { name: a.first_name },
          orderBy: form === "object" ? { name: "ASC; DROP TABLE" as any } : [{ name: "ASC; DROP TABLE" as any }],
        }),
      ).rejects.toThrow(new Error("Invalid orderBy direction 'ASC; DROP TABLE'"));
    });

    it("mixes keyed and expression ordering while keeping a join referenced only by orderBy", async () => {
      // Given Author a1 aged 20 whose Book sorts last by title
      await insertAuthor({ first_name: "a1", age: 20 });
      await insertBook({ title: "b3", author_id: 1 });
      // And Author a2 of the same age whose Book sorts before a1's, breaking the age tie
      await insertAuthor({ first_name: "a2", age: 20 });
      await insertBook({ title: "b2", author_id: 2 });
      // And an older Author a3 whose Book sorts first by title, so age must take precedence
      await insertAuthor({ first_name: "a3", age: 30 });
      await insertBook({ title: "b1", author_id: 3 });
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [{ left: b, on: b.author_id.eq(a.id) }],
        select: { name: a.first_name, age: a.age },
        orderBy: [{ age: "ASC" }, { asc: b.title }],
      });
      expect(rows).toEqual([
        { name: "a2", age: 20 },
        { name: "a1", age: 20 },
        { name: "a3", age: 30 },
      ]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS name, a.age AS age FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id WHERE a.deleted_at IS NULL ORDER BY age ASC, b.title ASC",
       ]
      `);
    });

    it("orders select keys named asc, desc, and nulls as keyed array entries", async () => {
      // Given Author a1 aged 20
      await insertAuthor({ first_name: "a1", age: 20 });
      // And another Author named a1 of the same age, so descending id must break the tie
      await insertAuthor({ first_name: "a1", age: 20 });
      // And Author a2 of the same age, whose name must sort after both Authors named a1
      await insertAuthor({ first_name: "a2", age: 20 });
      // And younger Author a0, whose earlier name must not override descending age
      await insertAuthor({ first_name: "a0", age: 10 });
      const em = newEntityManager();
      const [a] = tables(Author);
      resetQueryCount();
      const rows = await em.query({
        from: a,
        select: { asc: a.age, desc: a.first_name, nulls: a.id },
        orderBy: [{ asc: "DESC" }, { desc: "ASC" }, { nulls: "DESC" }],
      });
      expect(rows).toEqual([
        { asc: 20, desc: "a1", nulls: "a:2" },
        { asc: 20, desc: "a1", nulls: "a:1" },
        { asc: 20, desc: "a2", nulls: "a:3" },
        { asc: 10, desc: "a0", nulls: "a:4" },
      ]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.age AS "asc", a.first_name AS "desc", a.id AS nulls FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY "asc" DESC, "desc" ASC, nulls DESC",
       ]
      `);
    });

    it.each(["limit", "offset"] as const)("rejects invalid read %s before SQL", async (key) => {
      // Given a real Author read at an unchecked application boundary
      const em = newEntityManager();
      const read = em.query.bind(em) as (input: unknown) => Promise<unknown[]>;
      const a = table(Author);
      const source = { from: a, select: { name: a.first_name } };
      // And pagination values that are not nonnegative finite integers
      const invalid = [-1, 0.5, NaN, Infinity, null, "1"];
      // When paginating ordinary reads and nested compound operands
      for (const value of invalid) {
        await expect(read({ ...source, [key]: value })).rejects.toThrow(
          `Read query ${key} must be a nonnegative finite integer`,
        );
        await expect(read({ unionAll: [source, { ...source, [key]: value }] })).rejects.toThrow(
          `Read query ${key} must be a nonnegative finite integer`,
        );
      }
      // Then no malformed pagination reaches PostgreSQL
      expect(queries).toEqual([]);
    });

    it("accepts zero pagination and explicit false read flags", async () => {
      // Given an Author that an unpaginated read would return
      await insertAuthor({ first_name: "Alice" });
      const em = newEntityManager();
      const a = table(Author);
      // And explicit false flags and a zero offset on the read
      const source = {
        from: a,
        select: { name: a.first_name },
        offset: 0,
        distinct: false,
        pruneJoins: false,
        softDeletes: "include",
      } as const;
      // When zero LIMIT is used on an ordinary or compound read
      expect(await em.query({ ...source, limit: 0 })).toEqual([]);
      expect(await em.query({ unionAll: [source, source], limit: 0, offset: 0 })).toEqual([]);
      // Then zero OFFSET and false flags alone do not suppress the Author
      expect(await em.query(source)).toEqual([{ name: "Alice" }]);
    });

    it("can order with nulls last, limit, and offset", async () => {
      // Given Author a1 with a known age
      await insertAuthor({ first_name: "a1", age: 10 });
      // And Author a2 with null age, which must sort last by age but second by name
      await insertAuthor({ first_name: "a2" });
      // And an older Author a3, which sorts before a1 by descending age
      await insertAuthor({ first_name: "a3", age: 20 });
      const em = newEntityManager();
      const [a] = tables(Author);
      const rows = await em.query({
        from: a,
        select: { name: a.first_name },
        orderBy: [{ desc: a.age, nulls: "last" }, { asc: a.first_name }],
      });
      expect(rows).toEqual([{ name: "a3" }, { name: "a1" }, { name: "a2" }]);
      const page = await em.query({
        from: a,
        select: { name: a.first_name },
        orderBy: [{ asc: a.first_name }],
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
      const [a] = tables(Author);
      // And a disabled secondary name sort, leaving an undefined orderBy entry to prune
      const secondary: boolean = false;
      const rows = await em.query({
        from: a,
        select: { name: a.first_name },
        orderBy: [{ desc: sql<number>`${a.age} * 2` }, secondary ? { asc: a.first_name } : undefined],
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
      const [p] = tables(Publisher);
      const rows = await em.query({
        from: p,
        distinct: true,
        select: { size: p.size_id },
        orderBy: [{ asc: p.size_id }],
      });
      expect(rows).toEqual([{ size: PublisherSize.Small }, { size: PublisherSize.Large }]);
    });
  });

  describe("composition", () => {
    it("preserves named outputs with keyed orderBy arrays in a derived table and its outer query", async () => {
      // Given Author a2 aged 40, outside the first two Authors by name despite being the oldest
      await insertAuthor({ first_name: "a2", age: 40 });
      // And Author a1 aged 30, inside the name-ordered page and first by descending age
      await insertAuthor({ first_name: "a1", age: 30 });
      // And Author a0 aged 20, first by name but last by descending age
      await insertAuthor({ first_name: "a0", age: 20 });
      const em = newEntityManager();
      const [a] = tables(Author);
      // And a derived table exposing named outputs for the first two Authors by name
      const sub = query({
        from: a,
        select: { authorId: a.id, name: a.first_name, age: a.age },
        orderBy: [{ name: "ASC" }],
        limit: 2,
        as: "author_page",
      });
      resetQueryCount();
      const rows = await em.query({ from: sub, select: sub, orderBy: [{ age: "DESC" }] });
      expect(rows).toEqual([
        { authorId: "a:2", name: "a1", age: 30 },
        { authorId: "a:3", name: "a0", age: 20 },
      ]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT author_page."authorId" AS "authorId", author_page.name AS name, author_page.age AS age FROM (SELECT a.id AS "authorId", a.first_name AS name, a.age AS age FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY name ASC LIMIT $1) AS author_page ORDER BY age DESC",
       ]
      `);
    });

    it("can left join a subquery and coalesce its columns", async () => {
      // Given Authors a1 and a2, with a2 left without Books or a matching aggregate row
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And two Books for a1, producing a count and maximum title in the aggregate row
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      // And Book statistics grouped by Author, so a2 needs the outer query's count fallback
      const bookStats = query({
        from: b,
        groupBy: [b.author_id],
        select: { authorId: b.author_id, bookCount: b.id.count(), lastTitle: b.title.max() },
        as: "book_stats",
      });
      resetQueryCount();
      const rows = await em.query({
        from: a,
        join: [{ left: bookStats, on: bookStats.authorId.eq(a.id) }],
        select: { name: a.first_name, bookCount: bookStats.bookCount.coalesce(0), lastTitle: bookStats.lastTitle },
        orderBy: [{ asc: a.first_name }],
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
      const [b] = tables(Book);
      // And an aggregate subquery exposing each Author's Book count
      const bookStats = query({
        from: b,
        groupBy: [b.author_id],
        select: { authorId: b.author_id, bookCount: b.id.count() },
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
      const [a, b] = tables(Author, Book);
      // And a frozen reusable Book count subquery correlated to the outer Author alias
      const cnt = query(Object.freeze({ from: b, where: Object.freeze(b.author_id.eq(a.id)!), select: b.id.count() }));
      // And a separate Book alias for an outer join in the second query
      const b2 = table(Book, "b2");
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
      const [a, b, br] = tables(Author, Book, BookReview);
      // The outer b join's only reference is the correlated cross-column condition inside the scalar
      // subquery; that correlation must count as a use, or pruning drops the join it depends on
      const rows = await em.query({
        from: a,
        join: [a.books.as(b)],
        select: { name: a.first_name, reviews: query({ from: br, where: br.book_id.eq(b.id), select: br.id.count() }) },
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
      const [a, b] = tables(Author, Book);
      const rows = await em.query({
        from: a,
        select: {
          name: a.first_name,
          // The subquery closes over `a`; count returns 0 for no Books, and coalesce removes the scalar's nullable type
          bookCount: query({ from: b, where: { and: [b.author_id.eq(a.id)] }, select: b.id.count() }).coalesce(0),
        },
        orderBy: [{ asc: a.first_name }],
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
      const [a, b] = tables(Author, Book);
      const authors = await em.query({
        from: a,
        where: { and: [a.id.in(query({ from: b, where: { and: [b.title.eq("b1")] }, select: b.author_id }))] },
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
      const [a] = tables(Author);
      // And a shared adult Author filter for both query shapes
      const base = { from: a, where: { and: [a.age.gte(18)] } } satisfies Omit<Query, "select">;
      const page = await em.query({
        ...base,
        select: { name: a.first_name },
        orderBy: [{ asc: a.first_name }],
        limit: 1,
      });
      const [{ total }] = await em.query({ ...base, select: { total: a.id.count() } });
      expect(page).toEqual([{ name: "a1" }]);
      expect(total).toBe(2);
    });

    it("runs a query value the same as its POJO", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const [a] = tables(Author);
      const q = { from: a, select: { name: a.first_name } } satisfies Query;
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
      const [c, a] = tables(Comment, Author);
      resetQueryCount();
      // The subquery's select column (Author's id) picks the parent_author_id component
      const rows = await em.query({
        from: c,
        where: { and: [c.parent.in(query({ from: a, where: { and: [a.first_name.eq("a1")] }, select: a.id }))] },
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
      const [c, b] = tables(Comment, Book);
      // The FK's other side (Author) picks the component: Comments on Authors who have a Book
      const rows = await em.query({
        from: c,
        where: { and: [c.parent.in(query({ from: b, select: b.author_id }))] },
        select: { text: c.text },
      });
      expect(rows).toEqual([{ text: "on a1" }]);
    });

    it("rejects a direct id column as a polymorphic IN subquery", () => {
      // Given a Comment table with a polymorphic parent
      const c = table(Comment);
      // And an Author id column without a scalar subquery
      const a = table(Author);
      // When using the column directly as the polymorphic IN operand
      // Then the predicate requires a subquery selecting the parent ids
      expect(() => c.parent.in(a.id)).toThrow(
        "parent is polymorphic, so `in` needs a subquery selecting an id or FK column",
      );
    });

    it("rejects an in subquery that does not select an id or FK column", () => {
      const [c, b] = tables(Comment, Book);
      // Given an invalid Comment parent target selecting Book titles, which identify no parent component
      // The check runs eagerly, when the condition is built, not when the query runs
      expect(() => c.parent.in(query({ from: b, select: b.title }) as any)).toThrow(
        new Error("parent `in` needs an id or FK column, got title"),
      );
    });
  });

  describe("single table inheritance", () => {
    it("reads the shared STI table without an implicit discriminator", async () => {
      // Given a TaskNew row with its subtype-specific field populated
      await insertTask({ type: "NEW", special_new_field: 1 });
      // And a TaskOld row in the same tasks table, included by the physical TaskNew handle
      await insertTask({ type: "OLD", special_old_field: 2 });
      const em = newEntityManager();
      const tn = table(TaskNew);
      resetQueryCount();
      const tasks = await em.query({
        from: tn,
        select: { id: tn.id, special: tn.special_new_field },
        orderBy: [{ asc: tn.id }],
      });
      expect(tasks).toEqual([
        { id: "task:1", special: 1 },
        { id: "task:2", special: null },
      ]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT t.id AS id, t.special_new_field AS special FROM tasks AS t WHERE t.deleted_at IS NULL ORDER BY t.id ASC",
       ]
      `);
    });

    it("does not implicitly filter an STI relationship target", async () => {
      // Given a TaskNew row
      await insertTask({ id: 1, type: "NEW" });
      // And a TaskItem with a valid newTask reference; the cast supplies the helper's missing new_task_id
      await insertTaskItem({ new_task_id: 1 } as any);
      // And a TaskItem with no newTask, which the left join must retain with a null Task id
      await insertTaskItem({});
      // And a TaskOld row that a drifted new_task_id references instead of a valid TaskNew
      await insertTask({ id: 2, type: "OLD" });
      // And a TaskItem with that drifted reference, which the physical join must still resolve
      await insertTaskItem({ new_task_id: 2 } as any);
      const em = newEntityManager();
      const [ti, tn] = tables(TaskItem, TaskNew);
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
        { item: "ti:3", task: "task:2" },
      ]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT ti.id AS item, t.id AS task FROM task_items AS ti LEFT OUTER JOIN tasks AS t ON ti.new_task_id = t.id ORDER BY item ASC",
       ]
      `);
    });

    it("filters an explicit STI subtype join in ON without dropping other Tasks", async () => {
      // Given a TaskNew row in the base tasks table
      await insertTask({ type: "NEW" });
      // And a TaskOld row in the same table, retained with no matching TaskNew
      await insertTask({ type: "OLD" });
      const em = newEntityManager();
      const [t, tn] = tables(Task, TaskNew);
      resetQueryCount();
      const tasks = await em.query({
        from: t,
        join: [t.taskNew(tn)],
        select: { id: t.id, newId: tn.id },
        orderBy: [{ asc: t.id }],
      });
      expect(tasks).toEqual([
        { id: "task:1", newId: "task:1" },
        { id: "task:2", newId: null },
      ]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT t.id AS id, t1.id AS "newId" FROM tasks AS t LEFT OUTER JOIN tasks AS t1 ON t.id = t1.id AND t1.type_id = $1 WHERE t.deleted_at IS NULL ORDER BY t.id ASC",
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
      const [a] = tables(Author);
      resetQueryCount();
      const rows = await em.query({ from: a, select: { name: a.first_name } });
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
      const [a] = tables(Author);
      const rows = await em.query({
        from: a,
        select: { name: a.first_name },
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
      const [a, b] = tables(Author, Book);
      // The injected condition lives in the join's ON, so the LEFT join keeps a1 with a null title
      const rows = await em.query({ from: a, join: [a.books.as(b)], select: { name: a.first_name, title: b.title } });
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
      const [a, b] = tables(Author, Book);
      const rows = await em.query({ from: a, join: [a.books.inner(b)], select: { title: b.title } });
      expect(rows).toEqual([{ title: "b1" }]);
    });

    it("resolves soft-deleted entities through reference and explicit joins", async () => {
      // Given soft-deleted Author a1
      await insertAuthor({ first_name: "a1", deleted_at: new Date() });
      // And live Book b1 whose required Author reference still points to a1
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      // em.find's relation semantics: book.author.get resolves a soft-deleted Author, so joining
      // through one keeps the live Book; only collections and the from table filter soft-deletes
      const viaSugar = await em.query({
        from: b,
        join: [b.author.as(a)],
        select: { title: b.title, author: a.first_name },
      });
      expect(viaSugar).toEqual([{ title: "b1", author: "a1" }]);
      const viaExplicit = await em.query({
        from: b,
        join: [{ inner: a, on: b.author_id.eq(a.id) }],
        select: { title: b.title },
      });
      expect(viaExplicit).toEqual([{ title: "b1" }]);
    });

    it("does not inject into non-soft-deletable tables or CTI subtypes", async () => {
      // Given a LargePublisher whose physical subtype table has no deleted_at column
      await insertLargePublisher({ id: 1, name: "lp1", country: "us" });
      const em = newEntityManager();
      // And a Tag alias whose table has no deleted_at column
      const [t, lp] = tables(Tag, LargePublisher);
      resetQueryCount();
      expect(await em.query({ from: t, select: { name: t.name } })).toEqual([]);
      expect(await em.query({ from: lp, select: { country: lp.country } })).toEqual([{ country: "us" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT t.name AS name FROM tags AS t",
         "SELECT lp.country AS country FROM large_publishers AS lp",
       ]
      `);
    });
  });

  describe("raw sql escape hatches", () => {
    it("can prefix expressions to raw predicates with bound values", async () => {
      // Given an Author whose name contains SQL punctuation
      await insertAuthor({ first_name: "O'Brien", age: 30 });
      // And another Author outside the requested age range
      await insertAuthor({ first_name: "Other", age: 40 });
      const em = newEntityManager();
      const [a] = tables(Author);
      // When Authors are filtered by exact name and an inclusive age range
      const rows = await em.query({
        from: a,
        where: {
          and: [a.first_name.is`= ${"O'Brien"}`, sql.ref(a, "age").is`BETWEEN ${25} AND ${35}`],
        },
        select: { name: a.first_name },
      });
      // Then only O'Brien is returned, with the apostrophe treated as part of the name
      expect(rows).toEqual([{ name: "O'Brien" }]);
    });

    it("tracks receiver and interpolated aliases in raw predicates", async () => {
      // Given an Author with a Book whose title equals the Author's name
      await insertAuthor({ first_name: "Same" });
      await insertBook({ title: "Same", author_id: 1 });
      // And another Author with a Book whose title differs
      await insertAuthor({ first_name: "Different" });
      await insertBook({ title: "Other", author_id: 2 });
      const em = newEntityManager();
      const [a, b] = tables(Author, Book);
      // When Book titles are compared to Author names with Book.title as the receiver
      const rows = await em.query({
        from: a,
        join: [{ inner: b, on: b.author_id.is`= ${a.id}` }],
        where: b.title.is`= ${a.first_name}`,
        select: { name: a.first_name },
      });
      // Then the Book join is retained and only the Author with a matching Book title is returned
      expect(rows).toEqual([{ name: "Same" }]);
      // When Author names are compared to interpolated Book titles instead
      const interpolated = await em.query({
        from: a,
        join: [{ inner: b, on: b.author_id.eq(a.id) }],
        where: a.first_name.is`= ${b.title}`,
        select: { name: a.first_name },
      });
      // Then the interpolated Book title retains the join and returns the same Author
      expect(interpolated).toEqual(rows);
    });

    it("supports computed and subquery receivers and literal IS predicates", async () => {
      // Given an Author with a known age
      await insertAuthor({ first_name: "Known", age: 30 });
      // And an Author whose age is NULL
      await insertAuthor({ first_name: "Unknown" });
      const em = newEntityManager();
      const [a] = tables(Author);
      const ages = query({ from: a, select: { name: a.first_name, age: a.age } });
      // When the Author age subquery is filtered with a literal IS NULL predicate
      const rows = await em.query({
        from: ages,
        where: ages.age.is`IS NULL`,
        select: { name: ages.name },
      });
      // Then only the Author whose age is unknown is returned
      expect(rows).toEqual([{ name: "Unknown" }]);
      // When the computed Author count is filtered to require more than one Author
      const counts = await em.query({
        from: a,
        having: a.id.count().is`> ${1}`,
        select: { count: a.id.count() },
      });
      // Then the count of both Authors passes the predicate
      expect(counts).toEqual([{ count: 2 }]);
    });

    // sql.ref supports unmodeled physical columns; the modeled Author age column exercises the same path.
    it("can use sql.condition and sql.ref for unmodeled columns", async () => {
      // Given Author a1 below the raw SQL age threshold of 35
      await insertAuthor({ first_name: "a1", age: 30 });
      // And Author a2 above the threshold, so only a2 passes the physical-column filter
      await insertAuthor({ first_name: "a2", age: 40 });
      const em = newEntityManager();
      const [a] = tables(Author);
      const rows = await em.query({
        from: a,
        where: { and: [sql.condition`${sql.ref<number>(a, "age")} > ${35}`] },
        select: { name: a.first_name },
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
      const [c] = tables(Comment);
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
      const [b, br] = tables(Book, BookReview);
      const rows = await em.query({
        from: b,
        join: [{ left: br, on: br.book_id.eq(b.id) }],
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
      const [b] = tables(Book);
      // Window functions are not modeled; `sql` renders the interpolated columns with the right alias
      const rows = await em.query({
        from: b,
        select: {
          title: b.title,
          rank: sql<number>`row_number() OVER (PARTITION BY ${b.author_id} ORDER BY ${b.title} DESC)::int`,
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
      const [b] = tables(Book);
      // And a ranked Book subquery; without DISTINCT ON, a window function plus a filter selects
      // the highest title per Author without collapsing the separate Author partitions
      const ranked = query({
        from: b,
        select: {
          authorId: b.author_id,
          title: b.title,
          rank: sql<number>`row_number() OVER (PARTITION BY ${b.author_id} ORDER BY ${b.title} DESC)::int`,
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
      const [a, b, br] = tables(Author, Book, BookReview);
      // `FILTER (WHERE ...)` is not modeled; the interpolated condition renders with bindings
      const rows = await em.query({
        from: a,
        join: [
          { inner: b, on: b.author_id.eq(a.id) },
          { inner: br, on: br.book_id.eq(b.id) },
        ],
        groupBy: [a.first_name],
        select: {
          name: a.first_name,
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
      const [a, b] = tables(Author, Book);
      // `EXISTS` is not modeled; `a.id.in(query(...))` is the idiomatic spelling, but the raw form works too
      const rows = await em.query({
        from: a,
        where: {
          and: [sql.condition`EXISTS ${query({ from: b, where: { and: [b.author_id.eq(a.id)] }, select: b.id })}`],
        },
        select: { name: a.first_name },
      });
      expect(rows).toEqual([{ name: "a1" }]);
    });

    it("can UNION Author ids from Book and Comment queries in the database", async () => {
      // Given Authors a1, a2, and a3, with a3 left without Books or Comments
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertAuthor({ first_name: "a3" });
      // And a Book only for a1, contributing its id through the Book query
      await insertBook({ title: "b1", author_id: 1 });
      // And a second Book for a1, duplicating its id within the Book branch
      await insertBook({ title: "b2", author_id: 1 });
      // And a Comment only on a2, contributing a different id through the Comment query
      await insertComment({ text: "c1", parent_author_id: 2 });
      // And a Comment on a1, duplicating its id across the two branches
      await insertComment({ text: "c2", parent_author_id: 1 });
      // And an EntityManager to execute the combined read
      const em = newEntityManager();
      // And Author, Book, and Comment aliases for the independent branch joins
      const [a, b, c] = tables(Author, Book, Comment);
      // And query recording isolated from the seed inserts
      resetQueryCount();
      // When combining both Author-id projections with native UNION
      const rows = await em.query({
        union: [
          { from: b, join: [{ inner: a, on: b.author_id.eq(a.id) }], select: { authorId: a.id } },
          { from: c, join: [{ inner: a, on: c.parent.eq(a.id) }], select: { authorId: a.id } },
        ],
        orderBy: { authorId: "ASC" },
      });
      // Then PostgreSQL removes duplicates within and across branches in one query
      expect(rows).toEqual([{ authorId: "a:1" }, { authorId: "a:2" }]);
      expect(queries).toHaveLength(1);
      expect(queries).toMatchInlineSnapshot(`
       [
         "(SELECT a.id AS "authorId" FROM books AS b JOIN authors AS a ON b.author_id = a.id WHERE b.deleted_at IS NULL) UNION (SELECT a1.id AS "authorId" FROM comments AS c JOIN authors AS a1 ON c.parent_author_id = a1.id) ORDER BY "authorId" ASC",
       ]
      `);
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
    const [a, b] = tables(Author, Book);
    // And a shared senior flag for selection and sorting, which stays null for an unknown Author age
    const isSenior = sql<boolean>`${a.age} >= ${40}`;
    const rows = await em.query({
      from: a,
      where: {
        and: [{ or: [a.id.in(query({ from: b, select: b.author_id })), a.age.eq(null)] }],
      },
      select: { name: a.first_name, senior: isSenior },
      orderBy: [{ desc: isSenior, nulls: "last" }, { asc: a.first_name }],
    });
    expect(rows).toEqual([
      { name: "a3", senior: true },
      { name: "a1", senior: false },
      { name: "a2", senior: null },
    ]);
  });
});
