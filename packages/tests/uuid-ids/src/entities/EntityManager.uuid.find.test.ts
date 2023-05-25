import { newAuthor } from "@src/entities/Author.factories";
import { Book } from "@src/entities/Book";
import { newEntityManager } from "@src/setupDbTests";

describe("EntityManager.uuid.find", () => {
  it("does not fail on new entities", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const b1 = await em.find(Book, { author: a1 });
  });
});
