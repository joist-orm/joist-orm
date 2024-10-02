import {
  insertAuthor,
  insertBook,
  insertBookReview,
  insertBookToTag,
  insertComment,
  insertCritic,
  insertLargePublisher,
  insertPublisher,
  insertPublisherGroup,
  insertTag,
  update,
} from "@src/entities/inserts";
import { testing } from "joist-plugin-join-preloading";
import { jan1, jan2 } from "src/testDates";
import { Author, Book, Critic, LargePublisher, Publisher } from "./entities";

import { isPreloadingEnabled, newEntityManager, queries, resetQueryCount } from "@src/testEm";

const { partitionHint } = testing;

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
    expect(queries.length).toEqual(isPreloadingEnabled ? 1 : 5);
    // And we when populate the collections
    const loaded = await a1.populate(hint);
    // Then no new queries are issues
    expect(queries.length).toEqual(isPreloadingEnabled ? 1 : 5);
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
    expect(queries.length).toEqual(isPreloadingEnabled ? 1 : 2);
    // And we when populate the collections
    const [bl1, bl2, bl3] = await em.populate([b1, b2, b3], hint);
    // Then no new queries are issues
    expect(queries.length).toEqual(isPreloadingEnabled ? 1 : 2);
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
    expect(queries.length).toEqual(isPreloadingEnabled ? 1 : 3);
    expect(a1).toMatchEntity({ books: [{ reviews: [{ comment: { text: "c1" } }] }] });
    expect(a2).toMatchEntity({ books: [{ reviews: [{}] }] });
    // And we did load a2 -> books -> reviews -> comment
    expect(l1.books.get[0].reviews.get[0].comment.isLoaded).toBe(true);
    // Because it was preloaded
    expect((l1.books.get[0].reviews.get[0].comment as any).isPreloaded).toBe(isPreloadingEnabled);
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
    expect(queries.length).toEqual(isPreloadingEnabled ? 1 : 3);
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
    expect(queries.length).toEqual(isPreloadingEnabled ? 1 : 3);
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

  // TODO Something about the `SmallPublisher.group: SmallPublisherGroup` broke this preloading
  it.skip("preloads m2o that are opposite of a lo2m relation", async () => {
    await insertPublisherGroup({ name: "pg1" });
    await insertCritic({ name: "c1", group_id: 1 });
    const em = newEntityManager();
    resetQueryCount();
    await em.load(Critic, "c:1", "group");
    expect(queries.length).toBe(isPreloadingEnabled ? 1 : 2);
  });

  // TODO Something about the `SmallPublisher.group: SmallPublisherGroup` broke this preloading
  it.skip("preloads m2os where column exists on a base table", async () => {
    await insertPublisherGroup({ name: "pg1" });
    await insertLargePublisher({ name: "lp1", group_id: 1 });
    const em = newEntityManager();
    resetQueryCount();
    const lp = await em.load(LargePublisher, "p:1", "group");
    expect(queries.length).toBe(isPreloadingEnabled ? 1 : 2);
    expect(lp.group.get?.name).toBe("pg1");
  });

  // this test was originally written for Author.favoriteBook when it was non-unique
  // and so the `Book.favoriteAuthors` m2o was skipped all together. Now we've made
  // favoriteBook unique, so `Book.favoriteBook` as o2o does actually get created,
  // because if we try and skip it then reactivity through the ReactiveReference
  // won't work. This probably means reactivity through non-unique RRs is broken.
  it("preloads derived o2os", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ book_id: 1, rating: 1 });
    await update("authors", { id: 1, favorite_book_id: 1 });
    const em = newEntityManager();
    resetQueryCount();
    const a = await em.load(Author, "a:1", { favoriteBook: "reviews" });
    // ...old comment that applied to the `Book.favoriteAuthors` m2o
    // We don't model the "other side" of derived m2os b/c it was too complicated
    // for the initial implementation. So, for now it doesn't get preloaded.
    expect(queries.length).toBe(isPreloadingEnabled ? 1 : 3);
    expect(a.favoriteBook.get?.reviews.get[0].rating).toBe(1);
  });

  it("can preload dates", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1, graduated: jan1 });
    await insertAuthor({ first_name: "a2", publisher_id: 1, graduated: jan2 });
    const em = newEntityManager();
    const p = await em.load(Publisher, "p:1", "authors");
    expect(p.authors.get[0].graduated).toEqual(jan1);
  });

  it("doesn't deadlock", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    await Promise.all([
      //
      a1.favoriteBook.load(),
      em.populate(a1, "favoriteBook"),
    ]);
  });

  it("preloads em.find", async () => {
    // Given an author with books + reviews
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "b1" });
    await insertBookReview({ book_id: 1, rating: 1 });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    resetQueryCount();
    const [a1] = await em.find(Author, { firstName: "a1" }, { populate: { books: "reviews" } });
    // Then we issued one query
    expect(queries.length).toEqual(isPreloadingEnabled ? 1 : 3);
    expect(a1.books.get[0].reviews.get[0].rating).toBe(1);
  });

  it("preloads em.find with a string[] hint", async () => {
    // Given an author with books + reviews
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "b1" });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    resetQueryCount();
    const [a1] = await em.find(Author, { firstName: "a1" }, { populate: ["books"] });
    // Then we issued one query
    expect(queries.length).toEqual(isPreloadingEnabled ? 1 : 2);
    expect(a1.books.get[0].title).toBe("b1");
  });

  it("preloads em.find in a loop", async () => {
    // Given an author with books + reviews
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "b1" });
    await insertBookReview({ book_id: 1, rating: 1 });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    resetQueryCount();
    const [[a1], [a2]] = await Promise.all([
      em.find(Author, { firstName: "a1" }, { populate: { books: "reviews" } }),
      em.find(Author, { firstName: "a2" }, { populate: { books: "reviews" } }),
    ]);
    // Then we issued one query
    expect(queries.length).toEqual(isPreloadingEnabled ? 1 : 3);
    expect(a1.books.get[0].reviews.get[0].rating).toBe(1);
    expect(a2.books.get.length).toBe(0);
  });

  describe("partitionHint", () => {
    it("partitions a sql-only hint", () => {
      const [a, b] = partitionHint(Author.metadata, { books: { reviews: "comment" } });
      expect(a).toEqual({ books: { reviews: { comment: {} } } });
      expect(b).toEqual(undefined);
    });

    it("partitions a non-sql hint", () => {
      const [a, b] = partitionHint(Author.metadata, { latestComments: {} });
      // We can't preload publisher b/c it's a CTI
      expect(a).toEqual(undefined);
      expect(b).toEqual({ latestComments: {} });
    });

    it("partitions a derived fk with no subhint", () => {
      const [a, b] = partitionHint(Author.metadata, "favoriteBook");
      expect(a).toEqual({ favoriteBook: {} });
      expect(b).toEqual(undefined);
    });

    it("partitions a nested non-sql hint", () => {
      const [a, b] = partitionHint(Publisher.metadata, { authors: { favoriteBook: ["tags"], books: {} } });
      // favoriteBook is a persisted FK so we can join through it (assuming its not changed)
      expect(a).toEqual({ authors: { books: {}, favoriteBook: { tags: {} } } });
      expect(b).toEqual(undefined);
    });

    it("partitions inter-mixed a sql-only hint", () => {
      const [a, b] = partitionHint(Author.metadata, { books: { reviews: "isPublic2" } });
      // We don't preload into `isPublic2` (i.e. the comment) because it's a persisted field
      expect(a).toEqual({ books: { reviews: {} } });
      expect(b).toEqual({ books: { reviews: { isPublic2: {} } } });
    });
  });
});
