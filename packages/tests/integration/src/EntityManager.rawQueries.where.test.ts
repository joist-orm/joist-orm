import { expectTypeOf } from "expect-type";
import { type ExpressionCondition, type FilterOf, type TableFilter, alias, query, table, tables } from "joist-orm";
import {
  Author,
  Book,
  Comment,
  FavoriteShape,
  Publisher,
  PublisherSize,
  SmallPublisher,
  TaskNew,
  User,
  newAuthor,
} from "src/entities";
import {
  insertAuthor,
  insertBook,
  insertPublisher,
  insertSmallPublisher,
  insertTask,
  insertUser,
} from "src/entities/inserts";
import { PasswordValue } from "src/entities/types";
import { jan1, jan2 } from "src/testDates";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("EntityManager.rawQueries.where", () => {
  it("maps local domain names and encodes enum, date, and custom values", async () => {
    // Given an Author with a graduation date and a native enum preference
    await insertAuthor({ first_name: "Alice", graduated: jan1, favorite_shape: FavoriteShape.Circle });
    // And another Author with different values
    await insertAuthor({ first_name: "Bob", graduated: jan2, favorite_shape: FavoriteShape.Square });
    // And a Publisher with a lookup-table enum
    await insertPublisher({ name: "Press", size_id: 1 });
    // And a User with an encoded password
    const password = PasswordValue.fromPlainText("secret");
    await insertUser({ name: "Alice", password: password.encoded });
    // And physical table handles for each domain
    const em = newEntityManager();
    const [a, p, u] = tables(Author, Publisher, User);

    // When filtering with domain names and domain values rather than storage values
    const authors = await em.query({
      from: a,
      where: a.where({ firstName: { ilike: "ali%" }, graduated: { lte: jan1 }, favoriteShape: FavoriteShape.Circle }),
      select: a.first_name,
    });
    const publishers = await em.query({ from: p, where: p.where({ size: PublisherSize.Small }), select: p.name });
    const users = await em.query({ from: u, where: u.where({ password: { in: [password] } }), select: u.password });

    // Then each filter uses its local column and domain codec
    expect(authors).toEqual(["Alice"]);
    expect(publishers).toEqual(["Press"]);
    expect(users).toEqual([password]);
  });

  it("filters CTI subtype IDs on the subtype's physical table", async () => {
    // Given a SmallPublisher in London
    await insertSmallPublisher({ id: 1, name: "Press", city: "London" });
    // And another SmallPublisher in the same city
    await insertSmallPublisher({ id: 2, name: "Other", city: "London" });
    // And a table for the CTI subtype
    const em = newEntityManager();
    const sp = table(SmallPublisher);

    // When filtering by the subtype's ID and local city
    const ids = await em.query({ from: sp, where: sp.where({ id: "p:1", city: "London" }), select: sp.id });

    // Then the subtype's own primary key identifies the matching Publisher
    expect(ids).toEqual(["p:1"]);
  });

  it("filters STI IDs, inherited fields, and subtype fields on the shared table", async () => {
    // Given a TaskNew with a subtype value and an inherited duration
    await insertTask({ id: 1, type: "NEW", special_new_field: 7, duration_in_days: 3 });
    // And another TaskNew with the same values but a different ID
    await insertTask({ id: 2, type: "NEW", special_new_field: 7, duration_in_days: 3 });
    // And a table for the STI subtype
    const em = newEntityManager();
    const t = table(TaskNew);

    // When combining the inherited ID and duration with the subtype field
    const ids = await em.query({
      from: t,
      where: t.where({ id: "task:1", durationInDays: 3, specialNewField: 7 }),
      select: t.id,
    });

    // Then all domain fields resolve to the shared Task table
    expect(ids).toEqual(["task:1"]);
  });

  it("omits undefined range bounds without dropping defined bounds", async () => {
    // Given an Author aged 30
    await insertAuthor({ first_name: "Alice", age: 30 });
    // And an Author aged 40
    await insertAuthor({ first_name: "Bob", age: 40 });
    // And an Author table ordered by name
    const em = newEntityManager();
    const a = table(Author);
    const base = { from: a, select: a.first_name, orderBy: [{ asc: a.first_name }] };

    // When only the upper range bound is defined
    // Then Authors above that bound are excluded
    expect(await em.query({ ...base, where: a.where({ age: { gte: undefined, lte: 35 } }) })).toEqual(["Alice"]);
    // When only the lower range bound is defined
    // Then Authors below that bound are excluded
    expect(await em.query({ ...base, where: a.where({ age: { gte: 35, lte: undefined } }) })).toEqual(["Bob"]);
    // When either bound alone or both bounds are undefined
    // Then the omitted range does not restrict Authors
    expect(await em.query({ ...base, where: a.where({ age: { gte: undefined } }) })).toEqual(["Alice", "Bob"]);
    expect(await em.query({ ...base, where: a.where({ age: { lte: undefined } }) })).toEqual(["Alice", "Bob"]);
    expect(await em.query({ ...base, where: a.where({ age: { gte: undefined, lte: undefined } }) })).toEqual([
      "Alice",
      "Bob",
    ]);
  });

  it("uses explicit JSON equality and find-style array containment", async () => {
    // Given an Author with a JSON address and two nicknames
    await insertAuthor({ first_name: "Alice", address: { street: "Main" }, nick_names: ["Al", "Allie"] });
    // And an Author with a different address and nickname
    await insertAuthor({ first_name: "Bob", address: { street: "Side" }, nick_names: ["Bobby"] });
    // And an Author table ordered by name
    const em = newEntityManager();
    const a = table(Author);
    const base = { from: a, select: a.first_name, orderBy: [{ asc: a.first_name }] };

    // When comparing a JSON address with an explicit equality operator
    // Then the object is a scalar value rather than a filter operator map
    expect(await em.query({ ...base, where: a.where({ address: { eq: { street: "Main" } } }) })).toEqual(["Alice"]);
    // When filtering nicknames with a bare array or explicit contains
    // Then both forms match an array containing the requested nickname, not only an equal array
    expect(await em.query({ ...base, where: a.where({ nickNames: ["Al"] }) })).toEqual(["Alice"]);
    expect(await em.query({ ...base, where: a.where({ nickNames: { contains: ["Al"] } }) })).toEqual(["Alice"]);
    // When filtering nicknames with an empty containment array
    // Then both stored arrays contain the empty array
    expect(await em.query({ ...base, where: a.where({ nickNames: [] }) })).toEqual(["Alice", "Bob"]);
    // When excluding nickname arrays with nin
    // Then array exclusion remains unsupported, like find filters
    expect(() => a.where({ nickNames: { nin: [] } })).toThrow("The nin operator is not supported on array columns yet");
  });

  it("distinguishes null, lists, empty lists, and omitted scalar values", async () => {
    // Given an Author with a last name
    await insertAuthor({ first_name: "Alice", last_name: "Smith" });
    // And an Author with no last name
    await insertAuthor({ first_name: "Bob" });
    // And an Author table ordered by name
    const em = newEntityManager();
    const a = table(Author);
    const base = { from: a, select: a.first_name, orderBy: [{ asc: a.first_name }] };

    // When selecting Authors by missing last name
    // Then null means SQL NULL rather than an omitted condition
    expect(await em.query({ ...base, where: a.where({ lastName: null }) })).toEqual(["Bob"]);
    // When selecting Authors by a list of names
    // Then membership limits the result
    expect(await em.query({ ...base, where: a.where({ firstName: ["Alice"] }) })).toEqual(["Alice"]);
    // When a nullable membership list includes both a value and null
    // Then both known and missing last names are eligible
    expect(await em.query({ ...base, where: a.where({ lastName: { in: ["Smith", null] } }) })).toEqual([
      "Alice",
      "Bob",
    ]);
    // When selecting Authors by an empty inclusion or exclusion list
    // Then inclusion matches nothing and exclusion matches everyone
    expect(await em.query({ ...base, where: a.where({ firstName: [] }) })).toEqual([]);
    expect(await em.query({ ...base, where: a.where({ firstName: { nin: [] } }) })).toEqual(["Alice", "Bob"]);
    // When omitting all scalar constraints
    // Then undefined leaves every Author eligible
    expect(await em.query({ ...base, where: a.where({ firstName: undefined, lastName: { ne: undefined } }) })).toEqual([
      "Alice",
      "Bob",
    ]);
    expect(await em.query({ ...base, where: a.where({}) })).toEqual(["Alice", "Bob"]);
  });

  it("filters owning references without joining their target tables", async () => {
    // Given an Author named Alice
    await insertAuthor({ first_name: "Alice" });
    // And another Author named Bob
    await insertAuthor({ first_name: "Bob" });
    // And a reviewed Book by Alice
    await insertBook({ title: "Reviewed", author_id: 1, reviewer_id: 2 });
    // And a Book by Bob without a reviewer
    await insertBook({ title: "Unreviewed", author_id: 2 });
    // And a loaded Author for entity-valued filters
    const em = newEntityManager();
    const alice = await em.load(Author, "a:1");
    // And a new Author that has no stored ID or Books
    const unsaved = newAuthor(em);
    // And a Book table ordered by title
    const b = table(Book);
    const base = { from: b, select: b.title, orderBy: [{ asc: b.title }] };

    // When selecting Books by an Author entity, ID, or mixed list
    resetQueryCount();
    // Then all forms compare the owning foreign key
    expect(await em.query({ ...base, where: b.where({ author: alice }) })).toEqual(["Reviewed"]);
    expect(await em.query({ ...base, where: b.where({ author: alice.id }) })).toEqual(["Reviewed"]);
    expect(await em.query({ ...base, where: b.where({ author: [alice, "a:2"] }) })).toEqual(["Reviewed", "Unreviewed"]);
    expect(await em.query({ ...base, where: b.where({ author: [] }) })).toEqual([]);
    // When excluding an Author entity or ID
    // Then only the other Author's Book remains
    expect(await em.query({ ...base, where: b.where({ author: { ne: alice } }) })).toEqual(["Unreviewed"]);
    expect(await em.query({ ...base, where: b.where({ author: { ne: alice.id } }) })).toEqual(["Unreviewed"]);
    // When testing whether a reviewer exists
    // Then booleans and nullable reference values express presence or absence
    expect(await em.query({ ...base, where: b.where({ reviewer: true }) })).toEqual(["Reviewed"]);
    expect(await em.query({ ...base, where: b.where({ reviewer: false }) })).toEqual(["Unreviewed"]);
    expect(await em.query({ ...base, where: b.where({ reviewer: null }) })).toEqual(["Unreviewed"]);
    expect(await em.query({ ...base, where: b.where({ reviewer: { ne: null } }) })).toEqual(["Reviewed"]);
    // When omitting reference constraints
    // Then neither undefined form restricts the Books
    expect(await em.query({ ...base, where: b.where({ author: undefined, reviewer: { ne: undefined } }) })).toEqual([
      "Reviewed",
      "Unreviewed",
    ]);
    expect(queries.some((sql) => sql.includes(" join "))).toBe(false);
    // When selecting Books by an Author that has not been flushed
    // Then no stored foreign key matches the new Author
    expect(await em.query({ ...base, where: b.where({ author: unsaved }) })).toEqual([]);
  });

  it("composes reusable frozen filters and prunes unused Book joins", async () => {
    // Given Authors without Books, so an unpruned inner join would remove them
    await insertAuthor({ first_name: "Alice", age: 30 });
    // And another Author without Books
    await insertAuthor({ first_name: "Bob", age: 40 });
    // And frozen domain filters shared by multiple query scopes
    const filter = Object.freeze({ firstName: Object.freeze({ in: ["Alice"] }) }) satisfies TableFilter<Author>;
    Object.freeze(filter.firstName.in);
    // And an omitted Book title filter that should not retain the Book join
    const omitted = Object.freeze({ title: undefined }) satisfies TableFilter<Book>;
    // And a reusable query combining the Author and Book conditions
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    const condition = a.where(filter);
    const base = query({
      from: a,
      join: [a.books.inner(b)],
      where: { and: [b.where(omitted), { or: [condition, a.age.eq(40)] }] },
      select: { name: a.first_name },
      orderBy: [{ asc: a.first_name }],
    });

    // When executing the same composed condition twice
    resetQueryCount();
    const first = await em.query(base);
    const second = await em.query(base);

    // Then the unused Book join is absent and the filter remains reusable
    expect(first).toEqual([{ name: "Alice" }, { name: "Bob" }]);
    expect(second).toEqual(first);
    expect(queries.some((sql) => sql.includes('join "books"'))).toBe(false);
    expect(filter).toEqual({ firstName: { in: ["Alice"] } });
    // When reusing the filter on a different Author handle
    const other = table(Author, "other");
    const names = await em.query({ from: other, where: other.where(filter), select: other.first_name });
    // Then no previous query alias or bindings leak into the new scope
    expect(names).toEqual(["Alice"]);
  });

  it("rejects nonlocal fields and nested reference filters from untyped callers", () => {
    // Given physical Author, Book, Comment, and CTI subtype tables
    const [a, b, c, sp] = tables(Author, Book, Comment, SmallPublisher);
    // And field inputs that would need relationship traversal or find-query features
    const invalidFields = ["first_name", "books", "image", "as", "$someScope", "missing"];

    // When untyped callers request unsupported Author fields
    // Then the error directs them to an explicit join
    for (const key of invalidFields) {
      expect(() => a.where({ [key]: {} } as TableFilter<Author>)).toThrow(
        `Unsupported table filter field Author.${key}; use an explicit join`,
      );
    }
    expect(() => c.where({ parent: "a:1" } as unknown as TableFilter<Comment>)).toThrow(
      "Unsupported table filter field Comment.parent; use an explicit join",
    );
    expect(() => sp.where({ name: "Press" } as unknown as TableFilter<SmallPublisher>)).toThrow(
      "Unsupported table filter field SmallPublisher.name; use an explicit join",
    );
    // When untyped callers pass nested filters, aliases, or unsupported reference operators
    // Then reference errors describe the supported entity or ID values
    for (const author of [{ firstName: "Alice" }, { ne: { firstName: "Alice" } }, { in: ["a:1"] }, alias(Author)]) {
      expect(() => b.where({ author } as unknown as TableFilter<Book>)).toThrow(
        "Unsupported table reference filter Book.author; use an entity or ID",
      );
    }
  });

  it("checks local domain filter types", () => {
    // Given compile-time assertions using generated entity types
    // When checking the Table.where public contract
    // Then invalid filters are rejected without executing them
    expect(typeof tableFilterTypeAssertions).toBe("function");
  });
});

/**
 * Checks generated local names, scalar leaf types, and the restricted owning-reference contract.
 * This function is checked by tsc but is never called, so rejected filters do not execute.
 */
function tableFilterTypeAssertions(author: Author, book: Book) {
  // Given generated Author, Book, Comment, and CTI subtype tables
  const [a, b, c, sp] = tables(Author, Book, Comment, SmallPublisher);
  // When constructing filters from generated domain leaves
  const condition = a.where({ firstName: "Alice", graduated: jan1 });
  a.where({ id: author.id });
  b.where({ author, reviewer: null });
  b.where({ author: author.id, reviewer: false });
  b.where({ author: [author, author.id], reviewer: true });
  b.where({ author: { ne: author }, reviewer: { ne: null } });
  b.where({ author: { ne: author.id }, reviewer: undefined });
  b.where({ author: { ne: undefined }, reviewer: { ne: undefined } });
  sp.where({ city: "London" });
  // Then scalar filters retain their exact generated FilterOf leaf types
  expectTypeOf(condition).toEqualTypeOf<ExpressionCondition>();
  expectTypeOf<TableFilter<Author>["firstName"]>().toEqualTypeOf<FilterOf<Author>["firstName"]>();
  expectTypeOf<TableFilter<Author>["businessAddress"]>().toEqualTypeOf<FilterOf<Author>["businessAddress"]>();
  expectTypeOf<TableFilter<Author>["favoriteColors"]>().toEqualTypeOf<FilterOf<Author>["favoriteColors"]>();
  // @ts-expect-error A Book ID cannot filter an Author primary key
  a.where({ id: book.id });
  // @ts-expect-error SQL storage names are not domain filter keys
  a.where({ first_name: "Alice" });
  // @ts-expect-error Scalars retain their generated value type
  a.where({ age: "30" });
  // @ts-expect-error Required references do not accept null
  b.where({ author: null });
  // @ts-expect-error Required references cannot exclude null
  b.where({ author: { ne: null } });
  // @ts-expect-error Nested reference filters require an explicit join
  b.where({ author: { firstName: "Alice" } });
  // @ts-expect-error Nested exclusions are not owning-reference values
  b.where({ author: { ne: { firstName: "Alice" } } });
  // @ts-expect-error Reference lists use the direct array form
  b.where({ author: { in: [author.id] } });
  // @ts-expect-error Find aliases are not reference values
  b.where({ author: alias(Author) });
  // @ts-expect-error Collections require explicit joins
  a.where({ books: {} });
  // @ts-expect-error Inverse one-to-one references are not local
  a.where({ image: null });
  // @ts-expect-error Find alias bindings are not table filters
  a.where({ as: alias(Author) });
  // @ts-expect-error Find scopes are not table filters
  a.where({ $someScope: true });
  // @ts-expect-error Polymorphic references require explicit expressions
  c.where({ parent: author });
  // @ts-expect-error Polymorphic component columns have no domain filter name
  c.where({ parent_author_id: author.id });
  // @ts-expect-error CTI inherited fields are not on the subtype's physical table
  sp.where({ name: "Press" });
}
