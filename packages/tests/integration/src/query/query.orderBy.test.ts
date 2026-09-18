import { expectTypeOf } from "expect-type";
import { type ExpressionOrderBy, type TableOrderBy, table, tables } from "joist-orm";
import { Author, type AuthorOrder, Book } from "src/entities";
import { insertAuthor, insertBook } from "src/entities/inserts";
import { jan1, jan2 } from "src/testDates";
import { newEntityManager } from "src/testEm";

describe("em.query / Table.orderBy", () => {
  it("maps domain fields in input order and omits nullish directions", async () => {
    // Given Authors whose update time and name establish different sort priorities
    await insertAuthor({ first_name: "Alice", age: 40, updated_at: jan2 });
    // And an Author updated earlier than the others
    await insertAuthor({ first_name: "Bob", age: 30, updated_at: jan1 });
    // And an Author whose descending name breaks the update-time tie
    await insertAuthor({ first_name: "Carol", age: 20, updated_at: jan2 });
    // And a domain ordering with omitted age and ID directions
    const em = newEntityManager();
    const a = table(Author);
    const orderBy = a.orderBy({ updatedAt: "ASC", age: null, firstName: "DESC", id: undefined });

    // When using the mapped entries with an explicit stable expression tiebreaker
    const names = await em.query({
      from: a,
      select: a.firstName,
      orderBy: [...orderBy, { sort: a.id, order: "ASC" }],
    });

    // Then the snake-cased update column has priority and only defined directions contribute entries
    expect(names).toEqual(["Bob", "Carol", "Alice"]);
    expect(orderBy).toHaveLength(2);
  });

  it("returns no entries for a nullish input", () => {
    // Given an Author table
    const a = table(Author);

    // When mapping absent domain ordering
    const undefinedOrder = a.orderBy(undefined);
    const nullOrder = a.orderBy(null);

    // Then both inputs produce an empty expression list
    expect(undefinedOrder).toEqual([]);
    expect(nullOrder).toEqual([]);
  });

  it("retains an explicitly named table as the expression source", async () => {
    // Given two managers whose names sort opposite to their reports' names
    await insertAuthor({ id: 1, first_name: "Zulu Manager" });
    // And the alphabetically first manager
    await insertAuthor({ id: 2, first_name: "Alpha Manager" });
    // And a report for the manager whose name sorts last
    await insertAuthor({ id: 3, first_name: "Alpha Report", mentor_id: 1 });
    // And a report for the manager whose name sorts first
    await insertAuthor({ id: 4, first_name: "Zulu Report", mentor_id: 2 });
    // And separate table identities for reports and managers
    const em = newEntityManager();
    const report = table(Author);
    const manager = table(Author, "manager");

    // When ordering reports through the explicitly named manager table
    const names = await em.query({
      from: report,
      join: [report.mentor.inner(manager)],
      select: report.firstName,
      orderBy: manager.orderBy({ firstName: "ASC" }),
    });

    // Then manager names, rather than report names, determine the result order
    expect(names).toEqual(["Zulu Report", "Alpha Report"]);
  });

  it("keeps references explicit instead of treating them as foreign-key ordering", async () => {
    // Given two Authors
    await insertAuthor({ id: 1, first_name: "Alice" });
    // And the second Author
    await insertAuthor({ id: 2, first_name: "Bob" });
    // And Books whose titles sort opposite to their Author IDs
    await insertBook({ title: "Zulu", author_id: 1 });
    // And a Book for the second Author
    await insertBook({ title: "Alpha", author_id: 2 });
    // And a Book table
    const em = newEntityManager();
    const b = table(Book);

    // When an untyped caller asks for domain-reference ordering
    // Then the helper directs them to an explicit foreign-key expression
    expect(() => b.orderBy({ author: "ASC" } as unknown as TableOrderBy<Book>)).toThrow(
      "Unsupported table order field Book.author; use an explicit expression",
    );

    // When ordering by the foreign-key expression directly
    const titles = await em.query({
      from: b,
      select: b.title,
      orderBy: [{ sort: b.authorId, order: "ASC" }],
    });

    // Then existing explicit expression ordering remains available
    expect(titles).toEqual(["Zulu", "Alpha"]);
  });

  it("checks persisted domain order types", () => {
    // Given compile-time assertions using generated entity and GraphQL order types
    // When checking the Table.orderBy public contract
    // Then invalid fields are rejected without executing them
    expect(typeof tableOrderByTypeAssertions).toBe("function");
  });
});

/** Checks generated order compatibility and rejects fields without a plain local column. */
function tableOrderByTypeAssertions(orderBy: AuthorOrder | undefined) {
  // Given generated Author and Book tables
  const [a, b] = tables(Author, Book);

  // When mapping generated ordering and plain persisted fields
  const entries = a.orderBy(orderBy);
  a.orderBy({ id: "ASC", firstName: "DESC", updatedAt: "ASC", favoriteShape: undefined });

  // Then the helper produces expression entries and excludes unsupported entity fields
  expectTypeOf(entries).toEqualTypeOf<ExpressionOrderBy[]>();
  // @ts-expect-error Arbitrary values are not persisted Author fields
  a.orderBy({ arbitraryValue: "ASC" });
  // @ts-expect-error Unpersisted derived properties have no physical column
  a.orderBy({ fullName: "ASC" });
  // @ts-expect-error Persisted reactive fields are not plain orderable fields
  a.orderBy({ numberOfBooks: "ASC" });
  // @ts-expect-error Collections require explicit joined expressions
  a.orderBy({ books: "ASC" });
  // @ts-expect-error Owning references keep Joist's nested-order meaning
  b.orderBy({ author: "ASC" });
  // @ts-expect-error Physical foreign-key names are not domain field names
  b.orderBy({ authorId: "ASC" });
}
