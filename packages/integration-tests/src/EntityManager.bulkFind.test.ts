import { zeroTo } from "@src/utils";
import { Book, newAuthor } from "./entities";
import { newEntityManager } from "./setupDbTests";

describe("EntityManager.bulkFind", () => {
  it("can find all", async () => {
    const n = 100;
    const em1 = newEntityManager();
    // Given a lot of authors
    const authors = zeroTo(n).map(() => newAuthor(em1));
    await em1.flush();

    // When we do an N+1 query on them
    const p = zeroTo(n).map(async (i) => em1.find(Book, { author: authors[i] }));
    await Promise.all(p);
  });
});
