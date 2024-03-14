import { Book, newAuthor } from "@src/entities";
import { newEntityManager } from "@src/setupDbTests";

describe("EntityManager.number.find", () => {
  it("does not fail on new entities", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const authors = await em.find(Book, { author: a1 });
    expect(authors.length).toBe(0);
  });

  it("does not fail on new entities in a loop", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const [b1, b2] = await Promise.all([
      //
      em.findOrCreate(Book, { author: a1 }, { title: "b1" }),
      em.findOrCreate(Book, { author: a1 }, { title: "b1" }),
    ]);
    expect(b1).toBe(b2);
  });

  it("does not fail in a loop", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const [b1, b2] = await Promise.all([
      em.findOrCreate(Book, { title: "t1" }, { author: a1 }),
      em.findOrCreate(Book, { title: "t2" }, { author: a1 }),
    ]);
    expect(b1).not.toBe(b2);
  });
});
