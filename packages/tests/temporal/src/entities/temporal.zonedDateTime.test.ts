import { PrimitiveField, Temporal, alias, getMetadata } from "joist-orm";
import { PostgresDriver, registerDatabaseBinaryParsers } from "joist-orm/pg";
import { PostgreJsDriver } from "joist-orm/postgrejs";
import { newPgConnectionConfig } from "joist-utils";
import pg from "pg";
import { Pool } from "postgrejs";
import { knex, newEntityManager, pool } from "src/setupDbTests";
import { jan1DateTime, jan1at10am, jan2DateTime, jan3DateTime } from "src/utils";

import { Author, Book, BookFilter, EntityManager, newBook } from "./entities";

describe("zonedDateTime", () => {
  it("has the correct type for a zoned date time field", () => {
    expect((getMetadata(Book).fields["publishedAt"] as PrimitiveField).type).toBe(Temporal.ZonedDateTime);
  });

  it("soft deletes with a zoned date time", async () => {
    const em = newEntityManager();
    const book = newBook(em);

    book.softDelete();
    await em.flush();

    expect(book.deletedAt).toBeInstanceOf(Temporal.ZonedDateTime);
    expect(book.deletedAt?.timeZoneId).toBe("UTC");
    expect(await knex.select(knex.raw("deleted_at is not null as soft_deleted")).from("book")).toMatchObject([
      { soft_deleted: true },
    ]);
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

  it("preserves named-zone DST rules in pg lazy loads", async () => {
    // Given a book stored at a known instant
    await knex.insert({ firstName: "a1", birthday: "2020-01-01", timestamp: jan1at10am }).into("authors");
    await knex.insert({ author_id: 1, title: "b1", published_at: "2026-01-15T17:00:00Z" }).into("book");
    // And a session whose TimeZone is not UTC
    const nyPool = new pg.Pool({ ...newPgConnectionConfig(), options: "-c TimeZone=America/New_York" });
    try {
      // When the book is loaded as a native Temporal value and advanced into summer
      const lazyEm = newEntityManager();
      lazyEm.driver = new PostgresDriver(nyPool, { lazyRows: true });
      const lazyBook = await lazyEm.load(Book, "b:1");
      // Then New York's daylight-saving offset applies instead of retaining winter's fixed offset
      expect(lazyBook.publishedAt.add({ months: 6 }).toString()).toBe("2026-07-15T12:00:00-04:00[America/New_York]");
    } finally {
      // Restore the shared UTC session zone captured by the lazy driver's auto-registration.
      await registerDatabaseBinaryParsers(pool);
      await nyPool.end();
    }
  });

  it("preserves named-zone DST rules in PostgreJS lazy loads", async () => {
    // Given a book stored at a known instant
    await knex.insert({ firstName: "a1", birthday: "2020-01-01", timestamp: jan1at10am }).into("authors");
    await knex.insert({ author_id: 1, title: "b1", published_at: "2026-01-15T17:00:00Z" }).into("book");
    // And a session whose TimeZone is not UTC
    const { ssl, ...config } = newPgConnectionConfig();
    const postgreJsPool = new Pool({
      ...config,
      ssl: ssl ? {} : undefined,
      requireSSL: !!ssl,
      timezone: "America/New_York",
    });
    try {
      // When the book is loaded as a native Temporal value and advanced into summer
      const lazyEm = newEntityManager();
      lazyEm.driver = new PostgreJsDriver(postgreJsPool);
      const lazyBook = await lazyEm.load(Book, "b:1");
      // Then New York's daylight-saving offset applies instead of retaining winter's fixed offset
      expect(lazyBook.publishedAt.add({ months: 6 }).toString()).toBe("2026-07-15T12:00:00-04:00[America/New_York]");
    } finally {
      await postgreJsPool.close();
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
