import { Author, Book } from "../entities";
import { newEntityManager } from "../setupDbTests";

describe("Book", () => {
  it("non-null reference might still have a null id", async () => {
    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1" });
    const b1 = em.create(Book, { title: "b1", author: a1 });
    expect(b1.author.id).toBeUndefined();
    expect(b1.author.isSet).toBeTruthy();
  });

  it("should have default values populated immediately on create if they aren't provided as opts", async () => {
    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1" });
    const b1 = em.create(Book, { title: "b1", author: a1 });
    expect(b1.order).toEqual(0);
  });

  it("can change authors", async () => {
    const em = newEntityManager();
    // Given an author with a loaded list of books
    const a1 = em.create(Author, { firstName: "a1" });
    const b1 = em.create(Book, { title: "b1", author: a1 });
    // And the book is initially in the author's loaded collection
    expect(a1.books.get).toEqual([b1]);
    // When we make a new author and move to the book to it
    const a2 = em.create(Author, { firstName: "a2" });
    b1.author.set(a2);
    // Then both a1 and a2 book collections are correct
    expect(a1.books.get).toEqual([]);
    expect(a2.books.get).toEqual([b1]);
  });

  it("can change authors via an id set", async () => {
    const em = newEntityManager();
    // Given an author with a loaded list of books
    const a1 = em.create(Author, { firstName: "a1" });
    const b1 = em.create(Book, { title: "b1", author: a1 });
    // And the book is initially in the author's loaded collection
    expect(a1.books.get).toEqual([b1]);
    // When we make a new author and move to the book to it
    const a2 = em.create(Author, { firstName: "a2" });
    await em.flush();
    b1.author.id = "a:2";
    // Then both a1 and a2 book collections are correct
    expect(a1.books.get).toEqual([]);
    expect(a2.books.get).toEqual([b1]);
  });
});
