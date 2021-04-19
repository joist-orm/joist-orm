import { newAuthor, newBook, newPublisher } from "@src/entities";
import { newEntityManager } from "./setupDbTests";

describe("toMatchEntity", () => {
  it("can match primitive fields", async () => {
    const em = newEntityManager();
    const p1 = newPublisher(em);
    await em.flush();
    await expect(p1).toMatchEntity({ name: "name" });
  });

  it("can match references", async () => {
    const em = newEntityManager();
    const b1 = newBook(em);
    await em.flush();
    await expect(b1).toMatchEntity({ author: { firstName: "a1" } });
  });

  it("can match reference with entity directly", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const b1 = newBook(em, { author: a1 });
    await em.flush();
    await expect(b1).toMatchEntity({ author: a1 });
  });

  it("can match collections", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { books: [{}, {}] });
    await em.flush();
    await expect(a1).toMatchEntity({
      books: [{ title: "title" }, { title: "title" }],
    });
  });

  it("can match collections of the entity itself", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { books: [{}, {}] });
    const b1 = a1.books.get[0];
    await em.flush();
    await expect(a1).toMatchEntity({
      books: [b1, { title: "title" }],
    });
  });
});
