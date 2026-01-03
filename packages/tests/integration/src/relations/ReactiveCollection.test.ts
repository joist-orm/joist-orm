import { Author, Book, BookReview, newAuthor, newBook, newBookReview } from "@src/entities";
import { insertAuthor, insertBook, insertBookReview, insertAuthorToBestReview, select } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";

describe("ReactiveCollection", () => {
  describe("loading behavior", () => {
    it("can be accessed if implicitly loaded", async () => {
      const em = newEntityManager();
      // Given a new author with a book that has a 5-star review
      const a = newAuthor(em, {
        books: [
          {
            reviews: [{ rating: 5 }],
          },
        ],
      });
      const [b] = a.books.get;
      const [r] = b.reviews.get;
      // Then we can access bestReviews because the hint is in-memory
      expect(a.bestReviews.get).toMatchEntity([r]);
    });

    it("returns empty array for new author with no reviews", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {});
      expect(a.bestReviews.get).toEqual([]);
    });

    it("filters reviews below threshold", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [
          {
            reviews: [
              { rating: 5 }, // included
              { rating: 4 }, // excluded
              { rating: 3 }, // excluded
            ],
          },
        ],
      });
      const [b] = a.books.get;
      const reviews = b.reviews.get;
      expect(a.bestReviews.get).toMatchEntity([reviews[0]]);
    });

    it("throws when accessing get before loading", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      expect(() => a.bestReviews.get).toThrow("has not been loaded yet");
    });

    it("load populates the reactive hint with forceReload", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 5 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // forceReload ensures we populate the hint rather than just load from join table
      const reviews = await a.bestReviews.load({ forceReload: true });
      expect(reviews.length).toBe(1);
      expect(a.bestReviews.isLoaded).toBe(true);
    });
  });

  describe("reactive recalculation", () => {
    it("recalculates when rating changes across threshold", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [
          {
            reviews: [{ rating: 4 }],
          },
        ],
      });
      await em.flush();

      // Initially not in bestReviews
      expect(a.bestReviews.get).toEqual([]);

      // Change rating to 5
      const [b] = a.books.get;
      const [r] = b.reviews.get;
      r.rating = 5;

      // Now should be included
      expect(a.bestReviews.get).toMatchEntity([r]);
    });

    it("recalculates when review is added", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, { books: [{}] });
      await em.flush();

      expect(a.bestReviews.get).toEqual([]);

      // Add a 5-star review
      const [b] = a.books.get;
      const r = newBookReview(em, { book: b, rating: 5 });

      expect(a.bestReviews.get).toMatchEntity([r]);
    });

    it("recalculates when review is removed", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [
          {
            reviews: [{ rating: 5 }],
          },
        ],
      });
      await em.flush();

      const [b] = a.books.get;
      const [r] = b.reviews.get;
      expect(a.bestReviews.get).toMatchEntity([r]);

      // Delete the review
      em.delete(r);

      expect(a.bestReviews.get).toEqual([]);
    });

    it("recalculates when book is added to author", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {});
      const b = newBook(em, { title: "b1", author: a, reviews: [{ rating: 5 }] });
      await em.flush();

      expect(a.bestReviews.get).toMatchEntity([b.reviews.get[0]]);
    });

    it("recalculates when book is removed from author", async () => {
      const em = newEntityManager();
      const a1 = newAuthor(em, {
        books: [
          {
            reviews: [{ rating: 5 }],
          },
        ],
      });
      const a2 = newAuthor(em, {});
      await em.flush();

      const [b] = a1.books.get;
      expect(a1.bestReviews.get.length).toBe(1);

      // Move book to different author
      b.author.set(a2);

      expect(a1.bestReviews.get).toEqual([]);
    });
  });

  describe("persistence", () => {
    it("persists new join table rows on flush", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [
          {
            reviews: [{ rating: 5 }],
          },
        ],
      });
      await em.flush();

      // Check join table has the row
      const rows = await select("authors_to_best_reviews");
      expect(rows.length).toBe(1);
      expect(rows[0]).toMatchObject({
        author_id: 1,
        book_review_id: 1,
      });
    });

    it("deletes join table rows on flush when review drops below threshold", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [
          {
            reviews: [{ rating: 5 }],
          },
        ],
      });
      await em.flush();

      // Verify row exists
      let rows = await select("authors_to_best_reviews");
      expect(rows.length).toBe(1);

      // Drop rating below threshold
      const [b] = a.books.get;
      const [r] = b.reviews.get;
      r.rating = 4;
      await em.flush();

      // Verify row deleted
      rows = await select("authors_to_best_reviews");
      expect(rows.length).toBe(0);
    });

    it("loads correctly from fresh EntityManager", async () => {
      // Setup data directly in DB
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 5 });
      // Insert join table row
      await insertAuthorToBestReview({
        author_id: 1,
        book_review_id: 1,
      });

      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      const reviews = await a.bestReviews.load();

      expect(reviews.length).toBe(1);
    });
  });

  describe("edge cases", () => {
    it("handles empty collection correctly", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {});
      expect(a.bestReviews.get).toEqual([]);
      expect(a.bestReviews.isLoaded).toBe(true);
      await em.flush();

      const rows = await select("authors_to_best_reviews");
      expect(rows.length).toBe(0);
    });

    it("filters deleted entities by default", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [
          {
            reviews: [{ rating: 5 }],
          },
        ],
      });
      await em.flush();

      const [b] = a.books.get;
      const [r] = b.reviews.get;
      expect(a.bestReviews.get).toMatchEntity([r]);

      // Delete the review
      em.delete(r);

      expect(a.bestReviews.get).toEqual([]);
    });

    it("includes deleted with getWithDeleted", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [
          {
            reviews: [{ rating: 5 }],
          },
        ],
      });
      await em.flush();

      const [b] = a.books.get;
      const [r] = b.reviews.get;
      em.delete(r);

      expect(a.bestReviews.getWithDeleted).toMatchEntity([r]);
    });
  });

  describe("read-only enforcement", () => {
    it("throws on add()", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {});
      const r = newBookReview(em, { rating: 5 });

      expect(() => (a.bestReviews as any).add(r)).toThrow("Cannot add");
    });

    it("throws on remove()", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [
          {
            reviews: [{ rating: 5 }],
          },
        ],
      });
      const [b] = a.books.get;
      const [r] = b.reviews.get;

      expect(() => (a.bestReviews as any).remove(r)).toThrow("Cannot remove");
    });

    it("throws on set()", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {});

      expect(() => (a.bestReviews as any).set([])).toThrow("Cannot set");
    });

    it("throws on removeAll()", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {});

      expect(() => (a.bestReviews as any).removeAll()).toThrow("Cannot removeAll");
    });
  });

  describe("caching", () => {
    it("caches calculation result", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [
          {
            reviews: [{ rating: 5 }],
          },
        ],
      });

      // Reset counter
      a.transientFields.bestReviewsCalcInvoked = 0;

      // First access
      a.bestReviews.get;
      expect(a.transientFields.bestReviewsCalcInvoked).toBe(1);

      // Second access should use cache
      a.bestReviews.get;
      expect(a.transientFields.bestReviewsCalcInvoked).toBe(1);
    });

    it("invalidates cache on dependency mutation", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [
          {
            reviews: [{ rating: 5 }],
          },
        ],
      });

      a.transientFields.bestReviewsCalcInvoked = 0;
      a.bestReviews.get;
      expect(a.transientFields.bestReviewsCalcInvoked).toBe(1);

      // Mutate a dependency
      const [b] = a.books.get;
      const [r] = b.reviews.get;
      r.rating = 4;

      // Should recalculate
      a.bestReviews.get;
      expect(a.transientFields.bestReviewsCalcInvoked).toBe(2);
    });
  });
});
