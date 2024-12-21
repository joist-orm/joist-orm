import { knex, newEntityManager } from "@src/setupDbTests";
import { jan1DateTime, jan2DateTime, jan3DateTime } from "@src/utils";
import { PrimitiveField, alias, getMetadata } from "joist-orm";
import { Temporal } from "temporal-polyfill";
import { Author, Book, newBook } from "./entities";

describe("Book", () => {
  it("has the correct type for a zoned date time field", () => {
    expect((getMetadata(Book).fields["publishedAt"] as PrimitiveField).type).toBe(Temporal.ZonedDateTime);
  });

  it("can create with a zoned date time", async () => {
    const em = newEntityManager();
    const book = newBook(em, { publishedAt: jan1DateTime });
    await em.flush();
    expect(book.publishedAt).toEqual(jan1DateTime);
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
    await knex.insert({ firstName: "a1", birthday: "2020-01-01" }).into("authors");
    await knex.insert({ author_id: 1, title: "b1", published_at: toTimestampTzString(jan1DateTime) }).into("book");
    const em = newEntityManager();
    const book = await em.load(Book, "b:1");
    expect(book.publishedAt).toEqual(jan1DateTime);
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
});

function toTimestampTzString(zonedDateTime: Temporal.ZonedDateTime) {
  return `${zonedDateTime.toPlainDate().toString()} ${zonedDateTime.toPlainTime().toString()}${zonedDateTime.offset}`;
}
