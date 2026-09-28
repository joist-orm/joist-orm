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
});
