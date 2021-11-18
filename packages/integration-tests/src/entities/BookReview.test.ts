import { Author, Book, BookReview } from "../entities";
import { newEntityManager } from "../setupDbTests";

describe("BookReview", () => {
  it("can be created without a root author", async () => {
    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1" });
    const b1 = em.create(Book, { title: "b1", author: a1 });
    const br1 = em.create(BookReview, { book: b1, rating: 5 });
    expect(br1.rootAuthor.get).toEqual(a1);
    await em.flush();
  });

  it("can be created without a root author and book.author is not loaded", async () => {
    const em1 = newEntityManager();
    const a1 = em1.create(Author, { firstName: "a1" });
    let b1: Book = em1.create(Book, { title: "b1", author: a1 });
    await em1.flush();

    const em2 = newEntityManager();
    b1 = await em2.load(Book, "b:1");
    const br1 = em2.create(BookReview, { book: b1, rating: 5 });
    expect(br1.rootAuthor.id).toEqual("a:1");
    await em2.flush();
  });
});
