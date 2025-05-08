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
    expect(queries).toMatchInlineSnapshot(`
     [
       "select nextval('publishers_id_seq') from generate_series(1, 1) UNION ALL select nextval('authors_id_seq') from generate_series(1, 1)",
       "begin ",
       "WITH data AS ( SELECT unnest($1::int[]) as id, unnest($2::character varying[]) as name, unnest($3::decimal[]) as latitude, unnest($4::decimal[]) as longitude, unnest($5::decimal[]) as huge_number, unnest($6::int[]) as number_of_book_reviews, unnest($7::timestamp with time zone[]) as deleted_at, unnest($8::text[]) as titles_of_favorite_books, unnest($9::text[]) as book_advance_titles_snapshot, unnest($10::text[]) as number_of_book_advances_snapshot, unnest($11::text[]) as base_sync_default, unnest($12::text[]) as base_async_default, unnest($13::timestamp with time zone[]) as created_at, unnest($14::timestamp with time zone[]) as updated_at, unnest($15::text[]) as favorite_author_name, unnest($16::int[]) as rating, unnest($17::int[]) as size_id, unnest($18::int[]) as type_id, unnest($19::int[]) as favorite_author_id, unnest($20::int[]) as group_id, unnest($21::int[]) as spotlight_author_id ) INSERT INTO publishers (id, name, latitude, longitude, huge_number, number_of_book_reviews, deleted_at, titles_of_favorite_books, book_advance_titles_snapshot, number_of_book_advances_snapshot, base_sync_default, base_async_default, created_at, updated_at, favorite_author_name, rating, size_id, type_id, favorite_author_id, group_id, spotlight_author_id) SELECT * FROM data",
       "WITH data AS ( SELECT unnest($1::int[]) as id, unnest($2::text[]) as shared_column, unnest($3::text[]) as country ) INSERT INTO large_publishers (id, shared_column, country) SELECT * FROM data",
       "WITH data AS ( SELECT unnest($1::int[]) as id, unnest($2::character varying[]) as first_name, unnest($3::character varying[]) as last_name, unnest($4::character varying[]) as ssn, unnest($5::character varying[]) as initials, unnest($6::int[]) as number_of_books, unnest($7::text[]) as book_comments, unnest($8::boolean[]) as is_popular, unnest($9::int[]) as age, unnest($10::date[]) as graduated, unnest_2d_1d($11::character varying[][], true) as nick_names, unnest_2d_1d($12::character varying[][], true) as nick_names_upper, unnest($13::boolean[]) as was_ever_popular, unnest($14::boolean[]) as is_funny, unnest($15::text[]) as mentor_names, unnest($16::jsonb[]) as address, unnest($17::jsonb[]) as business_address, unnest($18::jsonb[]) as quotes, unnest($19::bigint[]) as number_of_atoms, unnest($20::timestamp with time zone[]) as deleted_at, unnest($21::int[]) as number_of_public_reviews, unnest($22::int[]) as "numberOfPublicReviews2", unnest($23::character varying[]) as tags_of_all_books, unnest($24::text[]) as search, unnest($25::bytea[]) as certificate, unnest($26::timestamp with time zone[]) as created_at, unnest($27::timestamp with time zone[]) as updated_at, unnest($28::favorite_shape[]) as favorite_shape, unnest($29::int[]) as range_of_books, unnest_2d_1d($30::int[][], true) as favorite_colors, unnest($31::int[]) as mentor_id, unnest($32::int[]) as root_mentor_id, unnest($33::int[]) as current_draft_book_id, unnest($34::int[]) as favorite_book_id, unnest($35::int[]) as publisher_id ) INSERT INTO authors (id, first_name, last_name, ssn, initials, number_of_books, book_comments, is_popular, age, graduated, nick_names, nick_names_upper, was_ever_popular, is_funny, mentor_names, address, business_address, quotes, number_of_atoms, deleted_at, number_of_public_reviews, "numberOfPublicReviews2", tags_of_all_books, search, certificate, created_at, updated_at, favorite_shape, range_of_books, favorite_colors, mentor_id, root_mentor_id, current_draft_book_id, favorite_book_id, publisher_id) SELECT * FROM data",
       "SELECT count(distinct br.id) as count FROM book_reviews AS br JOIN books AS b ON br.book_id = b.id JOIN authors AS a ON b.author_id = a.id LEFT OUTER JOIN publishers AS p ON a.publisher_id = p.id WHERE b.deleted_at IS NULL AND a.deleted_at IS NULL AND p.deleted_at IS NULL AND p.id = $1 LIMIT $2",
       "commit",
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
       "WITH _find (tag, arg0) AS (VALUES ($1::int, $2::character varying), ($3, $4) ) SELECT array_agg(_find.tag) as _tags, a.* FROM authors AS a CROSS JOIN _find AS _find WHERE a.deleted_at IS NULL AND a.last_name = _find.arg0 GROUP BY a.id ORDER BY a.id ASC LIMIT $5",
       "select nextval('publishers_id_seq') from generate_series(1, 1) UNION ALL select nextval('authors_id_seq') from generate_series(1, 1) UNION ALL select nextval('books_id_seq') from generate_series(1, 2) UNION ALL select nextval('book_reviews_id_seq') from generate_series(1, 2)",
       "begin ",
       "WITH data AS ( SELECT unnest($1::int[]) as id, unnest($2::character varying[]) as name, unnest($3::decimal[]) as latitude, unnest($4::decimal[]) as longitude, unnest($5::decimal[]) as huge_number, unnest($6::int[]) as number_of_book_reviews, unnest($7::timestamp with time zone[]) as deleted_at, unnest($8::text[]) as titles_of_favorite_books, unnest($9::text[]) as book_advance_titles_snapshot, unnest($10::text[]) as number_of_book_advances_snapshot, unnest($11::text[]) as base_sync_default, unnest($12::text[]) as base_async_default, unnest($13::timestamp with time zone[]) as created_at, unnest($14::timestamp with time zone[]) as updated_at, unnest($15::text[]) as favorite_author_name, unnest($16::int[]) as rating, unnest($17::int[]) as size_id, unnest($18::int[]) as type_id, unnest($19::int[]) as favorite_author_id, unnest($20::int[]) as group_id, unnest($21::int[]) as spotlight_author_id ) INSERT INTO publishers (id, name, latitude, longitude, huge_number, number_of_book_reviews, deleted_at, titles_of_favorite_books, book_advance_titles_snapshot, number_of_book_advances_snapshot, base_sync_default, base_async_default, created_at, updated_at, favorite_author_name, rating, size_id, type_id, favorite_author_id, group_id, spotlight_author_id) SELECT * FROM data",
       "WITH data AS ( SELECT unnest($1::int[]) as id, unnest($2::text[]) as shared_column, unnest($3::text[]) as country ) INSERT INTO large_publishers (id, shared_column, country) SELECT * FROM data",
       "WITH data AS ( SELECT unnest($1::int[]) as id, unnest($2::character varying[]) as first_name, unnest($3::character varying[]) as last_name, unnest($4::character varying[]) as ssn, unnest($5::character varying[]) as initials, unnest($6::int[]) as number_of_books, unnest($7::text[]) as book_comments, unnest($8::boolean[]) as is_popular, unnest($9::int[]) as age, unnest($10::date[]) as graduated, unnest_2d_1d($11::character varying[][], true) as nick_names, unnest_2d_1d($12::character varying[][], true) as nick_names_upper, unnest($13::boolean[]) as was_ever_popular, unnest($14::boolean[]) as is_funny, unnest($15::text[]) as mentor_names, unnest($16::jsonb[]) as address, unnest($17::jsonb[]) as business_address, unnest($18::jsonb[]) as quotes, unnest($19::bigint[]) as number_of_atoms, unnest($20::timestamp with time zone[]) as deleted_at, unnest($21::int[]) as number_of_public_reviews, unnest($22::int[]) as "numberOfPublicReviews2", unnest($23::character varying[]) as tags_of_all_books, unnest($24::text[]) as search, unnest($25::bytea[]) as certificate, unnest($26::timestamp with time zone[]) as created_at, unnest($27::timestamp with time zone[]) as updated_at, unnest($28::favorite_shape[]) as favorite_shape, unnest($29::int[]) as range_of_books, unnest_2d_1d($30::int[][], true) as favorite_colors, unnest($31::int[]) as mentor_id, unnest($32::int[]) as root_mentor_id, unnest($33::int[]) as current_draft_book_id, unnest($34::int[]) as favorite_book_id, unnest($35::int[]) as publisher_id ) INSERT INTO authors (id, first_name, last_name, ssn, initials, number_of_books, book_comments, is_popular, age, graduated, nick_names, nick_names_upper, was_ever_popular, is_funny, mentor_names, address, business_address, quotes, number_of_atoms, deleted_at, number_of_public_reviews, "numberOfPublicReviews2", tags_of_all_books, search, certificate, created_at, updated_at, favorite_shape, range_of_books, favorite_colors, mentor_id, root_mentor_id, current_draft_book_id, favorite_book_id, publisher_id) SELECT * FROM data",
       "WITH data AS ( SELECT unnest($1::int[]) as id, unnest($2::character varying[]) as title, unnest($3::int[]) as "order", unnest($4::text[]) as notes, unnest($5::text[]) as acknowledgements, unnest($6::text[]) as authors_nick_names, unnest($7::text[]) as search, unnest($8::timestamp with time zone[]) as deleted_at, unnest($9::timestamp with time zone[]) as created_at, unnest($10::timestamp with time zone[]) as updated_at, unnest($11::int[]) as prequel_id, unnest($12::int[]) as author_id, unnest($13::int[]) as reviewer_id, unnest($14::int[]) as random_comment_id ) INSERT INTO books (id, title, "order", notes, acknowledgements, authors_nick_names, search, deleted_at, created_at, updated_at, prequel_id, author_id, reviewer_id, random_comment_id) SELECT * FROM data",
       "WITH data AS ( SELECT unnest($1::int[]) as id, unnest($2::int[]) as rating, unnest($3::boolean[]) as is_public, unnest($4::boolean[]) as is_test, unnest($5::timestamp with time zone[]) as created_at, unnest($6::timestamp with time zone[]) as updated_at, unnest($7::int[]) as book_id, unnest($8::int[]) as critic_id ) INSERT INTO book_reviews (id, rating, is_public, is_test, created_at, updated_at, book_id, critic_id) SELECT * FROM data",
       "SELECT count(distinct br.id) as count FROM book_reviews AS br JOIN books AS b ON br.book_id = b.id JOIN authors AS a ON b.author_id = a.id LEFT OUTER JOIN publishers AS p ON a.publisher_id = p.id WHERE b.deleted_at IS NULL AND a.deleted_at IS NULL AND p.deleted_at IS NULL AND p.id = $1 LIMIT $2",
       "WITH data AS ( SELECT unnest($1::int[]) as id, unnest($2::int[]) as number_of_book_reviews, unnest($3::timestamp with time zone[]) as updated_at, unnest($4::timestamptz[]) as __original_updated_at ) UPDATE publishers SET number_of_book_reviews = data.number_of_book_reviews, updated_at = data.updated_at FROM data WHERE publishers.id = data.id AND date_trunc('milliseconds', publishers.updated_at) = data.__original_updated_at RETURNING publishers.id",
       "commit",
       "select * from "publishers" order by id",
     ]
    `);
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
      `SELECT count(distinct br.id) as count FROM book_reviews AS br JOIN books AS b ON br.book_id = b.id JOIN authors AS a ON b.author_id = a.id LEFT OUTER JOIN publishers AS p ON a.publisher_id = p.id WHERE b.deleted_at IS NULL AND a.deleted_at IS NULL AND p.deleted_at IS NULL AND p.id = $1 LIMIT $2`,
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
