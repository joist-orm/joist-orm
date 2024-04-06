import {
  insertAuthor,
  insertBook,
  insertBookReview,
  insertPublisher,
  insertPublisherGroup,
  select,
} from "@src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "@src/testEm";
import { Book, BookReview, Publisher, newBookReview, newLargePublisher } from "../entities";

describe("ReactiveQueryField", () => {
  it("skips UPDATE after INSERT if value hasn't changed", async () => {
    const em = newEntityManager();
    newLargePublisher(em);
    await em.flush();
    // We don't actually have an `UPDATE` here b/c the default value of 0 from the `INSERT`
    // is the same as the post-INSERT calculated value, so there is no need to `UPDATE`.
    expect(queries).toMatchInlineSnapshot(`
     [
       "BEGIN;",
       "select nextval('publishers_id_seq') from generate_series(1, 1)",
       "INSERT INTO "publishers" ("id", "name", "latitude", "longitude", "huge_number", "number_of_book_reviews", "deleted_at", "created_at", "updated_at", "size_id", "type_id", "group_id") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
       "INSERT INTO "large_publishers" ("id", "shared_column", "country") VALUES ($1, $2, $3)",
       "select distinct count(distinct "br".id) as count from book_reviews as br inner join books as b on br.book_id = b.id inner join authors as a on b.author_id = a.id left outer join publishers as p on a.publisher_id = p.id where b.deleted_at is null and a.deleted_at is null and p.deleted_at is null and p.id = $1 limit $2",
       "COMMIT;",
     ]
    `);
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
    expect(queries).toMatchInlineSnapshot(`
     [
       "select nextval('publishers_id_seq') from generate_series(1, 1) UNION ALL select nextval('authors_id_seq') from generate_series(1, 1) UNION ALL select nextval('books_id_seq') from generate_series(1, 2) UNION ALL select nextval('book_reviews_id_seq') from generate_series(1, 2)",
       "BEGIN;",
       "INSERT INTO "publishers" ("id", "name", "latitude", "longitude", "huge_number", "number_of_book_reviews", "deleted_at", "created_at", "updated_at", "size_id", "type_id", "group_id") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
       "INSERT INTO "large_publishers" ("id", "shared_column", "country") VALUES ($1, $2, $3)",
       "INSERT INTO "authors" ("id", "first_name", "last_name", "ssn", "initials", "number_of_books", "book_comments", "is_popular", "age", "graduated", "nick_names", "nick_names_upper", "was_ever_popular", "address", "business_address", "quotes", "number_of_atoms", "deleted_at", "number_of_public_reviews", "numberOfPublicReviews2", "tags_of_all_books", "search", "created_at", "updated_at", "favorite_shape", "range_of_books", "favorite_colors", "mentor_id", "current_draft_book_id", "favorite_book_id", "publisher_id") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)",
       "INSERT INTO "books" ("id", "title", "order", "notes", "acknowledgements", "deleted_at", "created_at", "updated_at", "author_id") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9),($10, $11, $12, $13, $14, $15, $16, $17, $18)",
       "INSERT INTO "book_reviews" ("id", "rating", "is_public", "is_test", "created_at", "updated_at", "book_id", "critic_id") VALUES ($1, $2, $3, $4, $5, $6, $7, $8),($9, $10, $11, $12, $13, $14, $15, $16)",
       "select distinct count(distinct "br".id) as count from book_reviews as br inner join books as b on br.book_id = b.id inner join authors as a on b.author_id = a.id left outer join publishers as p on a.publisher_id = p.id where b.deleted_at is null and a.deleted_at is null and p.deleted_at is null and p.id = $1 limit $2",
       "WITH data (id, number_of_book_reviews, updated_at, __original_updated_at) AS (VALUES ($1::int, $2::int, $3::timestamp with time zone, $4::timestamptz) ) UPDATE publishers SET number_of_book_reviews = data.number_of_book_reviews, updated_at = data.updated_at FROM data WHERE publishers.id = data.id AND date_trunc('milliseconds', publishers.updated_at) = data.__original_updated_at RETURNING publishers.id",
       "COMMIT;",
       "select * from "publishers" order by "id" asc",
     ]
    `);
  });

  it("preserves correct changed data to beforeCommit hooks", async () => {
    const em = newEntityManager();
    const p = newLargePublisher(em);
    newBookReview(em);
    await em.flush();
    expect(p.transientFields.wasNewInBeforeCommit).toBe(true);
    expect(p.transientFields.changedInBeforeCommit).toEqual([
      "id",
      "createdAt",
      "updatedAt",
      "name",
      "numberOfBookReviews",
      "type",
    ]);
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
    // And we only loaded the Publisher (and Author for a separate ReactiveField) into memory
    expect(em.entities.length).toBe(2);
    // And the value is updated in the database
    expect((await select("publishers"))[0]).toMatchObject({
      id: 1,
      number_of_book_reviews: 1,
    });
    expect(queries).toContain(
      `select distinct count(distinct "br".id) as count from book_reviews as br inner join books as b on br.book_id = b.id inner join authors as a on b.author_id = a.id left outer join publishers as p on a.publisher_id = p.id where b.deleted_at is null and a.deleted_at is null and p.deleted_at is null and p.id = $1 limit $2`,
    );
  });

  it("can recalc dependent reactive fields", async () => {
    // Given an existing PublisherGroup with a valid value
    await insertPublisherGroup({ name: "pg1", number_of_book_reviews: 1 });
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
    await insertPublisherGroup({ name: "pg1", number_of_book_reviews: 1 });
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
