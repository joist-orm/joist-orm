import { expect } from "@jest/globals";
import { ReadOnlyError } from "joist-orm";
import { Author, Book, BookReview, Publisher } from "src/entities";
import { insertAuthor, insertBook, insertPublisher, select } from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

describe("EntityManager.modes", () => {
  it("read-only cannot em.flush", async () => {
    const em = newEntityManager();
    em.mode = "read-only";
    await expect(em.flush()).rejects.toThrow(ReadOnlyError);
  });

  it("read-only cannot mutate entities", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    em.mode = "read-only";
    const a1 = await em.load(Author, "a:1");
    expect(() => {
      a1.firstName = "a2";
    }).toThrow(ReadOnlyError);
  });

  it("in-memory writes does not commit", async () => {
    // Given an author
    await insertAuthor({ first_name: "a1" });
    // When we change it
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    a1.firstName = "a2";
    em.mode = "in-memory-writes";
    await em.flush();
    // Then it didn't actually change
    const rows = await select("authors");
    expect(rows).toMatchObject([{ first_name: "a1" }]);
    // But we did run the hooks
    expect(a1.transientFields.beforeFlushRan).toBe(true);
    expect(a1.transientFields.beforeUpdateRan).toBe(true);
    // Even though we're not going to actually commit, `beforeCommit` hooks
    // are still run because that might be useful? :thinking:
    expect(a1.transientFields.beforeCommitRan).toBe(true);
    // But afterCommit is definitely not ran
    expect(a1.transientFields.afterCommitRan).toBe(false);
  });

  it("recalculates ReactiveQueryFields", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    // When we add a new BookReview
    const em = newEntityManager();
    em.mode = "in-memory-writes";
    const b1 = await em.load(Book, "b:1");
    em.create(BookReview, { book: b1, rating: 1 });
    await em.flush();
    // Then we can observe the publisher recalc
    const p1 = em.entities.find((e) => e instanceof Publisher)!;
    expect(p1.numberOfBookReviews.get).toBe(1);
    expect(p1.transientFields.numberOfBookReviewCalcs).toBe(1);
    // And the validation rule ran
    expect(p1.transientFields.numberOfBookReviewEvals).toBe(1);
    // But it didn't actually change
    const rows = await select("publishers");
    expect(rows).toMatchObject([{ number_of_book_reviews: 0 }]);
  });
});
