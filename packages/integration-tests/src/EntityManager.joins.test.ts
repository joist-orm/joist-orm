import {
  insertAuthor,
  insertBook,
  insertBookReview,
  insertBookToTag,
  insertComment,
  insertCritic,
  insertLargePublisher,
  insertPublisherGroup,
  insertTag,
  update,
} from "@src/entities/inserts";
import { Author, Book, Critic, LargePublisher } from "./entities";
import { newEntityManager, queries, resetQueryCount } from "./setupDbTests";

describe("EntityManager.joins", () => {
  it("preloads o2m, m2o, and o2o relations", async () => {
    // Given a tree of Authors + Books + BookReviews + Comments
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertAuthor({ first_name: "a3" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });
    await insertBook({ title: "b3", author_id: 2 });
    await insertBookReview({ rating: 3, book_id: 1 });
    await insertComment({ text: "c1", parent_author_id: 1 });
    await insertComment({ text: "c2", parent_author_id: 1 });
    await insertComment({ text: "c3", parent_book_review_id: 1 });
    // And make the 3rd author the mentor of the 1st
    await update("authors", { id: 1, mentor_id: 3 });

    const em = newEntityManager();
    // When we load the two authors
    const [a1, a2] = await em.loadAll(Author, ["a:1", "a:2"]);
    // And preload the joins from this load hint
    resetQueryCount();
    const hint = { books: { reviews: "comment" }, comments: {}, mentor: {} } as const;
    // When we call populate
    await em.populate([a1, a2], hint);
    // Then we issued one query
    expect(queries.length).toEqual(1);
    // And we when populate the collections
    const loaded = await a1.populate(hint);
    // Then no new queries are issues
    expect(queries.length).toEqual(1);
    // And the tree of data is available
    expect(loaded.books.get.length).toBe(2);
    expect(loaded.books.get[0].reviews.get.length).toBe(1);
    expect(loaded.books.get[0].reviews.get[0].comment.get?.text).toBe("c3");
  });

  it("preloads m2m relations", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "b1" });
    await insertTag({ name: "t1" });
    await insertTag({ name: "t2" });
    await insertTag({ name: "t3" });
    await insertTag({ name: "t4" });
    await insertBookToTag({ book_id: 1, tag_id: 1 });
    await insertBookToTag({ book_id: 1, tag_id: 2 });
    await insertBook({ author_id: 1, title: "b2" });
    await insertBookToTag({ book_id: 2, tag_id: 3 });
    await insertBook({ author_id: 1, title: "b3" });

    const em = newEntityManager();
    // When we load the three books authors
    const [b1, b2, b3] = await em.find(Book, {});
    // And preload the joins from this load hint
    resetQueryCount();
    const hint = { tags: {} } as const;
    // When we call populate
    await em.populate([b1, b2, b3], hint);
    // Then we issued one query
    expect(queries.length).toEqual(1);
    // And we when populate the collections
    const [bl1, bl2, bl3] = await em.populate([b1, b2, b3], hint);
    // Then no new queries are issues
    expect(queries.length).toEqual(1);
    // And the tree of data is available
    expect(bl1.tags.get.length).toBe(2);
    expect(bl2.tags.get.length).toBe(1);
    expect(bl3.tags.get.length).toBe(0);
  });

  it("preloads overlapping load hints", async () => {
    // Given an author with books + reviews
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "b1" });
    await insertBookReview({ book_id: 1, rating: 1 });
    await insertComment({ text: "c1", parent_book_review_id: 1 });
    // And a 2nd author with the same
    await insertAuthor({ first_name: "a2" });
    await insertBook({ author_id: 2, title: "b1" });
    await insertBookReview({ book_id: 2, rating: 1 });
    await insertComment({ text: "c2", parent_book_review_id: 2 });

    const em = newEntityManager();
    const [a1, a2] = await em.find(Author, {});
    // When we populate both but with different load hints
    resetQueryCount();
    const [l1, l2] = await Promise.all([
      em.populate(a1, { books: { reviews: "comment" } }),
      em.populate(a2, { books: { reviews: {} } }),
    ]);
    // Then we issued one query
    expect(queries.length).toEqual(1);
    expect(a1).toMatchEntity({ books: [{ reviews: [{ comment: { text: "c1" } }] }] });
    expect(a2).toMatchEntity({ books: [{ reviews: [{}] }] });
    // And we did load a2 -> books -> reviews -> comment
    expect(l1.books.get[0].reviews.get[0].comment.isLoaded).toBe(true);
    // Because it was preloaded
    expect((l1.books.get[0].reviews.get[0].comment as any).isPreloaded).toBe(true);
    // But we didn't load a2 -> books -> reviews -> comment
    expect(l2.books.get[0].reviews.get[0].comment.isLoaded).toBe(false);
    // And also it was not preloaded (...currently it is b/c we're some join filtering)
    expect((l2.books.get[0].reviews.get[0].comment as any).isPreloaded).toBe(false);
  });

  it("preloads em.load", async () => {
    // Given an author with books + reviews
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "b1" });
    await insertBookReview({ book_id: 1, rating: 1 });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    resetQueryCount();
    const a1 = await em.load(Author, "a:1", { books: "reviews" });
    // Then we issued one query
    expect(queries.length).toEqual(1);
    expect(a1.books.get[0].reviews.get[0].rating).toBe(1);
  });

  it("preloads em.loadAll", async () => {
    // Given an author with books + reviews
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "b1" });
    await insertBookReview({ book_id: 1, rating: 1 });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    resetQueryCount();
    const [a1, a2] = await em.loadAll(Author, ["a:1", "a:2"], { books: "reviews" });
    // Then we issued one query
    expect(queries.length).toEqual(1);
    expect(a1.books.get[0].reviews.get[0].rating).toBe(1);
    expect(a2.books.get.length).toBe(0);
  });

  it("does not yet preload polys with subclasses", async () => {
    await insertLargePublisher({ name: "p1" });
    const em = newEntityManager();
    resetQueryCount();
    await em.load(LargePublisher, "p:1", "comments");
    expect(queries.length).toBe(2);
  });

  it("preloads m2o that are opposite of a lo2m relation", async () => {
    await insertPublisherGroup({ name: "pg1" });
    await insertCritic({ name: "c1", group_id: 1 });
    const em = newEntityManager();
    resetQueryCount();
    await em.load(Critic, "c:1", "group");
    expect(queries.length).toBe(1);
  });

  it("preloads m2os where column exists on a base table", async () => {
    await insertPublisherGroup({ name: "pg1" });
    await insertLargePublisher({ name: "lp1", group_id: 1 });
    const em = newEntityManager();
    resetQueryCount();
    const lp = await em.load(LargePublisher, "p:1", "group");
    expect(queries.length).toBe(1);
    expect(lp.group.get?.name).toBe("pg1");
  });
});
