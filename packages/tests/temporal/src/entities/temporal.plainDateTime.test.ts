import { knex, newEntityManager } from "@src/setupDbTests";
import { jan1at10am, jan1at11am, jan1at12pm } from "@src/utils";
import { PrimitiveField, alias, getMetadata } from "joist-orm";
import { Temporal } from "temporal-polyfill";
import { Author, newAuthor } from "./entities";

describe("plainDateTime", () => {
  it("has the correct type for a plain date time field", () => {
    expect((getMetadata(Author).fields["timestamp"] as PrimitiveField).type).toBe(Temporal.PlainDateTime);
  });

  it("can create with a plain date time", async () => {
    const em = newEntityManager();
    const author = newAuthor(em, { timestamp: jan1at10am, timestamps: [jan1at10am, jan1at11am] });
    await em.flush();
    expect(author.timestamp).toEqual(jan1at10am);
    expect(author.timestamps).toEqual([jan1at10am, jan1at11am]);
  });

  it("can update a plain date time", async () => {
    const em = newEntityManager();
    const author = newAuthor(em, { timestamp: jan1at10am });
    await em.flush();
    author.timestamp = jan1at11am;
    const { updatedAt } = author;
    await em.flush();
    expect(author.timestamp).toEqual(jan1at11am);
    expect(updatedAt).not.toEqual(author.updatedAt);
  });

  it("can load a plain date time", async () => {
    await knex.insert({ firstName: "a1", birthday: "2018-01-01", timestamp: jan1at10am }).into("authors");
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    expect(a.timestamp).toEqual(jan1at10am);
  });

  it("can load a plain time time array", async () => {
    await knex
      .insert({
        firstName: "a1",
        birthday: "2018-01-01",
        timestamp: jan1at10am,
        timestamps: [jan1at10am, jan1at11am],
      })
      .into("authors");
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    expect(a.timestamps).toEqual([jan1at10am, jan1at11am]);
  });

  it("can no-op when data is reverted before flush", async () => {
    const em = newEntityManager();
    const author = newAuthor(em, { timestamp: jan1at10am });
    await em.flush();
    author.timestamp = jan1at11am;
    author.timestamp = jan1at10am;
    const { updatedAt } = author;
    await em.flush();
    expect(author.timestamp).toEqual(jan1at10am);
    expect(updatedAt).toEqual(author.updatedAt);
  });

  it("can find with where via a plain date time", async () => {
    const em = newEntityManager();
    const [a1, a2] = [jan1at10am, jan1at11am, jan1at12pm].map((timestamp) => newAuthor(em, { timestamp }));
    await em.flush();
    const result = await em.find(Author, { timestamp: { lte: jan1at11am } });
    expect(result).toEqual([a1, a2]);
  });

  it("can find with conditions via a plain date time", async () => {
    const em = newEntityManager();
    const [a1, a2] = [jan1at10am, jan1at11am, jan1at12pm].map((timestamp) => newAuthor(em, { timestamp }));
    await em.flush();
    const a = alias(Author);
    const result = await em.find(Author, { as: a }, { conditions: { and: [a.timestamp.lte(jan1at11am)] } });
    expect(result).toEqual([a1, a2]);
  });

  it("can findOne with a plain date time", async () => {
    const em = newEntityManager();
    const [, a2] = [jan1at10am, jan1at11am, jan1at12pm].map((timestamp) => newAuthor(em, { timestamp }));
    await em.flush();
    const result = await em.findOne(Author, { timestamp: { eq: jan1at11am } });
    expect(result).toEqual(a2);
  });
});
