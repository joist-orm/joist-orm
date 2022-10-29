import { insertAuthor, insertBook, insertBookReview } from "@src/entities/inserts";
import { Author, Book, BookReview, newAuthor } from "../entities";
import { newEntityManager } from "../setupDbTests";

describe("hasManyDerived", () => {
  it("can load a collection", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = newEntityManager();
    const author = await em.load(Author, "1");
    const books = await author.reviewedBooks.load();
    expect(books.length).toBeGreaterThan(0);
  });

  it("can populate a collection", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = newEntityManager();
    const author = await em.load(Author, "1", "reviewedBooks");
    expect(author.reviewedBooks.get.length).toBeGreaterThan(0);
  });

  it("does not cache the collection value", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = newEntityManager();
    const [b1, b2] = await em.find(Book, { id: ["1", "2"] });
    const author = await em.load(Author, "1", "reviewedBooks");
    const review = await em.load(BookReview, "1");

    expect(author.reviewedBooks.get).toEqual([b1]);
    review.book.set(b2);
    expect(author.reviewedBooks.get).toEqual([b2]);
  });

  it("can set a collection", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = newEntityManager();
    const [b1, b2] = await em.find(Book, { id: ["1", "2"] });
    const author = await em.load(Author, "1", "reviewedBooks");

    expect(author.reviewedBooks.get).toEqual([b1]);
    author.reviewedBooks.set([b2]);
    await em.flush();
    expect(author.reviewedBooks.get).toEqual([b2]);
  });

  it("can add to a collection", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });

    const em = newEntityManager();
    const book = await em.load(Book, "1", "reviews");
    const author = await em.load(Author, "1", "reviewedBooks");

    expect(author.reviewedBooks.get).toHaveLength(0);
    author.reviewedBooks.add(book);
    await em.flush();
    expect(author.reviewedBooks.get).toEqual([book]);
  });

  it("can remove from a collection", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = newEntityManager();
    const book = await em.load(Book, "1", "reviews");
    const author = await em.load(Author, "1", "reviewedBooks");

    expect(author.reviewedBooks.get).toEqual([book]);
    author.reviewedBooks.remove(book);
    await em.flush();
    expect(author.reviewedBooks.get).toHaveLength(0);
  });

  it("can be refreshed", async () => {
    await insertAuthor({ first_name: "a1" });

    const em = newEntityManager();
    const author = await em.load(Author, "a:1", "reviewedBooks");
    expect(author.reviewedBooks.get).toEqual([]);

    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });
    await em.refresh(author);

    expect(author.reviewedBooks.get.length).toEqual(1);
  });

  it("in tests can be called before and after flush", async () => {
    const em = newEntityManager();
    // Given a new deeply loaded test entity
    const a = newAuthor(em);
    // Then we can call `.get` even though we've not explicitly populated the collection
    expect(a.reviewedBooks.get).toBeDefined();
    // And after flushing (i.e. the entity is no longer new)
    await em.flush();
    // Then it still works
    expect(a.reviewedBooks.get).toBeDefined();
  });
});
