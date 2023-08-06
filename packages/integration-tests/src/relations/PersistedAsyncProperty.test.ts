import { insertAuthor, insertBook, insertBookReview } from "@src/entities/inserts";
import { Author, Book } from "../entities";
import { newEntityManager } from "../setupDbTests";

describe("PersistedAsyncProperty", () => {
  it("can repopulate a changed tree", async () => {
    // Given a tree of Author/Book/Review
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });
    await insertBookReview({ rating: 1, book_id: 1 });
    const em = newEntityManager();
    // And we can load the numberOfPublicReviews tree
    const a = await em.load(Author, "a:1", "numberOfPublicReviews");
    expect(a.numberOfPublicReviews.get).toBe(1);
    // When we move Book b2 into a1 (instead of creating a new one, to ensure its review collection is not loaded)
    const b2 = await em.load(Book, "b:2");
    b2.author.set(a);
    // Then calc it again, it will blow up
    expect(() => a.numberOfPublicReviews.get).toThrow("get was called when not preloaded");
    // Even if we try to .load it
    expect(() => a.numberOfPublicReviews.load()).toThrow("get was called when not preloaded");
    // But if we force the load
    expect(await a.numberOfPublicReviews.load({ forceReload: true })).toBe(1);
  });
});
