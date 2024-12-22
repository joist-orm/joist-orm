import { knex, newEntityManager } from "@src/setupDbTests";
import { jan1, ten01, ten02, ten03 } from "@src/utils";
import { PrimitiveField, alias, getMetadata } from "joist-orm";
import { Temporal } from "temporal-polyfill";
import { Author, newAuthor } from "./entities";

describe("plainTime", () => {
  it("has the correct type for a plain time field", () => {
    expect((getMetadata(Author).fields["time"] as PrimitiveField).type).toBe(Temporal.PlainTime);
  });

  it("can create with a plain time", async () => {
    const em = newEntityManager();
    const author = newAuthor(em, { time: ten01, times: [ten01, ten02] });
    await em.flush();
    expect(author.time).toEqual(ten01);
    expect(author.times).toEqual([ten01, ten02]);
  });

  it("can update a plain time", async () => {
    const em = newEntityManager();
    const author = newAuthor(em, { time: ten01 });
    await em.flush();
    author.time = ten02;
    const { updatedAt } = author;
    await em.flush();
    expect(author.time).toEqual(ten01);
    expect(updatedAt).not.toEqual(author.updatedAt);
  });

  it("can load a plain time", async () => {
    await knex.insert({ firstName: "a1", birthday: jan1, time: "10:01:00" }).into("authors");
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    expect(a.time).toEqual(ten01);
  });

  it("can load a plain time array", async () => {
    await knex.insert({ firstName: "a1", birthday: "2018-01-01", times: [ten01, ten02] }).into("authors");
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    expect(a.times).toEqual([ten01, ten02]);
  });

  it("can no-op when data is reverted before flush", async () => {
    const em = newEntityManager();
    const author = newAuthor(em, { time: ten01 });
    await em.flush();
    author.time = ten02;
    author.time = ten01;
    const { updatedAt } = author;
    await em.flush();
    expect(author.time).toEqual(ten01);
    expect(updatedAt).toEqual(author.updatedAt);
  });

  it("can find with where via a plain time", async () => {
    const em = newEntityManager();
    const [a1, a2] = [ten01, ten02, ten03].map((time) => newAuthor(em, { time }));
    await em.flush();
    const result = await em.find(Author, { time: { lte: ten02 } });
    expect(result).toEqual([a1, a2]);
  });

  it("can find with conditions via a date", async () => {
    const em = newEntityManager();
    const [a1, a2] = [ten01, ten02, ten03].map((time) => newAuthor(em, { time }));
    await em.flush();
    const a = alias(Author);
    const result = await em.find(Author, { as: a }, { conditions: { and: [a.time.lte(ten02)] } });
    expect(result).toEqual([a1, a2]);
  });

  it("can findOne with a date", async () => {
    const em = newEntityManager();
    const [, a2] = [ten01, ten02, ten03].map((time) => newAuthor(em, { time }));
    await em.flush();
    const result = await em.findOne(Author, { time: { eq: ten02 } });
    expect(result).toEqual(a2);
  });
});
