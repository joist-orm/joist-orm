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

  it("can match collections", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { books: [{}, {}] });
    await em.flush();
    await expect(a1).toMatchEntity({
      books: [{ title: "title" }, { title: "title" }],
    });
  });
});
