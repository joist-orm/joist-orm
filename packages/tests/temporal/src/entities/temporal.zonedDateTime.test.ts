import { PrimitiveField, Temporal, alias, getMetadata } from "joist-orm";
import { PostgresDriver, registerDatabaseBinaryParsers } from "joist-orm/pg";
import { newPgConnectionConfig } from "joist-utils";
import pg from "pg";
import { knex, newEntityManager, pool } from "src/setupDbTests";
import { jan1DateTime, jan1at10am, jan2DateTime, jan3DateTime } from "src/utils";

import { Author, Book, BookFilter, EntityManager, newBook } from "./entities";

describe("zonedDateTime", () => {
  it("has the correct type for a zoned date time field", () => {
    expect((getMetadata(Book).fields["publishedAt"] as PrimitiveField).type).toBe(Temporal.ZonedDateTime);
  });

  it("can create with a zoned date time", async () => {
    const em = newEntityManager();
    const book = newBook(em, { publishedAt: jan1DateTime, timestampTzs: [jan1DateTime, jan2DateTime] });
    await em.flush();
    expect(book.publishedAt).toEqual(jan1DateTime);
    expect(book.timestampTzs).toEqual([jan1DateTime, jan2DateTime]);
  });

  it("can update a zoned date time", async () => {
    const em = newEntityManager();
    const book = newBook(em, { publishedAt: jan1DateTime });
    await em.flush();
    book.publishedAt = jan2DateTime;
    const { updatedAt } = book;
    await em.flush();
    expect(book.publishedAt).toEqual(jan2DateTime);
    expect(updatedAt).not.toEqual(book.updatedAt);
  });

  it("can load a zoned date time", async () => {
    await knex.insert({ firstName: "a1", birthday: "2020-01-01", timestamp: jan1at10am }).into("authors");
    await knex.insert({ author_id: 1, title: "b1", published_at: toTimestampTzString(jan1DateTime) }).into("book");
    const em = newEntityManager();
    const book = await em.load(Book, "b:1");
    expect(book.publishedAt).toEqual(jan1DateTime);
  });

  it("zones loads by the session TimeZone identically in classic and lazy modes", async () => {
    await knex.insert({ firstName: "a1", birthday: "2020-01-01", timestamp: jan1at10am }).into("authors");
    await knex.insert({ author_id: 1, title: "b1", published_at: toTimestampTzString(jan1DateTime) }).into("book");
    // A session whose TimeZone is not UTC renders timestamptz with local offsets, which classic
    // parsing preserves as the ZonedDateTime's zone — binary decoding must match it exactly
    const nyPool = new pg.Pool({ ...newPgConnectionConfig(), options: "-c TimeZone=America/New_York" });
    try {
      const classicEm = new EntityManager({} as any, new PostgresDriver(nyPool, { lazyRows: false }));
      const classicBook = await classicEm.load(Book, "b:1");
      const lazyEm = new EntityManager(
        {} as any,
        new PostgresDriver(nyPool, { lazyRows: process.env.JOIST_ROW_DATA === "1" }),
      );
      const lazyBook = await lazyEm.load(Book, "b:1");
      expect(lazyBook.publishedAt).toEqual(classicBook.publishedAt);
      // i.e. jan1 UTC renders as Dec 31 in EST, zoned by the rendered offset
      expect(lazyBook.publishedAt.toString()).toBe(classicBook.publishedAt.toString());
    } finally {
      // Restore the shared UTC session zone captured by the lazy driver's auto-registration
      await registerDatabaseBinaryParsers(pool);
      await nyPool.end();
    }
  });

  it("can load a zoned date time array", async () => {
    await knex.insert({ firstName: "a1", birthday: "2020-01-01", timestamp: jan1at10am }).into("authors");
    await knex
      .insert({
        author_id: 1,
        title: "b1",
        published_at: toTimestampTzString(jan1DateTime),
        timestamp_tzs: [toTimestampTzString(jan1DateTime), toTimestampTzString(jan2DateTime)],
      })
      .into("book");
    const em = newEntityManager();
    const book = await em.load(Book, "b:1");
    expect(book.timestampTzs).toEqual([jan1DateTime, jan2DateTime]);
  });

  it("can update a nullable zoned date time array to null", async () => {
    await knex.insert({ firstName: "a1", birthday: "2020-01-01", timestamp: jan1at10am }).into("authors");
    await knex
      .insert({
        author_id: 1,
        title: "b1",
        published_at: toTimestampTzString(jan1DateTime),
        maybe_timestamp_tzs: [toTimestampTzString(jan1DateTime), toTimestampTzString(jan2DateTime)],
      })
      .into("book");
    const em = newEntityManager();
    const book = await em.load(Book, "b:1");
    book.maybeTimestampTzs = undefined;
    await em.flush();
    const rows = await knex.select("*").from("book");
    expect(rows[0].maybe_timestamp_tzs).toBeNull();
  });

  it("can update a nullable zoned date time array to value", async () => {
    await knex.insert({ firstName: "a1", birthday: "2020-01-01", timestamp: jan1at10am }).into("authors");
    await knex
      .insert({
        author_id: 1,
        title: "b1",
        published_at: toTimestampTzString(jan1DateTime),
        maybe_timestamp_tzs: [toTimestampTzString(jan1DateTime), toTimestampTzString(jan2DateTime)],
      })
      .into("book");
    const em = newEntityManager();
    const book = await em.load(Book, "b:1");
    book.maybeTimestampTzs = [jan3DateTime];
    await em.flush();
    const rows = await knex.select("*").from("book");
    expect(rows[0].maybe_timestamp_tzs).toEqual(["2018-01-03 00:00:00+00"]);
  });

  it("can no-op when data is reverted before flush", async () => {
    const em = newEntityManager();
    const book = newBook(em, { publishedAt: jan1DateTime });
    await em.flush();
    book.publishedAt = jan2DateTime;
    book.publishedAt = jan1DateTime;
    const { updatedAt } = book;
    await em.flush();
    expect(book.publishedAt).toEqual(jan1DateTime);
    expect(updatedAt).toEqual(book.updatedAt);
  });

  it("can find with where via a zoned date time", async () => {
    const em = newEntityManager();
    const [b1, b2] = [jan1DateTime, jan2DateTime, jan3DateTime].map((publishedAt) => newBook(em, { publishedAt }));
    await em.flush();
    const result = await em.find(Book, { publishedAt: { lte: jan2DateTime } });
    expect(result).toEqual([b1, b2]);
  });

  it("can find with conditions via a zoned date time", async () => {
    const em = newEntityManager();
    const [b1, b2] = [jan1DateTime, jan2DateTime, jan3DateTime].map((publishedAt) => newBook(em, { publishedAt }));
    await em.flush();
    const a = alias(Book);
    const result = await em.find(Book, { as: a }, { conditions: { and: [a.publishedAt.lte(jan2DateTime)] } });
    expect(result).toEqual([b1, b2]);
  });

  it("can findOne with a zoned date time", async () => {
    const em = newEntityManager();
    const [, b2] = [jan1DateTime, jan2DateTime, jan3DateTime].map((publishedAt) => newBook(em, { publishedAt }));
    await em.flush();
    const result = await em.findOne(Book, { publishedAt: { eq: jan2DateTime } });
    expect(result).toEqual(b2);
  });

  it("can find via nested zoned date time", async () => {
    const em = newEntityManager();
    const books = [jan1DateTime, jan2DateTime, jan3DateTime].map((publishedAt) =>
      newBook(em, { publishedAt, author: {} }),
    );
    const [a1, a2] = books.map((book) => book.author.get);
    await em.flush();
    const result = await em.find(Author, { books: { publishedAt: { lte: jan2DateTime } } });
    expect(result).toEqual([a1, a2]);
  });

  it("between where filters aren't mutated", async () => {
    const em = newEntityManager();
    const [, b2] = [jan1DateTime, jan2DateTime, jan3DateTime].map((publishedAt) => newBook(em, { publishedAt }));
    await em.flush();
    const where = { publishedAt: { between: [jan2DateTime, jan2DateTime] } } satisfies BookFilter;
    const result = await em.findOne(Book, where);
    expect(result).toMatchEntity(b2);
    expect(where.publishedAt.between[0]).toEqual(jan2DateTime);
  });
});

function toTimestampTzString(zonedDateTime: Temporal.ZonedDateTime) {
  return `${zonedDateTime.toPlainDate().toString()} ${zonedDateTime.toPlainTime().toString()}${zonedDateTime.offset}`;
}
