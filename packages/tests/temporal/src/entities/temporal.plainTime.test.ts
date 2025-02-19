import { newEntityManager, sql } from "@src/setupDbTests";
import { jan1, ten01, ten01AndMicros, ten02, ten03 } from "@src/utils";
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

  it("can create with a plain time in nanos", async () => {
    const em = newEntityManager();
    newAuthor(em, { timeToMicros: Temporal.PlainTime.from("10:01:00.12345678") });
    await em.flush();
    const rows = await sql`select * from authors`;
    expect(rows[0].time_to_micros).toEqual("10:01:00.123457"); // rounded
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
    await sql`INSERT INTO authors ("firstName", birthday, time) VALUES ('a1', ${jan1}, ${ten01})`;
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    expect(a.time).toEqual(ten01);
  });

  it("can load a plain time array", async () => {
    await sql`INSERT INTO authors ("firstName", birthday, times) VALUES ('a1', ${jan1}, ${[ten01, ten02]})`;
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    expect(a.times).toEqual([ten01, ten02]);
  });

  it("can load a plain time with micros", async () => {
    await sql`INSERT INTO authors ("firstName", birthday, time_to_micros) VALUES ('a1', ${jan1}, '10:01:00.123456')`;
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    expect(a.timeToMicros).toEqual(ten01AndMicros);
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
