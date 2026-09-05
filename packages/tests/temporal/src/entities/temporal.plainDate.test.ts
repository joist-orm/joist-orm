import { JsonAggregatePreloader, PrimitiveField, Temporal, alias, getMetadata } from "joist-orm";
import { knex, newEntityManager } from "src/setupDbTests";
import { jan1, jan2, jan3 } from "src/utils";

import { Author, Book, newAuthor, newBook } from "./entities";

describe("plainDate", () => {
  it("has the correct type for a plain date field", () => {
    expect((getMetadata(Author).fields["birthday"] as PrimitiveField).type).toBe(Temporal.PlainDate);
  });

  it("can create with a plain date", async () => {
    const em = newEntityManager();
    const author = newAuthor(em, { birthday: jan1, childrenBirthdays: [jan1] });
    await em.flush();
    expect(author.birthday).toEqual(jan1);
    expect(author.childrenBirthdays).toEqual([jan1]);
  });

  it("can update a plain date", async () => {
    const em = newEntityManager();
    const author = newAuthor(em, { birthday: jan1 });
    await em.flush();
    author.birthday = jan2;
    const { updatedAt } = author;
    await em.flush();
    expect(author.birthday).toEqual(jan2);
    expect(updatedAt).not.toEqual(author.updatedAt);
  });

  it("can load a plain date", async () => {
    await knex.insert({ firstName: "a1", birthday: "2018-01-01" }).into("authors");
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    expect(a.birthday).toEqual(jan1);
  });

  it("can load a plain date array", async () => {
    await knex
      .insert({ firstName: "a1", birthday: "2018-01-01", children_birthdays: ["2018-01-01", "2018-01-02"] })
      .into("authors");
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    expect(a.birthday).toEqual(jan1);
    expect(a.childrenBirthdays).toEqual([jan1, jan2]);
  });

  it("decodes plain date projections while preserving nullable arrays", async () => {
    // Given Author a1 with a plain date and populated required and optional date arrays
    await knex
      .insert({
        firstName: "a1",
        birthday: "2018-01-01",
        children_birthdays: ["2018-01-01", "2018-01-02"],
        maybe_birthdays: ["2018-01-02"],
      })
      .into("authors");
    // And Author a2 keeps the required array's empty default but stores SQL NULL for the optional array
    await knex.insert({ firstName: "a2", birthday: "2018-01-02", maybe_birthdays: null }).into("authors");
    const em = newEntityManager();
    const a = alias(Author);
    // When projecting each Author's birthday and birthday arrays
    const rows = await em.query({
      from: a,
      select: { birthday: a.birthday, childrenBirthdays: a.childrenBirthdays, maybeBirthdays: a.maybeBirthdays },
      orderBy: [{ asc: a.firstName }],
    });
    // Then dates decode to PlainDate values while empty arrays and SQL NULL remain distinct
    expect(rows).toEqual([
      { birthday: jan1, childrenBirthdays: [jan1, jan2], maybeBirthdays: [jan2] },
      { birthday: jan2, childrenBirthdays: [], maybeBirthdays: null },
    ]);
    // When loading the same Authors as entities
    // em.loadAll exercises binary-decoded Temporal inputs when the lazy variant is enabled.
    const authors = await em.loadAll(Author, ["a:1", "a:2"]);
    // Then hydration returns the same dates but represents a2's missing optional array as undefined
    expect(authors).toMatchEntity([
      { birthday: jan1, childrenBirthdays: [jan1, jan2], maybeBirthdays: [jan2] },
      { birthday: jan2, childrenBirthdays: [], maybeBirthdays: undefined },
    ]);
  });

  it("preserves native PlainDate values during column decoding", () => {
    // Raw queries use text results even in lazy mode, so native column inputs need separate coverage.
    // Given the Author birthday columns and already-created PlainDate values
    const fields = getMetadata(Author).fields;
    // When decoding existing PlainDate values through the birthday and childrenBirthdays columns
    const birthday = fields.birthday.serde!.columns[0].mapFromDb(jan1);
    const childrenBirthdays = fields.childrenBirthdays.serde!.columns[0].mapFromDb([jan1, jan2]);
    // Then the scalar keeps its identity and the array retains its PlainDate values
    expect(birthday).toBe(jan1);
    expect(childrenBirthdays).toEqual([jan1, jan2]);
  });

  it("can update a nullable plain date array to null", async () => {
    await knex
      .insert({ firstName: "a1", birthday: "2018-01-01", maybe_birthdays: ["2018-01-01", "2018-01-02"] })
      .into("authors");
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    author.maybeBirthdays = undefined;
    await em.flush();
    const rows = await knex.select("*").from("authors");
    expect(rows[0].maybe_birthdays).toBeNull();
  });

  it("can update a nullable plain date array to new date", async () => {
    await knex
      .insert({ firstName: "a1", birthday: "2018-01-01", maybe_birthdays: ["2018-01-01", "2018-01-02"] })
      .into("authors");
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    author.maybeBirthdays = [jan1];
    await em.flush();
    const rows = await knex.select("*").from("authors");
    expect(rows[0].maybe_birthdays).toEqual(["2018-01-01"]);
  });

  it("can no-op when data is reverted before flush", async () => {
    const em = newEntityManager();
    const author = newAuthor(em, { birthday: jan1 });
    await em.flush();
    author.birthday = jan2;
    author.birthday = jan1;
    const { updatedAt } = author;
    await em.flush();
    expect(author.birthday).toEqual(jan1);
    expect(updatedAt).toEqual(author.updatedAt);
  });

  it("can find with where via a date", async () => {
    const em = newEntityManager();
    const [a1, a2] = [jan1, jan2, jan3].map((birthday) => newAuthor(em, { birthday }));
    await em.flush();
    const result = await em.find(Author, { birthday: { lte: jan2 } });
    expect(result).toEqual([a1, a2]);
  });

  it("can find with conditions via a date", async () => {
    const em = newEntityManager();
    const [a1, a2] = [jan1, jan2, jan3].map((birthday) => newAuthor(em, { birthday }));
    await em.flush();
    const a = alias(Author);
    const result = await em.find(Author, { as: a }, { conditions: { and: [a.birthday.lte(jan2)] } });
    expect(result).toEqual([a1, a2]);
  });

  it("can findOne with a date", async () => {
    const em = newEntityManager();
    const [, a2] = [jan1, jan2, jan3].map((birthday) => newAuthor(em, { birthday }));
    await em.flush();
    const result = await em.findOne(Author, { birthday: { eq: jan2 } });
    expect(result).toEqual(a2);
  });

  it("can find via nested date", async () => {
    const em = newEntityManager();
    const authors = [jan1, jan2, jan3].map((birthday) => newAuthor(em, { birthday }));
    const [b1, b2, b3] = authors.map((author) => newBook(em, { author }));
    await em.flush();
    const result = await em.find(Book, { author: { birthday: { lte: jan2 } } });
    expect(result).toEqual([b1, b2]);
  });

  // These are really preloading tests, that are in the temporal test suite primarily
  // because it's the easiest place to reproduce the issues we found in prod.
  describe("preloading", () => {
    it("works with preloading array columns", async () => {
      const em = newEntityManager();
      // Given books have a timestamp array column
      newAuthor(em, { books: [{}, {}] });
      await em.flush();
      // When we preload the books
      const em2 = newEntityManager({ preloadPlugin: new JsonAggregatePreloader() });
      // Then it works
      await em2.findOneOrFail(Author, {}, { populate: "books" });
    });

    it("works with preloading timestamp columns", async () => {
      const em = newEntityManager();
      // Given books have a timestamp column
      newAuthor(em, { books: [{}] });
      await em.flush();
      const em2 = newEntityManager({ preloadPlugin: new JsonAggregatePreloader() });
      const a1 = await em2.findOneOrFail(Author, {}, { populate: "books" });
      // When we access it, it does not blow up
      expect(a1.books.get[0].updatedAt).toBeInstanceOf(Temporal.ZonedDateTime);
    });
  });
});
