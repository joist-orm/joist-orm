import { newAuthorStat } from "../entities";
import { newEntityManager } from "../setupDbTests";

describe("AuthorStat", () => {
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
      await expect(em.flush()).resolves.toBeTruthy();
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
