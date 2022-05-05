import { insertAuthor } from "@src/entities/inserts";
import { AuthorStat, newAuthorStat } from "../entities";
import { newEntityManager, testDriver } from "../setupDbTests";

describe("AuthorStat", () => {
  it("can save", async () => {
    const em = newEntityManager();
    const as = newAuthorStat(em);
    await em.flush();
  });

  it("can load", async () => {
    await insertAuthor({ first_name: "a1" });
    await testDriver.insert("author_stats", {
      smallint: 1,
      integer: 1,
      bigint: 1,
      decimal: 1,
      real: 1,
      smallserial: 1,
      serial: 1,
      bigserial: 1,
      double_precision: 1,
    });
    const em = newEntityManager();
    const as = await em.load(AuthorStat, "1");
  });
});
