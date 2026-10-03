import { jan1 } from "src/testDates";
import { knex, newEntityManager } from "src/testEm";

import { AuthorStat, newAuthorStat } from "../entities";
import { select } from "./inserts";

describe("AuthorStat", () => {
  it("round-trips a nested array as one JSON value through flush and load", async () => {
    // Given an AuthorStat with no numeric samples
    const em = newEntityManager();
    const stat = newAuthorStat(em);
    // And its scalar JSON column contains a nested array, unlike the one-dimensional numeric columns
    stat.json = [["first", "second"], []];
    // When flushing and loading through a fresh EntityManager
    await em.flush();
    const loaded = await newEntityManager().load(AuthorStat, stat.id);
    // Then the generated JSON field preserves the nested array as one value
    expect(loaded.json).toEqual([["first", "second"], []]);
    expect(await select("author_stats")).toMatchObject([{ json: [["first", "second"], []] }]);
  });

  it.each([
    ["decimalSamples", "decimal_samples"],
    ["bigintSamples", "bigint_samples"],
  ] as const)("rejects nested %s on flush and load", async (field, column) => {
    // Given a persisted AuthorStat whose optional samples are SQL NULL
    const em = newEntityManager();
    const stat = newAuthorStat(em);
    await em.flush();
    // And an untyped caller supplies a nested array instead of numeric elements
    // @ts-expect-error: nested numeric arrays are not supported by generated entity fields
    stat[field] = [[1, 2]];
    // When flushing the invalid domain value
    // Then the write fails rather than coercing the nested array to a numeric element
    await expect(em.flush()).rejects.toThrow("Native numeric arrays must be one-dimensional");
    // And an external SQL writer stores a multidimensional array that PostgreSQL permits
    await knex("author_stats").update({ [column]: [[1, 2]] });
    // When loading and accessing that field, including with lazy row decoding
    // Then the read also rejects the nested value
    await expect(async () => {
      const loaded = await newEntityManager().load(AuthorStat, stat.id);
      return loaded[field];
    }).rejects.toThrow("Native numeric arrays must be one-dimensional");
  });

  describe("minValueRule", () => {
    it("can limit a field to a min value", async () => {
      const em = newEntityManager();
      // Given a new AuthorStat with an nullableInteger value of -1
      newAuthorStat(em, { nullableInteger: -1 });
      // When flushing
      // Then expect an error to be thrown
      await expect(em.flush()).rejects.toThrow(
        "Validation error: AuthorStat#1 nullableInteger must be greater than or equal to 0",
      );
    });

    it("cannot limit a field with no value", async () => {
      const em = newEntityManager();

      // Given a new AuthorStat with an nullableInteger value of null
      newAuthorStat(em, { nullableInteger: null });
      // When flushing
      // Then expect no error to be thrown
      await expect(em.flush()).resolves.toBeDefined();
    });
  });

  describe("maxValueRule", () => {
    it("can limit a field to a max value", async () => {
      const em = newEntityManager();

      // Given a new AuthorStat with an nullableInteger value of 101
      const as = newAuthorStat(em, { nullableInteger: 101 });
      // When flushing
      // Then expect an error to be thrown
      await expect(em.flush()).rejects.toThrow(
        "Validation error: AuthorStat#1 nullableInteger must be smaller than or equal to 100",
      );
    });
  });

  describe("rangeValueRule", () => {
    it("can limit a numeric field to a range", async () => {
      const em = newEntityManager();

      // Given a new AuthorStat with an nullableInteger value of -1
      const as = newAuthorStat(em, { nullableInteger: -1 });
      // When flushing
      // Then expect an error to be thrown
      await expect(em.flush()).rejects.toThrow(
        "Validation error: AuthorStat#1 nullableInteger must be greater than or equal to 0",
      );

      // Given a new AuthorStat with an nullableInteger value of 101
      as.nullableInteger = 101;
      // When flushing
      // Then expect an error to be thrown
      await expect(em.flush()).rejects.toThrow(
        "Validation error: AuthorStat#1 nullableInteger must be smaller than or equal to 100",
      );
    });

    it("cannot limit a non-numeric field", async () => {
      const em = newEntityManager();

      // Given a new AuthorStat with an nullableText string value
      const as = newAuthorStat(em, { nullableText: "Hello" });
      // When flushing
      // Then expect an error to be thrown
      await expect(em.flush()).rejects.toThrow("Validation error: AuthorStat#1 nullableText must be a number");
    });
  });

  it("resurrects a statistic by name and the exact days array on upsert", async () => {
    // Given two soft-deleted statistics with the same name and overlapping days.
    const setup = newEntityManager();
    const short = newAuthorStat(setup, { name: "weekly", days: [1, 2] });
    const long = newAuthorStat(setup, { name: "weekly", days: [1, 2, 3] });
    await setup.flush();
    // And both statistics are soft-deleted.
    short.deletedAt = jan1;
    long.deletedAt = jan1;
    await setup.flush();
    const em = newEntityManager();

    // When the shorter days array identifies a statistic to upsert.
    await em.upsert(AuthorStat, {
      name: "weekly",
      days: [1, 2],
      smallint: short.smallint,
      integer: short.integer,
      bigint: short.bigint,
      decimal: short.decimal,
      real: short.real,
      smallserial: short.smallserial,
      serial: short.serial,
      bigserial: short.bigserial,
      doublePrecision: short.doublePrecision,
    });
    await em.flush();

    // Then only the statistic with the exact days array is resurrected.
    expect(await select("author_stats")).toMatchObject([
      { id: 1, name: "weekly", days: [1, 2], deleted_at: null },
      { id: 2, name: "weekly", days: [1, 2, 3], deleted_at: jan1 },
    ]);
  });

  it("resurrects a statistic by name and the exact days array on findOrCreate", async () => {
    // Given two soft-deleted statistics with the same name and overlapping days.
    const setup = newEntityManager();
    const short = newAuthorStat(setup, { name: "weekly", days: [1, 2] });
    const long = newAuthorStat(setup, { name: "weekly", days: [1, 2, 3] });
    await setup.flush();
    // And both statistics are soft-deleted.
    short.deletedAt = jan1;
    long.deletedAt = jan1;
    await setup.flush();
    const em = newEntityManager();

    // When the shorter days array identifies a statistic to find or create.
    await em.findOrCreate(
      AuthorStat,
      { name: "weekly", days: [1, 2] },
      {
        smallint: short.smallint,
        integer: short.integer,
        bigint: short.bigint,
        decimal: short.decimal,
        real: short.real,
        smallserial: short.smallserial,
        serial: short.serial,
        bigserial: short.bigserial,
        doublePrecision: short.doublePrecision,
      },
    );
    await em.flush();

    // Then only the statistic with the exact days array is resurrected.
    expect(await select("author_stats")).toMatchObject([
      { id: 1, name: "weekly", days: [1, 2], deleted_at: null },
      { id: 2, name: "weekly", days: [1, 2, 3], deleted_at: jan1 },
    ]);
  });

  it("resurrects an unflushed statistic by its days array", async () => {
    // Given an unflushed, soft-deleted statistic that has no database row to find.
    const em = newEntityManager();
    const stat = newAuthorStat(em, { name: "weekly", days: [1, 2], deletedAt: jan1 });

    // When a separate array with the same days identifies the statistic.
    await em.upsert(AuthorStat, { name: "weekly", days: [1, 2] });

    // Then the original statistic is resurrected instead of creating another one.
    expect(stat.deletedAt).toBeUndefined();
  });

  it("finds the exact days array when many statistics are in memory", async () => {
    // Given enough statistics to enable the EntityManager's scalar field indexes.
    const em = newEntityManager();
    for (let i = 0; i < 500; i++) {
      newAuthorStat(em, { name: `stat${i}`, days: [i] });
    }
    // And two statistics share a name but cover the same days in different orders.
    newAuthorStat(em, { name: "weekly", days: [2, 1] });
    const stat = newAuthorStat(em, { name: "weekly", days: [1, 2] });

    // When a separate array identifies the statistic to find or create.
    const found = await em.findOrCreate(
      AuthorStat,
      { name: "weekly", days: [1, 2] },
      {
        smallint: stat.smallint,
        integer: stat.integer,
        bigint: stat.bigint,
        decimal: stat.decimal,
        real: stat.real,
        smallserial: stat.smallserial,
        serial: stat.serial,
        bigserial: stat.bigserial,
        doublePrecision: stat.doublePrecision,
      },
    );

    // Then array order and contents identify the original statistic.
    expect(found).toBe(stat);
  });
});
