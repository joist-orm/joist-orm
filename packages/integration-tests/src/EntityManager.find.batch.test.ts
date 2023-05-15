import { insertAuthor, insertPublisher } from "@src/entities/inserts";
import { aliases } from "joist-orm";
import { Author, Publisher } from "./entities";
import { newEntityManager, numberOfQueries, queries, resetQueryCount } from "./setupDbTests";

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
        ` SELECT array_agg(_find.tag) as _tags, "p".*, p_s0.*, p_s1.*, "p".id as id,`,
        ` CASE WHEN p_s0.id IS NOT NULL THEN 'LargePublisher' WHEN p_s1.id IS NOT NULL THEN 'SmallPublisher' ELSE 'Publisher' END as __class`,
        ` FROM publishers as p LEFT OUTER JOIN large_publishers p_s0 ON p.id = p_s0.id`,
        ` LEFT OUTER JOIN small_publishers p_s1 ON p.id = p_s1.id`,
        ` JOIN _find ON p.id = _find.arg0 GROUP BY "p".id, p_s0.id, p_s1.id`,
        ` ORDER BY p.id ASC`,
        ` LIMIT 10000;`,
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
        ` SELECT array_agg(_find.tag) as _tags, "a".*`,
        ` FROM authors as a`,
        ` JOIN _find ON a.deleted_at IS NULL AND a.first_name = _find.arg0 AND a.last_name = _find.arg1`,
        ` GROUP BY "a".id`,
        ` ORDER BY a.id ASC`,
        ` LIMIT 10000;`,
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
        ` SELECT array_agg(_find.tag) as _tags, "a".*`,
        ` FROM authors as a`,
        ` JOIN _find ON a.deleted_at IS NULL AND (a.first_name = _find.arg0 OR a.last_name = _find.arg1)`,
        ` GROUP BY "a".id`,
        ` ORDER BY a.id ASC`,
        ` LIMIT 10000;`,
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
    expect(queries).toEqual([
      `select "a".* from "authors" as "a" where "a"."deleted_at" is null order by "a"."id" asc limit $1`,
    ]);
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
        "WITH _find (tag, arg0) AS (VALUES ($1::int, $2::int), ($3, $4) ) SELECT array_agg(_find.tag) as _tags, "a".* FROM authors as a JOIN _find ON a.id = _find.arg0 GROUP BY "a".id ORDER BY a.first_name DESC LIMIT 10000;",
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
        "WITH _find (tag, arg0) AS (VALUES ($1::int, $2::int), ($3, $4) ) SELECT array_agg(_find.tag) as _tags, "a".* FROM authors as a LEFT OUTER JOIN publishers p ON a.publisher_id = p.id JOIN _find ON a.id = _find.arg0 GROUP BY "a".id, p.id ORDER BY p.id ASC LIMIT 10000;",
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
        "WITH _find (tag, arg0, arg1) AS (VALUES ($1::int, $2::int, $3::int), ($4, $5, $6) ) SELECT array_agg(_find.tag) as _tags, "a".* FROM authors as a JOIN _find ON a.deleted_at IS NULL AND a.age BETWEEN _find.arg0 AND _find.arg1 GROUP BY "a".id ORDER BY a.id ASC LIMIT 10000;",
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
        "WITH _find (tag, arg0) AS (VALUES ($1::int, $2::int[]), ($3, $4) ) SELECT array_agg(_find.tag) as _tags, "a".* FROM authors as a JOIN _find ON a.deleted_at IS NULL AND a.age = ANY(_find.arg0) GROUP BY "a".id ORDER BY a.id ASC LIMIT 10000;",
      ]
    `);
  });

  it("cannot batch queries with NIN", async () => {
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
        "WITH _find (tag, arg0) AS (VALUES ($1::int, $2::int[]), ($3, $4) ) SELECT array_agg(_find.tag) as _tags, "a".* FROM authors as a JOIN _find ON a.deleted_at IS NULL AND a.age != ALL(_find.arg0) GROUP BY "a".id ORDER BY a.id ASC LIMIT 10000;",
      ]
    `);
  });

  it("can batch queries with like", async () => {
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
        "WITH _find (tag, arg0) AS (VALUES ($1::int, $2::character varying), ($3, $4) ) SELECT array_agg(_find.tag) as _tags, "a".* FROM authors as a JOIN _find ON a.deleted_at IS NULL AND a.first_name LIKE _find.arg0 GROUP BY "a".id ORDER BY a.id ASC LIMIT 10000;",
      ]
    `);
  });
});
