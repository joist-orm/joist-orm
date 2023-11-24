import { Author } from "@src/entities";
import { insertAuthor, insertBook, update } from "@src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "@src/testEm";

describe("PersistedAsyncReference", () => {
  it("load populates if calculate for new entity", async () => {
    const em = newEntityManager();
    const a = em.create(Author, { firstName: "a1" });
    const spy = jest.spyOn(em, "populate");
    resetQueryCount();
    const result = await a.favoriteBook.load();
    expect(result).toBeUndefined();
    expect(queries.length).toEqual(0);
    expect(a.favoriteBook.isLoaded).toBe(true);
    expect(spy).toHaveBeenCalledWith(a, { hint: { books: { reviews: {} } } });
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
