import { Book, newAuthor, newBook } from "@src/entities";
import { newEntityManager } from "@src/setupDbTests";

describe("Book", () => {
  it("can save a book", async () => {
    const em1 = newEntityManager();
    const b1 = newBook(em1, { title: "b1", author: { firstName: "a1" } });
    await em1.flush();

    const em2 = newEntityManager();
    const b2 = await em2.load(Book, b1.idOrFail, "author");
    expect(b2.title).toEqual("b1");
    expect(b2.author.get.firstName).toEqual("a1");
  });

  it("can update a book", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const b1 = newBook(em, { author: a1 });
    await em.flush();

    const a2 = newAuthor(em);
    b1.author.set(a2);
    await em.flush();
  });
});
