import { newAuthorStat } from "../entities";
import { newEntityManager } from "../setupDbTests";

describe("AuthorStat", () => {
  describe("rangeValueRule", () => {
    it("can limit a field to a range", async () => {
      const em = newEntityManager();

      // Given a new AuthorStat with an integer value of -1
      const as = newAuthorStat(em, { integerNull: -1 });
      // When flushing
      // Then expect an error to be thrown
      await expect(em.flush()).rejects.toThrow("integerNull must be greater than or equal to 0");

      // And given a new AuthorStat with an integer value of -1
      as.integer = 101;
      // When flushing
      // Then expect an error to be thrown
      await expect(em.flush()).rejects.toThrow("integerNull must be lower than or equal to 100");
    });

    it("can ignore undefined ranges", async () => {
      const em = newEntityManager();

      // Given a new AuthorStat with an undefined integer value
      const as = newAuthorStat(em, { integerNull: 1 });
      as.integerNull = undefined;
      // When flushing
      // Then expect no error to be thrown
      await expect(em.flush()).resolves.toBeTruthy();
    });
  });
});
