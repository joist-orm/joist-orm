import {
  insertAuthor,
  insertBook,
  insertBookReview,
  insertPublisher,
  insertSmallPublisherGroup,
  select,
} from "@src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "@src/testEm";
import { Book, BookReview, Publisher, newBookReview, newLargePublisher } from "../entities";

describe("ReactiveQueryField", () => {
  it("skips UPDATE after INSERT if value hasn't changed", async () => {
    const em = newEntityManager();
    newLargePublisher(em, { authors: [{}] });
    await em.flush();
    // We don't actually have an `UPDATE` here b/c the default value of 0 from the `INSERT`
    // is the same as the post-INSERT calculated value, so there is no need to `UPDATE`.
    expect(queries).toMatchInlineSnapshot(`[]`);
  });

  it("issues UPDATE after initial INSERT with calculated value", async () => {
    const em = newEntityManager();
    newLargePublisher(em);
    newBookReview(em);
    newBookReview(em);
    await em.flush();
    expect((await select("publishers"))[0]).toMatchObject({
      id: 1,
      number_of_book_reviews: 2,
    });
    // After the INSERTs, there is a SELECT to calc the data, and then an `UPDATE`
    expect(queries).toMatchInlineSnapshot(`[]`);
  });

  it("preserves correct changed data to beforeCommit hooks", async () => {
    const em = newEntityManager();
    const p = newLargePublisher(em, { tags: [{}] });
    newBookReview(em);
    await em.flush();
    expect(p.transientFields.wasNewInBeforeCommit).toBe(true);
    // sort b/c the order of `favoriteAuthor` can change for some reason...
    expect(p.transientFields.changedInBeforeCommit.sort()).toEqual(
      [
        "id",
        "createdAt",
        "updatedAt",
        "name",
        "numberOfBookAdvancesSnapshot",
        "numberOfBookReviews",
        "rating",
        "spotlightAuthor",
        "type",
        "authors",
        "baseSyncDefault",
        "bookAdvanceTitlesSnapshot",
        "favoriteAuthor",
        "favoriteAuthorName",
        "baseAsyncDefault",
        "titlesOfFavoriteBooks",
        "tags",
      ].sort(),
    );
  });

  it("can em.recalc to update the value", async () => {
    // Given an existing publisher with a stale value
    await insertPublisher({ id: 1, name: "p1", number_of_book_reviews: 0 });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ book_id: 1, rating: 1 });
    // And we load the entity
    const em = newEntityManager();
    const p = await em.load(Publisher, "p:1");
    // And see the stale value
    expect(p.numberOfBookReviews.get).toBe(0);
    // When we recalc the entity
    resetQueryCount();
    await em.recalc(p);
    // Then we immediately see the recalc
    expect(p.numberOfBookReviews.get).toBe(1);
    await em.flush();
    // And we only loaded the Publisher (...and two Authors for separate RFs/RRs) into memory
    expect(em.entities.length).toBe(3);
    // And the value is updated in the database
    expect((await select("publishers"))[0]).toMatchObject({
      id: 1,
      number_of_book_reviews: 1,
    });
    expect(queries).toContain(
      `SELECT DISTINCT count(distinct "br".id) as count FROM book_reviews AS br JOIN books AS b ON br.book_id = b.id JOIN authors AS a ON b.author_id = a.id LEFT OUTER JOIN publishers AS p ON a.publisher_id = p.id WHERE b.deleted_at IS NULL AND a.deleted_at IS NULL AND p.deleted_at IS NULL AND p.id = $1 LIMIT $2`,
    );
  });

  it("can recalc dependent reactive fields", async () => {
    // Given an existing PublisherGroup with a valid value
    await insertSmallPublisherGroup({ id: 1, name: "pg1", number_of_book_reviews: 1 });
    await insertPublisher({ id: 1, name: "p1", number_of_book_reviews: 1, group_id: 1 });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ book_id: 1, rating: 1 });
    // When we create a new book review
    const em = newEntityManager();
    const b = await em.load(Book, "b:1");
    em.create(BookReview, { book: b, rating: 4 });
    await em.flush();
    // Then both the Publisher and PublisherGroup are updated
    expect((await select("publishers"))[0]).toMatchObject({ number_of_book_reviews: 2 });
    expect((await select("publisher_groups"))[0]).toMatchObject({ number_of_book_reviews: 2 });
  });

  it("is validated after changing", async () => {
    // Given an existing PublisherGroup with a valid value
    await insertSmallPublisherGroup({ id: 1, name: "pg1", number_of_book_reviews: 1 });
    await insertPublisher({ id: 1, name: "p1", number_of_book_reviews: 1, group_id: 1 });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    // And there is 1 existing review
    await insertBookReview({ book_id: 1, rating: 1 });
    // When we create a 3 more book reviews (which will trip a validation rule)
    const em = newEntityManager();
    const b = await em.load(Book, "b:1");
    em.create(BookReview, { book: b, rating: 4 });
    em.create(BookReview, { book: b, rating: 4 });
    em.create(BookReview, { book: b, rating: 4 });
    // And we also load the publisher to change the name, to show the rule really
    // is evaluated twice during a single em.flush
    const p = await em.load(Publisher, "p:1");
    p.name = "four";
    // Then the flush fails
    await expect(em.flush()).rejects.toThrow("Publisher 'four' cannot have 4 books");
    // And its because the rule was validation twice
    expect(p.transientFields.numberOfBookReviewEvals).toBe(2);
    // And none of the changes persisted
    expect((await select("publishers"))[0]).toMatchObject({ number_of_book_reviews: 1 });
    expect((await select("publisher_groups"))[0]).toMatchObject({ number_of_book_reviews: 1 });
    expect(await select("book_reviews")).toHaveLength(1);
  });
});
