import { newAuthorStat } from "../entities";
import { newEntityManager } from "../setupDbTests";

describe("AuthorStat", () => {
  it("can save", async () => {
    const em = newEntityManager();
    const as = newAuthorStat(em);
    await em.flush();
  });
});
