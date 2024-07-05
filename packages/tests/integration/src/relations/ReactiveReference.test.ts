import { Author, Book, BookReview, newAuthor } from "@src/entities";
import { insertAuthor, insertBook, insertBookReview, insertPublisher, select, update } from "@src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "@src/testEm";

describe("ReactiveReference", () => {
  it("can be accessed if implicitly loaded", async () => {
    const em = newEntityManager();
    // Given a new author, with at least 1 book
    const a = newAuthor(em, { books: [{}] });
    const [b1] = a.books.get;
    // And we've not explicitly asked for `favoriteBook` to be loaded
    // Then we can access it anyway, because it realizes the load hint is in-memory
    expect(a.favoriteBook.get).toMatchEntity(b1);
  });

  it("reports the initial value as changed", async () => {
    const em = newEntityManager();
    // Given a new author, with at least 1 book
    const a = newAuthor(em, { books: [{}] });
    // When the field hasn't been accessed yet, it's reported as not changed
    expect(a.changes.favoriteBook.hasChanged).toBe(false);
    expect(a.changes.favoriteBook.hasUpdated).toBe(false);
    // But as soon as we access it
    a.favoriteBook.get;
    // Then the field is considered changed
    expect(a.changes.favoriteBook.hasChanged).toBe(true);
    expect(a.changes.favoriteBook.hasUpdated).toBe(false);
  });

  it("reports the cached value as unchanged", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await update("authors", { id: 1, favorite_book_id: 1 });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1", "favoriteBook");
    expect(a.favoriteBook.isLoaded).toBe(true);
    expect(a.changes.favoriteBook.hasChanged).toBe(false);
    expect(a.changes.favoriteBook.hasUpdated).toBe(false);
  });

  it("load does not populates if unnecessary for calculating on a new entity", async () => {
    const em = newEntityManager();
    // Given a new author
    const a = em.create(Author, { firstName: "a1" });
    const spy = jest.spyOn(em, "populate");
    resetQueryCount();
    // When we load the favoriteBook
    const result = await a.favoriteBook.load();
    expect(result).toBeUndefined();
    expect(queries.length).toEqual(0);
    expect(a.favoriteBook.isLoaded).toBe(true);
    // Then b/c its load hint was already loaded (it's a new entity), there is no need to call populate
    expect(spy).not.toHaveBeenCalled();
  });

  it("load does not populate if already calculated", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await update("authors", { id: 1, favorite_book_id: 1 });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    const spy = jest.spyOn(em, "populate");
    resetQueryCount();
    const result = await a.favoriteBook.load();
    expect(result).toBeDefined();
    expect(queries.length).toEqual(1);
    expect(a.favoriteBook.isLoaded).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("load automatically populates if the already loaded graph is stale", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ book_id: 1, rating: 1 });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b2", author_id: 2 });
    await insertBookReview({ book_id: 2, rating: 2 });
    await update("authors", { id: 1, favorite_book_id: 1 });
    const em = newEntityManager();
    // Given we have an existing author
    const a1 = await em.load(Author, "a:1", "favoriteBook");
    // And we've already loaded its favoriteBook
    expect(a1.favoriteBook.isLoaded).toBe(true);
    expect(a1.favoriteBook.get!.title).toBe("b1");
    // When we mutate the graph by moving b2 (which has reviews unloaded) into a1
    const b2 = await em.load(Book, "b:2");
    b2.author.set(a1);
    // And we access a1.favoriteBook again we see the stale value
    expect(a1.favoriteBook.get!.title).toBe("b1");
    // But if we load it again
    const spy = jest.spyOn(em, "populate");
    await a1.favoriteBook.load();
    expect(spy).toHaveBeenCalledWith(a1, { hint: { books: { reviews: {} } } });
    // Then we see the correct value
    expect(a1.favoriteBook.get!.title).toBe("b2");
  });

  it("load does not issue a query if empty", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    const spy = jest.spyOn(em, "populate");
    resetQueryCount();
    const result = await a.favoriteBook.load();
    expect(result).toBeUndefined();
    expect(queries).toEqual([]);
    expect(a.favoriteBook.isLoaded).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("with o2o references does not fail em.delete", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await update("authors", { id: 1, favorite_book_id: 1 });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1", "favoriteBook");
    em.delete(a);
    await em.flush();
  });

  it("drives recalc of downstream ReactiveFields", async () => {
    // Given two books, and the 1st is currently the favorite
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });
    await update("authors", { id: 1, favorite_book_id: 1 });
    await insertBookReview({ book_id: 1, rating: 2 });
    await insertBookReview({ book_id: 2, rating: 1 });
    // When we make the 2nd book to have a higher rating
    const em = newEntityManager();
    const br2 = await em.load(BookReview, "br:2");
    br2.rating = 3;
    await em.flush();
    // Then we recalculated the "titles_of_favorite_books" as well
    const rows = await select("publishers");
    expect(rows).toMatchObject([{ id: 1, titles_of_favorite_books: "b2" }]);
  });

  it("drives recalc of downstream ReactiveFields through o2o", async () => {
    // Given two books, and the 1st is currently the favorite
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    await update("authors", { id: 1, favorite_book_id: 1 });
    // When we change the title of the book
    const em = newEntityManager();
    const b1 = await em.load(Book, "b:1");
    b1.title = "b22";
    await em.flush();
    // Then we recalculated the "titles_of_favorite_books" as well
    const rows = await select("publishers");
    expect(rows).toMatchObject([
      {
        id: 1,
        titles_of_favorite_books: "b22",
      },
    ]);
  });
});
