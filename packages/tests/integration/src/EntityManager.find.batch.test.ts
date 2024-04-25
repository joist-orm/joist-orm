import { insertAuthor, insertPublisher } from "@src/entities/inserts";
import { zeroTo } from "@src/utils";
import { aliases, jan1 } from "joist-orm";
import {
  AdvanceStatus,
  Author,
  AuthorSchedule,
  Book,
  BookAdvance,
  Color,
  FavoriteShape,
  Publisher,
  PublisherType,
} from "./entities";

import { newEntityManager, numberOfQueries, queries, resetQueryCount } from "@src/testEm";

describe("EntityManager.find.batch", () => {
  it("batches queries loaded at the same time", async () => {
    await insertPublisher({ name: "p1" });
    resetQueryCount();
    const em = newEntityManager();
    // Given two queries with exactly the same where clause
    const q1p = em.find(Publisher, { id: "1" });
    const q2p = em.find(Publisher, { id: "2" });
    // When they are executed in the same event loop
    const [q1, q2] = await Promise.all([q1p, q2p]);
    // Then we issue a single SQL query
    expect(numberOfQueries).toEqual(1);
    // And it's the regular/sane query, i.e. not auto-batched
    expect(queries).toEqual([
      [
        `WITH _find (tag, arg0) AS (VALUES ($1::int, $2::int), ($3, $4) )`,
        ` SELECT array_agg(_find.tag) as _tags, p.*, p_s0.*, p_s1.*, p.id as id,`,
        ` COALESCE(p_s0.shared_column, p_s1.shared_column) as shared_column,`,
        ` CASE WHEN p_s0.id IS NOT NULL THEN 'LargePublisher' WHEN p_s1.id IS NOT NULL THEN 'SmallPublisher' ELSE 'Publisher' END as __class`,
        ` FROM publishers as p`,
        ` LEFT OUTER JOIN large_publishers p_s0 ON p.id = p_s0.id`,
        ` LEFT OUTER JOIN small_publishers p_s1 ON p.id = p_s1.id`,
        ` JOIN _find ON p.deleted_at IS NULL AND p.id = _find.arg0 GROUP BY p.id, p_s0.id, p_s1.id`,
        ` ORDER BY p.id ASC`,
        ` LIMIT 50000;`,
      ].join(""),
    ]);
    expect(q1.length).toEqual(1);
    expect(q2.length).toEqual(0);
  });

  it("batches queries with multiple conditions", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    await insertAuthor({ first_name: "a2", last_name: "l2" });
    resetQueryCount();
    const em = newEntityManager();
    // Given two queries with exactly the same where clause
    const q1p = em.find(Author, { firstName: "a1", lastName: "l1" });
    const q2p = em.find(Author, { firstName: "a2", lastName: "l2" });
    // When they are executed in the same event loop
    await Promise.all([q1p, q2p]);
    // Then we issue a single SQL query
    expect(numberOfQueries).toEqual(1);
    expect(queries).toEqual([
      [
        `WITH _find (tag, arg0, arg1) AS (VALUES`,
        ` ($1::int, $2::character varying, $3::character varying), ($4, $5, $6) )`,
        ` SELECT array_agg(_find.tag) as _tags, a.*`,
        ` FROM authors as a`,
        ` JOIN _find ON a.deleted_at IS NULL AND a.first_name = _find.arg0 AND a.last_name = _find.arg1`,
        ` GROUP BY a.id`,
        ` ORDER BY a.id ASC`,
        ` LIMIT 50000;`,
      ].join(""),
    ]);
  });

  it("batches queries with complex expressions", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    await insertAuthor({ first_name: "a2", last_name: "l2" });
    resetQueryCount();
    const em = newEntityManager();
    // Given two queries with exactly the same where clause
    const [a1, a2] = aliases(Author, Author);
    const q1p = em.find(Author, { as: a1 }, { conditions: { or: [a1.firstName.eq("a1"), a1.lastName.eq("l1")] } });
    const q2p = em.find(Author, { as: a2 }, { conditions: { or: [a2.firstName.eq("a2"), a2.lastName.eq("l2")] } });
    // When they are executed in the same event loop
    await Promise.all([q1p, q2p]);
    // Then we issue a single SQL query
    expect(numberOfQueries).toEqual(1);
    expect(queries).toEqual([
      [
        `WITH _find (tag, arg0, arg1) AS (VALUES`,
        ` ($1::int, $2::character varying, $3::character varying), ($4, $5, $6) )`,
        ` SELECT array_agg(_find.tag) as _tags, a.*`,
        ` FROM authors as a`,
        ` JOIN _find ON a.deleted_at IS NULL AND (a.first_name = _find.arg0 OR a.last_name = _find.arg1)`,
        ` GROUP BY a.id`,
        ` ORDER BY a.id ASC`,
        ` LIMIT 50000;`,
      ].join(""),
    ]);
  });

  it("batches queries with no conditions", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    resetQueryCount();
    const em = newEntityManager();
    // Given two queries with exactly the same where clause
    const q1p = em.find(Author, {});
    const q2p = em.find(Author, {});
    // When they are executed in the same event loop
    await Promise.all([q1p, q2p]);
    // Then we issue a single SQL query without any of the CTE overhead
    expect(queries).toEqual([`select a.* from authors as a where a.deleted_at is null order by a.id ASC limit $1`]);
  });

  it("batches queries with same order bys", async () => {
    await insertPublisher({ name: "p1" });
    await insertPublisher({ id: 2, name: "p2" });
    resetQueryCount();
    const em = newEntityManager();
    // Given two queries with exactly the same where clause but different orders
    const a1p = em.find(Author, { id: "1" }, { orderBy: { firstName: "DESC" }, softDeletes: "include" });
    const a2p = em.find(Author, { id: "2" }, { orderBy: { firstName: "DESC" }, softDeletes: "include" });
    // When they are executed in the same event loop
    const [a1, a2] = await Promise.all([a1p, a2p]);
    // Then we issue a single SQL query
    expect(numberOfQueries).toEqual(1);
    // And it is still auto-batched
    expect(queries).toMatchInlineSnapshot(`
      [
        "WITH _find (tag, arg0) AS (VALUES ($1::int, $2::int), ($3, $4) ) SELECT array_agg(_find.tag) as _tags, a.* FROM authors as a JOIN _find ON a.id = _find.arg0 GROUP BY a.id ORDER BY a.first_name DESC, a.id ASC LIMIT 50000;",
      ]
    `);
    // And the results are the expected reverse of each other
    expect(a1.reverse()).toEqual(a2);
  });

  it("batches queries with same order bys via m2os", async () => {
    const em = newEntityManager();
    // Given two queries with exactly the same where clause but different orders
    const a1p = em.find(Author, { id: "1" }, { orderBy: { publisher: { id: "ASC" } }, softDeletes: "include" });
    const a2p = em.find(Author, { id: "2" }, { orderBy: { publisher: { id: "ASC" } }, softDeletes: "include" });
    // When they are executed in the same event loop
    const [a1, a2] = await Promise.all([a1p, a2p]);
    // Then we issue a single SQL query
    expect(numberOfQueries).toEqual(1);
    // And it is still auto-batched
    expect(queries).toMatchInlineSnapshot(`
      [
        "WITH _find (tag, arg0) AS (VALUES ($1::int, $2::int), ($3, $4) ) SELECT array_agg(_find.tag) as _tags, a.* FROM authors as a LEFT OUTER JOIN publishers p ON a.publisher_id = p.id JOIN _find ON a.id = _find.arg0 GROUP BY a.id, p.id ORDER BY p.id ASC, a.id ASC LIMIT 50000;",
      ]
    `);
    // And the results are the expected reverse of each other
    expect(a1.reverse()).toEqual(a2);
  });

  it("batches queries with between", async () => {
    const em = newEntityManager();
    await Promise.all([
      em.find(Author, { age: { between: [20, 30] } }),
      em.find(Author, { age: { between: [30, 40] } }),
    ]);
    expect(queries).toMatchInlineSnapshot(`
      [
        "WITH _find (tag, arg0, arg1) AS (VALUES ($1::int, $2::int, $3::int), ($4, $5, $6) ) SELECT array_agg(_find.tag) as _tags, a.* FROM authors as a JOIN _find ON a.deleted_at IS NULL AND a.age BETWEEN _find.arg0 AND _find.arg1 GROUP BY a.id ORDER BY a.id ASC LIMIT 50000;",
      ]
    `);
  });

  it("batches queries with IN", async () => {
    await insertAuthor({ first_name: "a1", age: 20 });
    await insertAuthor({ first_name: "a2", age: 30 });
    await insertAuthor({ first_name: "a3", age: 40 });
    resetQueryCount();
    const em = newEntityManager();
    const [q1, q2] = await Promise.all([
      em.find(Author, { age: { in: [20, 30] } }),
      em.find(Author, { age: { in: [30, 40] } }),
    ]);
    expect(q1.length).toBe(2);
    expect(q2.length).toBe(2);
    expect(queries).toMatchInlineSnapshot(`
      [
        "WITH _find (tag, arg0) AS (VALUES ($1::int, $2::int[]), ($3, $4) ) SELECT array_agg(_find.tag) as _tags, a.* FROM authors as a JOIN _find ON a.deleted_at IS NULL AND a.age = ANY(_find.arg0) GROUP BY a.id ORDER BY a.id ASC LIMIT 50000;",
      ]
    `);
  });

  it("batches queries with NIN", async () => {
    await insertAuthor({ first_name: "a1", age: 20 });
    await insertAuthor({ first_name: "a2", age: 30 });
    await insertAuthor({ first_name: "a3", age: 40 });
    resetQueryCount();
    const em = newEntityManager();
    const [q1, q2] = await Promise.all([
      em.find(Author, { age: { nin: [20, 30] } }),
      em.find(Author, { age: { nin: [30, 40] } }),
    ]);
    expect(q1.length).toBe(1);
    expect(q2.length).toBe(1);
    expect(queries).toMatchInlineSnapshot(`
      [
        "WITH _find (tag, arg0) AS (VALUES ($1::int, $2::int[]), ($3, $4) ) SELECT array_agg(_find.tag) as _tags, a.* FROM authors as a JOIN _find ON a.deleted_at IS NULL AND a.age != ALL(_find.arg0) GROUP BY a.id ORDER BY a.id ASC LIMIT 50000;",
      ]
    `);
  });

  it("batches queries with array in", async () => {
    const em = newEntityManager();
    const [q1, q2] = await Promise.all([
      em.find(Author, { favoriteColors: [Color.Red] }),
      em.find(Author, { favoriteColors: [Color.Blue] }),
    ]);
  });

  it("batches queries with like", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    await insertAuthor({ first_name: "a2", last_name: "l2" });
    resetQueryCount();
    const em = newEntityManager();
    await Promise.all([
      em.find(Author, { firstName: { like: "a1%" } }),
      em.find(Author, { firstName: { like: "a2%" } }),
    ]);
    expect(queries).toMatchInlineSnapshot(`
      [
        "WITH _find (tag, arg0) AS (VALUES ($1::int, $2::character varying), ($3, $4) ) SELECT array_agg(_find.tag) as _tags, a.* FROM authors as a JOIN _find ON a.deleted_at IS NULL AND a.first_name LIKE _find.arg0 GROUP BY a.id ORDER BY a.id ASC LIMIT 50000;",
      ]
    `);
  });

  it("does not cache results incorrectly", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    // When we purposefully make two separate queries with the same structure
    const a1 = await em.find(Author, { firstName: "a1" });
    const a2 = await em.find(Author, { firstName: "a2" });
    // Then they didn't share the same cache
    expect(a1[0].firstName).toBe("a1");
    expect(a2[0].firstName).toBe("a2");
  });

  it("batches contains an enum array", async () => {
    await insertAuthor({ first_name: "a1", favorite_colors: [1, 2, 3] });
    await insertAuthor({ first_name: "a2", favorite_colors: [1, 2, 3] });
    const em = newEntityManager();
    const [q1, q2] = await Promise.all([
      em.find(Author, { favoriteColors: { contains: [Color.Red, Color.Green] } }),
      em.find(Author, { favoriteColors: { contains: [Color.Green, Color.Blue] } }),
    ]);
    expect(q1.length).toBe(2);
    expect(q2.length).toBe(2);
  });

  it("batches find overlaps an enum array", async () => {
    await insertAuthor({ first_name: "a1", favorite_colors: [1, 2, 3] });
    await insertAuthor({ first_name: "a2", favorite_colors: [2, 3] });
    const em = newEntityManager();
    const [q1, q2] = await Promise.all([
      await em.find(Author, { favoriteColors: { overlaps: [Color.Red, Color.Green] } }),
      await em.find(Author, { favoriteColors: { overlaps: [Color.Green, Color.Blue] } }),
    ]);
    expect(q1.length).toBe(2);
    expect(q2.length).toBe(2);
  });

  it("batches containedBy an enum array", async () => {
    await insertAuthor({ first_name: "a1", favorite_colors: [1] });
    await insertAuthor({ first_name: "a2", favorite_colors: [2] });
    const em = newEntityManager();
    const [q1, q2] = await Promise.all([
      await em.find(Author, { favoriteColors: { containedBy: [Color.Red, Color.Green] } }),
      await em.find(Author, { favoriteColors: { containedBy: [Color.Green, Color.Blue] } }),
    ]);
    expect(q1.length).toBe(2);
    expect(q2.length).toBe(1);
  });

  it("batches queries with native enum", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1", favorite_shape: "circle" });
    await insertAuthor({ first_name: "a2", last_name: "l2", favorite_shape: "square" });
    resetQueryCount();
    const em = newEntityManager();
    // Given two queries with exactly the same where clause
    const q1p = em.find(Author, { favoriteShape: FavoriteShape.Circle });
    const q2p = em.find(Author, { favoriteShape: FavoriteShape.Square });
    // When they are executed in the same event loop
    await Promise.all([q1p, q2p]);
    // Then we issue a single SQL query
    expect(numberOfQueries).toEqual(1);
    expect(queries).toEqual([
      [
        `WITH _find (tag, arg0) AS (VALUES`,
        ` ($1::int, $2::favorite_shape), ($3, $4) )`,
        ` SELECT array_agg(_find.tag) as _tags, a.*`,
        ` FROM authors as a`,
        ` JOIN _find ON a.deleted_at IS NULL AND a.favorite_shape = _find.arg0`,
        ` GROUP BY a.id`,
        ` ORDER BY a.id ASC`,
        ` LIMIT 50000;`,
      ].join(""),
    ]);
  });

  it("batches joins in the right order", async () => {
    const [ba, p] = aliases(BookAdvance, Publisher);
    const em = newEntityManager();
    // Given two queries that join an o2o first and then a m2o second
    const queries = zeroTo(2).map((id) =>
      em.find(
        Book,
        { id: `${id}`, advances: { as: ba, publisher: p } },
        {
          conditions: {
            and: [ba.status.eq(AdvanceStatus.Paid), p.type.eq(PublisherType.Big)],
          },
        },
      ),
    );
    // Then we don't get a syntax error
    await Promise.all(queries);
  });

  it("batches multiple nested conditions", async () => {
    const em = newEntityManager();
    const [ba, p] = aliases(BookAdvance, Publisher);
    const queries = zeroTo(2).map((id) =>
      em.find(
        Book,
        { id: `${id}`, advances: { as: ba, publisher: p } },
        {
          conditions: {
            or: [
              { and: [ba.createdAt.gt(jan1)] },
              { and: [ba.status.eq(AdvanceStatus.Paid), p.type.in([PublisherType.Big])] },
            ],
          },
        },
      ),
    );
    await Promise.all(queries);
  });

  it("batches queries with sql keyword abbreviations", async () => {
    resetQueryCount();
    const em = newEntityManager();
    // Given two queries with exactly the same where clause
    const q1p = em.find(AuthorSchedule, { id: "1" });
    const q2p = em.find(AuthorSchedule, { id: "2" });
    // When they are executed in the same event loop
    const [q1, q2] = await Promise.all([q1p, q2p]);
    // Then we issue a single SQL query
    expect(numberOfQueries).toEqual(1);
    // And it's the regular/sane query, i.e. not auto-batched
    expect(queries).toEqual([
      [
        `WITH _find (tag, arg0) AS (VALUES ($1::int, $2::int), ($3, $4) )`,
        ` SELECT array_agg(_find.tag) as _tags, "as".*`,
        ` FROM author_schedules as "as"`,
        ` JOIN _find ON "as".id = _find.arg0 GROUP BY "as".id`,
        ` ORDER BY "as".id ASC`,
        ` LIMIT 50000;`,
      ].join(""),
    ]);
    expect(q1.length).toEqual(0);
    expect(q2.length).toEqual(0);
  });

  it("batches counts with sql keyword abbreviations", async () => {
    resetQueryCount();
    const em = newEntityManager();
    // Given two queries with exactly the same where clause
    const q1p = em.findCount(AuthorSchedule, { id: "1" });
    const q2p = em.findCount(AuthorSchedule, { id: "2" });
    // When they are executed in the same event loop
    const [q1, q2] = await Promise.all([q1p, q2p]);
    // Then we issue a single SQL query
    expect(numberOfQueries).toEqual(1);
    // And it's the regular/sane query, i.e. not auto-batched
    expect(queries).toEqual([
      [
        `WITH _find (tag, arg0) AS (VALUES ($1::int, $2::int), ($3, $4) )`,
        ` SELECT _find.tag as tag, count(distinct "as".id) as count`,
        ` FROM author_schedules as "as"`,
        ` JOIN _find ON "as".id = _find.arg0`,
        ` GROUP BY _find.tag`,
      ].join(""),
    ]);
    expect(q1).toEqual(0);
    expect(q2).toEqual(0);
  });

  it("batches finds with multi-word hasPersistedAsyncProperty", async () => {
    resetQueryCount();
    const em = newEntityManager();
    // Given two queries with exactly the same where clause
    const q1p = em.find(Author, { numberOfPublicReviews: 1 });
    const q2p = em.find(Author, { numberOfPublicReviews: 2 });
    // When they are executed in the same event loop
    const [q1, q2] = await Promise.all([q1p, q2p]);
    // Then we issue a single SQL query
    expect(numberOfQueries).toEqual(1);
    // And it's the regular/sane query, i.e. not auto-batched
    expect(queries).toEqual([
      [
        `WITH _find (tag, arg0) AS (VALUES ($1::int, $2::int), ($3, $4) )`,
        ` SELECT array_agg(_find.tag) as _tags, a.*`,
        ` FROM authors as a`,
        ` JOIN _find ON a.deleted_at IS NULL AND a.number_of_public_reviews = _find.arg0`,
        ` GROUP BY a.id ORDER BY a.id ASC LIMIT 50000;`,
      ].join(""),
    ]);
    expect(q1).toEqual([]);
    expect(q2).toEqual([]);
  });

  it("batches finds with camelCased hasPersistedAsyncProperty", async () => {
    resetQueryCount();
    const em = newEntityManager();
    // Given two queries with exactly the same where clause
    const q1p = em.find(Author, { numberOfPublicReviews2: 1 });
    const q2p = em.find(Author, { numberOfPublicReviews2: 2 });
    // When they are executed in the same event loop
    const [q1, q2] = await Promise.all([q1p, q2p]);
    // Then we issue a single SQL query
    expect(numberOfQueries).toEqual(1);
    // And it's the regular/sane query, i.e. not auto-batched
    expect(queries).toEqual([
      [
        `WITH _find (tag, arg0) AS (VALUES ($1::int, $2::int), ($3, $4) )`,
        ` SELECT array_agg(_find.tag) as _tags, a.*`,
        ` FROM authors as a`,
        ` JOIN _find ON a.deleted_at IS NULL AND a."numberOfPublicReviews2" = _find.arg0`,
        ` GROUP BY a.id ORDER BY a.id ASC LIMIT 50000;`,
      ].join(""),
    ]);
    expect(q1).toEqual([]);
    expect(q2).toEqual([]);
  });
});
