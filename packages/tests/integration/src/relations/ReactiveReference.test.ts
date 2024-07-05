import { Author, Book } from "@src/entities";
import { insertAuthor, insertBook, insertBookReview, update } from "@src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "@src/testEm";

describe("ReactiveReference", () => {
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
});
