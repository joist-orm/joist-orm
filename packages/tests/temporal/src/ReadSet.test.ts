import { ReadSetDriftError } from "joist-orm";
import { Author, newAuthor } from "src/entities";
import { knex, newEntityManager } from "src/setupDbTests";

describe("ReadSet", () => {
  it("accepts an unchanged microsecond-precision version", async () => {
    // Given an author whose version has database microsecond precision
    const seed = newEntityManager();
    const a = newAuthor(seed);
    await seed.flush();
    await knex("authors").where("id", a.idUntagged).update({ updated_at: "2050-01-01T00:00:00.123456Z" });
    const em = newEntityManager();
    const author = await em.load(Author, a.id);
    // When its loaded version is asserted
    em.assertUnchanged(author);
    // Then the unchanged version succeeds
    await expect(em.flush()).resolves.toEqual([]);
  });

  it("detects drift smaller than a millisecond", async () => {
    // Given a loaded microsecond-precision author version
    const seed = newEntityManager();
    const a = newAuthor(seed);
    await seed.flush();
    await knex("authors").where("id", a.idUntagged).update({ updated_at: "2050-01-01T00:00:00.123456Z" });
    const em = newEntityManager();
    const author = await em.load(Author, a.id);
    // And another connection advances the version by one microsecond
    await knex("authors").where("id", a.idUntagged).update({ updated_at: "2050-01-01T00:00:00.123457Z" });
    // When its loaded version is asserted
    em.assertUnchanged(author);
    // Then the microsecond drift is rejected
    await expect(em.flush()).rejects.toThrow(ReadSetDriftError);
  });

  it("compares instants across session timezones", async () => {
    // Given an author loaded from a UTC session
    const seed = newEntityManager();
    const a = newAuthor(seed);
    await seed.flush();
    const em = newEntityManager();
    const author = await em.load(Author, a.id);
    // When the assertion is checked in a transaction using a different timezone
    em.assertUnchanged(author);
    await em.transaction(async () => {
      await em.driver.executeQuery(em, "SET LOCAL TIME ZONE 'America/New_York'", []);
      // Then the same instant is accepted despite its different textual offset
      await expect(em.flush()).resolves.toEqual([]);
    });
  });
});
