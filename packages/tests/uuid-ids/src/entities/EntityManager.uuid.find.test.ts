import { newAuthor } from "@src/entities/Author.factories";
import { Book } from "@src/entities/Book";
import { newEntityManager } from "@src/setupDbTests";

describe("EntityManager.uuid.find", () => {
  it("does not fail on new entities", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const b1 = await em.find(Book, { author: a1 });
  });

  it("does not fail on new entities in a loop", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const b1 = await Promise.all([
      //
      em.findOrCreate(Book, { author: a1 }, { title: "b1" }),
      em.findOrCreate(Book, { author: a1 }, { title: "b1" }),
    ]);
  });

  it("does not fail in a loop", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const b1 = await Promise.all([
      em.findOrCreate(Book, { title: "t1" }, { author: a1 }),
      em.findOrCreate(Book, { title: "t2" }, { author: a1 }),
    ]);
  });
});
