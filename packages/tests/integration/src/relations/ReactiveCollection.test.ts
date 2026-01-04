import { Author, Book, BookReview, Entity, EntityManager, newAuthor, newBook, newBookReview } from "@src/entities";
import { insertAuthor, insertAuthorToBestReview, insertBook, insertBookReview, select } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";

describe("ReactiveCollection", () => {
  describe("loading behavior", () => {
    it("can be accessed if implicitly loaded", async () => {
      const em = newEntityManager();
      // Given a new author with a book that has a 5-star review
      const a = newAuthor(em, {
        books: [{ reviews: [{ rating: 5 }] }],
      });
      const [b] = a.books.get;
      const [r] = b.reviews.get;
      // Then we can access bestReviews because the hint is in-memory
      expect(a.bestReviews.get).toMatchEntity([r]);
    });

    it("cannot be accessed if new/unloaded", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ author_id: 1, title: "b1" });
      const em = newEntityManager();
      const a = em.create(Author, { firstName: "a1" });
      const b = await em.load(Book, "b:1");
      a.books.add(b);
      // This shouldn't work, and is probably a bug in ReactiveCollection.isLoaded
      expect(a.bestReviews.get).toMatchEntity([]);
    });

    it("returns empty array for new author with no reviews", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {});
      expect(a.bestReviews.get).toEqual([]);
    });

    it("filters reviews below threshold", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        // 1 included, 2 excluded
        books: [{ reviews: [{ rating: 5 }, { rating: 4 }, { rating: 3 }] }],
      });
      const [b] = a.books.get;
      const [br1] = b.reviews.get;
      expect(a.bestReviews.get).toMatchEntity([br1]);
    });

    it("throws when accessing get before loading", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      expect(() => (a.bestReviews as any).get).toThrow("Author:1.bestReviews has not been loaded yet");
    });

    it("load shallow populates the relation", async () => {
      // Given an author with two reviews
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 4 });
      await insertBookReview({ book_id: 1, rating: 5 });
      // And only one of them has been derived as a best review
      await insertAuthorToBestReview({ author_id: 1, book_review_id: 2 });
      const em = newEntityManager();
      // When we populate bestReviews
      const a = await em.load(Author, "a:1", "bestReviews");
      // Then it has only the 1 book review
      expect(a.bestReviews.get.length).toBe(1);
      // And we only have 1 BookReview in memory
      expect(em.entities).toMatchEntity(["a:1", "br:2"]);
      // And we did not invoke the calculation
      expect(a.transientFields.bestReviewsCalcInvoked).toBe(0);
    });

    it("load fully populates forceReload", async () => {
      // Given an author with two reviews
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 4 });
      await insertBookReview({ book_id: 1, rating: 5 });
      // And only one of them has been derived as a best review
      await insertAuthorToBestReview({ author_id: 1, book_review_id: 2 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // When we call forceReload
      const reviews = await a.bestReviews.load({ forceReload: true });
      // Then only the best review is returned
      expect(reviews.length).toBe(1);
      // And we pulled both into memory
      expect(entitiesSorted(em)).toMatchEntity(["a:1", "b:1", "br:1", "br:2"]);
      // And we recalc
      expect(a.transientFields.bestReviewsCalcInvoked).toBe(1);
    });

    it("load fully populates when dirty", async () => {
      // Given an author with two reviews
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 4 });
      await insertBookReview({ book_id: 1, rating: 5 });
      // And only one of them has been derived as a best review
      await insertAuthorToBestReview({ author_id: 1, book_review_id: 2 });
      const em = newEntityManager();
      // When we first load the 1st review, and change its rating
      const br1 = await em.load(BookReview, "br:1");
      br1.rating = 6;
      // Then we populate bestReviews
      const a = await em.load(Author, "a:1", "bestReviews");
      // It knows it needs to do a full populate & recalc
      expect(a.bestReviews.get).toMatchEntity([br1, "br:2"]);
      expect(entitiesSorted(em)).toMatchEntity(["a:1", "b:1", "br:1", "br:2"]);
      expect(a.transientFields.bestReviewsCalcInvoked).toBe(1);
    });
  });

  describe("reactive recalculation", () => {
    it("recalculates when rating changes across threshold", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, { books: [{ reviews: [{ rating: 4 }] }] });
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
        books: [{ reviews: [{ rating: 5 }] }],
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
        books: [{ reviews: [{ rating: 5 }] }],
      });
      const a2 = newAuthor(em, {});
      await em.flush();
      const [b] = a1.books.get;
      expect(a1.bestReviews.get.length).toBe(1);
      // Move book to different author
      b.author.set(a2);
      expect(a1.bestReviews.get).toEqual([]);
    });

    it("other side reflects changes in real-time as ratings change", async () => {
      // Given an author with two reviews
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 4 });
      await insertBookReview({ book_id: 1, rating: 5 });
      await insertAuthorToBestReview({ author_id: 1, book_review_id: 2 });
      const em = newEntityManager();
      // When we load the author & review
      const a = await em.load(Author, "a:1", "bestReviews");
      const br1 = await em.load(BookReview, "br:1", "bestReviewAuthors");
      // Initially br1 is not a "best review" so the other side is empty
      expect(br1.bestReviewAuthors.get).toEqual([]);
      // When the rating changes to 5 (above threshold)
      br1.rating = 5;
      // Then the controlling side (Author.bestReviews) is initially stale
      expect(a.bestReviews.get).toMatchEntity(["br:2"]);
      // But when we reload it
      await a.bestReviews.load();
      // Then it knows it needs to recalc
      expect(a.bestReviews.get).toMatchEntity([br1, "br:2"]);
      // And the other side (BookReview.bestReviewAuthors) reflects this in real-time
      expect(br1.bestReviewAuthors.get).toMatchEntity([a]);
      // When the rating drops back below threshold
      br1.rating = 3;
      // Then both sides reflect the change
      expect(a.bestReviews.get).toMatchEntity(["br:2"]);
      expect(br1.bestReviewAuthors.get).toMatchEntity([]);
    });
  });

  describe("persistence", () => {
    it("persists new join table rows on flush", async () => {
      const em = newEntityManager();
      newAuthor(em, { books: [{ reviews: [{ rating: 5 }] }] });
      await em.flush();
      // Check join table has the row
      const rows = await select("authors_to_best_reviews");
      expect(rows).toMatchObject([{ author_id: 1, book_review_id: 1 }]);
    });

    it("deletes join table rows on flush when review drops below threshold", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, { books: [{ reviews: [{ rating: 5 }] }] });
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
  });

  describe("deleted entities", () => {
    it("filters by default", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [{ reviews: [{ rating: 5 }] }],
      });
      await em.flush();
      const [b] = a.books.get;
      const [r] = b.reviews.get;
      expect(a.bestReviews.get).toMatchEntity([r]);
      // Delete the review
      em.delete(r);
      expect(a.bestReviews.get).toEqual([]);
    });

    it("included by getWithDeleted", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [{ reviews: [{ rating: 5 }] }],
      });
      await em.flush();
      const [b] = a.books.get;
      const [r] = b.reviews.get;
      em.delete(r);
      expect(a.bestReviews.getWithDeleted).toMatchEntity([r]);
    });
  });

  describe("read-only enforcement", () => {
    it("throws on set()", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {});
      expect(() => (a.bestReviews as any).set([])).toThrow("Cannot set");
    });
  });

  describe("caching", () => {
    it("caches calculation result", async () => {
      const em = newEntityManager();
      const a = newAuthor(em, {
        books: [{ reviews: [{ rating: 5 }] }],
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
        books: [{ reviews: [{ rating: 5 }] }],
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

function entitiesSorted(em: EntityManager): Entity[] {
  return [...em.entities].sort((a, b) => a.toTaggedString().localeCompare(b.toTaggedString()));
}
