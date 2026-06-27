import { insertAuthor, insertPublisher } from "@src/entities/inserts";
import { zeroTo } from "@src/utils";
import { aliases, type ParsedFindQuery, Plugin } from "joist-orm";
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
import { jan1 } from "src/testDates";

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
        `WITH _find (tag, arg0) AS (SELECT unnest($1::int[]), unnest($2::int[]))`,
        ` SELECT array_agg(_find.tag) as _tags, p.*, p_s0.*, p_s1.*, p.id as id,`,
        ` COALESCE(p_s0.shared_column, p_s1.shared_column) as shared_column,`,
        ` CASE WHEN p_s0.id IS NOT NULL THEN 'LargePublisher' WHEN p_s1.id IS NOT NULL THEN 'SmallPublisher' ELSE '_' END as __class`,
        ` FROM publishers AS p`,
        ` CROSS JOIN _find AS _find`,
        ` LEFT OUTER JOIN large_publishers AS p_s0 ON p.id = p_s0.id`,
        ` LEFT OUTER JOIN small_publishers AS p_s1 ON p.id = p_s1.id`,
        ` WHERE p.deleted_at IS NULL AND p.id = _find.arg0 GROUP BY p.id, p_s0.id, p_s1.id`,
        ` ORDER BY p.id ASC`,
        ` LIMIT $3`,
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
        `WITH _find (tag, arg0, arg1) AS (SELECT`,
        ` unnest($1::int[]), unnest($2::character varying[]), unnest($3::character varying[]))`,
        ` SELECT array_agg(_find.tag) as _tags, a.*`,
        ` FROM authors AS a`,
        ` CROSS JOIN _find AS _find`,
        ` WHERE a.deleted_at IS NULL AND a.first_name = _find.arg0 AND a.last_name = _find.arg1`,
        ` GROUP BY a.id`,
        ` ORDER BY a.id ASC`,
        ` LIMIT $4`,
      ].join(""),
    ]);
  });

  it("inlines conditions whose values are shared across the batch", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    await insertAuthor({ first_name: "a1", last_name: "l2" });
    resetQueryCount();
    const em = newEntityManager();
    // Given two queries that share the same firstName but differ on lastName
    const q1p = em.find(Author, { firstName: "a1", lastName: "l1" });
    const q2p = em.find(Author, { firstName: "a1", lastName: "l2" });
    // When they are executed in the same event loop
    const [q1, q2] = await Promise.all([q1p, q2p]);
    // Then we issue a single SQL query
    expect(numberOfQueries).toEqual(1);
    // And the shared firstName is inlined as `= $3` while only the varying lastName flows through the CTE
    expect(queries).toEqual([
      [
        `WITH _find (tag, arg0) AS (SELECT`,
        ` unnest($1::int[]), unnest($2::character varying[]))`,
        ` SELECT array_agg(_find.tag) as _tags, a.*`,
        ` FROM authors AS a`,
        ` CROSS JOIN _find AS _find`,
        ` WHERE a.deleted_at IS NULL AND a.first_name = $3 AND a.last_name = _find.arg0`,
        ` GROUP BY a.id`,
        ` ORDER BY a.id ASC`,
        ` LIMIT $4`,
      ].join(""),
    ]);
    expect(q1).toMatchEntity([{ firstName: "a1", lastName: "l1" }]);
    expect(q2).toMatchEntity([{ firstName: "a1", lastName: "l2" }]);
  });

  it("passes the unbatched query AST to beforeFind plugins", async () => {
    class BeforeFindPlugin extends Plugin {
      tables: string[][] = [];
      beforeFind(_meta: unknown, operation: unknown, query: ParsedFindQuery): void {
        // Capture the query.plugins at beforeFind-time
        if (operation === "find") {
          this.tables.push(query.tables.map((table) => table.alias));
        }
      }
    }

    await insertAuthor({ first_name: "a1", last_name: "l1" });
    await insertAuthor({ first_name: "a2", last_name: "l2" });
    resetQueryCount();
    const em = newEntityManager();
    const plugin = new BeforeFindPlugin();
    em.addPlugin(plugin);

    // Given we batch two em.finds
    await Promise.all([
      em.find(Author, { firstName: "a1", lastName: "l1" }),
      em.find(Author, { firstName: "a2", lastName: "l2" }),
    ]);
    // Then there was only 1 query issues
    expect(numberOfQueries).toEqual(1);
    // And the plugin only saw the pre-batched `authors a` table for each batched find, and not
    // our more complicated `_find` structure
    expect(plugin.tables).toEqual([["a"], ["a"]]);
  });

  it("collects values from plugin-mutated queries when batching", async () => {
    class ConditionPlugin extends Plugin {
      beforeFind(_meta: unknown, operation: unknown, query: ParsedFindQuery): void {
        if (operation !== "find") return;
        const ageCondition = query.condition?.conditions.find(
          (condition) => condition.kind === "column" && condition.column === "age",
        );
        if (!ageCondition || ageCondition.kind !== "column" || !("value" in ageCondition.cond)) return;
        const firstName = ageCondition.cond.value === 10 ? "a1" : "a2";
        query.condition?.conditions.push({
          kind: "column",
          alias: "a",
          column: "first_name",
          dbType: "character varying",
          cond: { kind: "eq", value: firstName },
        });
      }
    }

    await insertAuthor({ first_name: "a1", age: 10 });
    await insertAuthor({ first_name: "a2", age: 20 });
    resetQueryCount();
    const em = newEntityManager();
    em.addPlugin(new ConditionPlugin());

    const [q1, q2] = await Promise.all([em.find(Author, { age: 10 }), em.find(Author, { age: 20 })]);

    expect(numberOfQueries).toEqual(1);
    expect(queries).toEqual([
      [
        `WITH _find (tag, arg0, arg1) AS (SELECT`,
        ` unnest($1::int[]), unnest($2::int[]), unnest($3::character varying[]))`,
        ` SELECT array_agg(_find.tag) as _tags, a.*`,
        ` FROM authors AS a`,
        ` CROSS JOIN _find AS _find`,
        ` WHERE a.deleted_at IS NULL AND a.age = _find.arg0 AND a.first_name = _find.arg1`,
        ` GROUP BY a.id`,
        ` ORDER BY a.id ASC`,
        ` LIMIT $4`,
      ].join(""),
    ]);
    expect(q1.map((a) => a.firstName)).toEqual(["a1"]);
    expect(q2.map((a) => a.firstName)).toEqual(["a2"]);
  });

  it("groups plugin-rewritten selects when batching", async () => {
    class SelectPlugin extends Plugin {
      beforeFind(_meta: unknown, operation: unknown, query: ParsedFindQuery): void {
        if (operation === "find") {
          query.selects = ["(a.id) as id", "(a.first_name) as first_name"];
        }
      }
    }

    await insertAuthor({ first_name: "a1", last_name: "l1" });
    await insertAuthor({ first_name: "a2", last_name: "l2" });
    resetQueryCount();
    const em = newEntityManager();
    em.addPlugin(new SelectPlugin());

    const [q1, q2] = await Promise.all([
      em.find(Author, { firstName: "a1", lastName: "l1" }),
      em.find(Author, { firstName: "a2", lastName: "l2" }),
    ]);

    expect(numberOfQueries).toEqual(1);
    expect(queries).toEqual([
      [
        `WITH _find (tag, arg0, arg1) AS (SELECT`,
        ` unnest($1::int[]), unnest($2::character varying[]), unnest($3::character varying[]))`,
        ` SELECT array_agg(_find.tag) as _tags, (a.id) as id, (a.first_name) as first_name`,
        ` FROM authors AS a`,
        ` CROSS JOIN _find AS _find`,
        ` WHERE a.deleted_at IS NULL AND a.first_name = _find.arg0 AND a.last_name = _find.arg1`,
        ` GROUP BY (a.id), (a.first_name)`,
        ` ORDER BY a.id ASC`,
        ` LIMIT $4`,
      ].join(""),
    ]);
    expect(q1.map((a) => a.firstName)).toEqual(["a1"]);
    expect(q2.map((a) => a.firstName)).toEqual(["a2"]);
  });

  it("preserves CTEs added by beforeFind plugins when batching", async () => {
    class CtePlugin extends Plugin {
      beforeFind(_meta: unknown, operation: unknown, query: ParsedFindQuery): void {
        if (operation !== "find") return;
        query.ctes = [
          ...(query.ctes ?? []),
          {
            alias: "_plugin_author_ids",
            query: { kind: "raw", sql: "SELECT 1::int AS author_id", bindings: [] },
          },
        ];
        query.tables.push({
          join: "inner",
          table: "_plugin_author_ids",
          alias: "_pai",
          col1: "a.id",
          col2: "_pai.author_id",
        });
      }
    }

    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    resetQueryCount();
    const em = newEntityManager();
    em.addPlugin(new CtePlugin());

    const [q1, q2] = await Promise.all([em.find(Author, { id: "1" }), em.find(Author, { id: "2" })]);

    expect(numberOfQueries).toEqual(1);
    expect(queries).toEqual([
      [
        `WITH _find (tag, arg0) AS (SELECT unnest($1::int[]), unnest($2::int[])),`,
        `  _plugin_author_ids AS (SELECT 1::int AS author_id)`,
        ` SELECT array_agg(_find.tag) as _tags, a.*`,
        ` FROM authors AS a`,
        ` CROSS JOIN _find AS _find`,
        ` JOIN _plugin_author_ids AS _pai ON a.id = _pai.author_id`,
        ` WHERE a.deleted_at IS NULL AND a.id = _find.arg0`,
        ` GROUP BY a.id`,
        ` ORDER BY a.id ASC`,
        ` LIMIT $3`,
      ].join(""),
    ]);
    expect(q1.map((a) => a.firstName)).toEqual(["a1"]);
    expect(q2).toEqual([]);
  });

  it("batches paginated queries with matching limits", async () => {
    await insertAuthor({ first_name: "a1", age: 10 });
    await insertAuthor({ first_name: "a2", age: 10 });
    await insertAuthor({ first_name: "b1", age: 20 });
    await insertAuthor({ first_name: "b2", age: 20 });
    resetQueryCount();
    const em = newEntityManager();

    const [q1, q2] = await Promise.all([
      em.find(Author, { age: 10 }, { limit: 1, orderBy: { firstName: "ASC" } }),
      em.find(Author, { age: 20 }, { limit: 1, orderBy: { firstName: "ASC" } }),
    ]);

    expect(numberOfQueries).toEqual(1);
    expect(queries).toEqual([
      [
        `WITH _find (tag, arg0) AS (SELECT unnest($1::int[]), unnest($2::int[]))`,
        ` SELECT _find.tag as tag, _data.* FROM _find AS _find`,
        ` CROSS JOIN LATERAL`,
        ` (SELECT a.* FROM authors AS a`,
        ` WHERE a.deleted_at IS NULL AND a.age = _find.arg0`,
        ` ORDER BY a.first_name ASC, a.id ASC LIMIT $3) AS _data`,
      ].join(""),
    ]);
    expect(q1.map((a) => a.firstName)).toEqual(["a1"]);
    expect(q2.map((a) => a.firstName)).toEqual(["b1"]);
  });

  it("does not batch paginated queries with different limits", async () => {
    await insertAuthor({ first_name: "a1", age: 10 });
    await insertAuthor({ first_name: "a2", age: 10 });
    await insertAuthor({ first_name: "b1", age: 20 });
    await insertAuthor({ first_name: "b2", age: 20 });
    resetQueryCount();
    const em = newEntityManager();

    const [q1, q2] = await Promise.all([
      em.find(Author, { age: 10 }, { limit: 1, orderBy: { firstName: "ASC" } }),
      em.find(Author, { age: 20 }, { limit: 2, orderBy: { firstName: "ASC" } }),
    ]);

    expect(numberOfQueries).toEqual(2);
    expect(q1.map((a) => a.firstName)).toEqual(["a1"]);
    expect(q2.map((a) => a.firstName)).toEqual(["b1", "b2"]);
  });

  it("batches paginated queries with matching offsets", async () => {
    await insertAuthor({ first_name: "a1", age: 10 });
    await insertAuthor({ first_name: "a2", age: 10 });
    await insertAuthor({ first_name: "b1", age: 20 });
    await insertAuthor({ first_name: "b2", age: 20 });
    resetQueryCount();
    const em = newEntityManager();

    const [q1, q2] = await Promise.all([
      em.find(Author, { age: 10 }, { limit: 1, offset: 1, orderBy: { firstName: "ASC" } }),
      em.find(Author, { age: 20 }, { limit: 1, offset: 1, orderBy: { firstName: "ASC" } }),
    ]);

    expect(numberOfQueries).toEqual(1);
    expect(q1.map((a) => a.firstName)).toEqual(["a2"]);
    expect(q2.map((a) => a.firstName)).toEqual(["b2"]);
  });

  it("supports paginated limit zero", async () => {
    await insertAuthor({ first_name: "a1", age: 10 });
    resetQueryCount();
    const em = newEntityManager();

    const q1 = await em.find(Author, { age: 10 }, { limit: 0 });

    expect(numberOfQueries).toEqual(1);
    expect(queries).toEqual([
      `SELECT a.* FROM authors AS a WHERE a.deleted_at IS NULL AND a.age = $1 ORDER BY a.id ASC LIMIT $2`,
    ]);
    expect(q1).toEqual([]);
  });

  it("batches paginated queries with undefined limits", async () => {
    await insertAuthor({ first_name: "a1", age: 10 });
    await insertAuthor({ first_name: "a2", age: 10 });
    await insertAuthor({ first_name: "b1", age: 20 });
    resetQueryCount();
    const em = newEntityManager();

    const [q1, q2] = await Promise.all([
      em.find(Author, { age: 10 }, { limit: undefined, orderBy: { firstName: "ASC" } }),
      em.find(Author, { age: 20 }, { limit: undefined, orderBy: { firstName: "ASC" } }),
    ]);

    expect(numberOfQueries).toEqual(1);
    expect(q1.map((a) => a.firstName)).toEqual(["a1", "a2"]);
    expect(q2.map((a) => a.firstName)).toEqual(["b1"]);
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
        `WITH _find (tag, arg0, arg1) AS (SELECT`,
        ` unnest($1::int[]), unnest($2::character varying[]), unnest($3::character varying[]))`,
        ` SELECT array_agg(_find.tag) as _tags, a.*`,
        ` FROM authors AS a`,
        ` CROSS JOIN _find AS _find`,
        ` WHERE a.deleted_at IS NULL AND (a.first_name = _find.arg0 OR a.last_name = _find.arg1)`,
        ` GROUP BY a.id`,
        ` ORDER BY a.id ASC`,
        ` LIMIT $4`,
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
    expect(queries).toEqual([`SELECT a.* FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY a.id ASC LIMIT $1`]);
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
       "WITH _find (tag, arg0) AS (SELECT unnest($1::int[]), unnest($2::int[])) SELECT array_agg(_find.tag) as _tags, a.* FROM authors AS a CROSS JOIN _find AS _find WHERE a.id = _find.arg0 GROUP BY a.id ORDER BY a.first_name DESC, a.id ASC LIMIT $3",
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
       "WITH _find (tag, arg0) AS (SELECT unnest($1::int[]), unnest($2::int[])) SELECT array_agg(_find.tag) as _tags, a.* FROM authors AS a CROSS JOIN _find AS _find LEFT OUTER JOIN publishers AS p ON a.publisher_id = p.id WHERE a.id = _find.arg0 GROUP BY a.id, p.id ORDER BY p.id ASC, a.id ASC LIMIT $3",
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
       "WITH _find (tag, arg0, arg1) AS (SELECT unnest($1::int[]), unnest($2::int[]), unnest($3::int[])) SELECT array_agg(_find.tag) as _tags, a.* FROM authors AS a CROSS JOIN _find AS _find WHERE a.deleted_at IS NULL AND a.age BETWEEN _find.arg0 AND _find.arg1 GROUP BY a.id ORDER BY a.id ASC LIMIT $4",
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
       "WITH _find (tag, arg0) AS (SELECT unnest($1::int[]), unnest_arrays($2::int[][])) SELECT array_agg(_find.tag) as _tags, a.* FROM authors AS a CROSS JOIN _find AS _find WHERE a.deleted_at IS NULL AND a.age = ANY(_find.arg0) GROUP BY a.id ORDER BY a.id ASC LIMIT $3",
     ]
    `);
  });

  it("batches optimized collection queries with IN conditions", async () => {
    const em = newEntityManager();
    const [a1, a2] = aliases(Author, Author);

    await Promise.all([
      em.find(
        Author,
        { as: a1, books: { title: "b1" } },
        { conditions: { or: [{ and: [a1.age.in([20, 30]), a1.firstName.eq("a1")] }, a1.lastName.eq("l1")] } },
      ),
      em.find(
        Author,
        { as: a2, books: { title: "b2" } },
        { conditions: { or: [{ and: [a2.age.in([30, 40]), a2.firstName.eq("a2")] }, a2.lastName.eq("l2")] } },
      ),
    ]);

    expect(numberOfQueries).toEqual(1);
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
       "WITH _find (tag, arg0) AS (SELECT unnest($1::int[]), unnest_arrays($2::int[][])) SELECT array_agg(_find.tag) as _tags, a.* FROM authors AS a CROSS JOIN _find AS _find WHERE a.deleted_at IS NULL AND a.age != ALL(_find.arg0) GROUP BY a.id ORDER BY a.id ASC LIMIT $3",
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
       "WITH _find (tag, arg0) AS (SELECT unnest($1::int[]), unnest($2::character varying[])) SELECT array_agg(_find.tag) as _tags, a.* FROM authors AS a CROSS JOIN _find AS _find WHERE a.deleted_at IS NULL AND a.first_name LIKE _find.arg0 GROUP BY a.id ORDER BY a.id ASC LIMIT $3",
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
        `WITH _find (tag, arg0) AS (SELECT`,
        ` unnest($1::int[]), unnest($2::favorite_shape[]))`,
        ` SELECT array_agg(_find.tag) as _tags, a.*`,
        ` FROM authors AS a`,
        ` CROSS JOIN _find AS _find`,
        ` WHERE a.deleted_at IS NULL AND a.favorite_shape = _find.arg0`,
        ` GROUP BY a.id`,
        ` ORDER BY a.id ASC`,
        ` LIMIT $3`,
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
        `WITH _find (tag, arg0) AS (SELECT unnest($1::int[]), unnest($2::int[]))`,
        ` SELECT array_agg(_find.tag) as _tags, "as".*`,
        ` FROM author_schedules AS "as"`,
        ` CROSS JOIN _find AS _find`,
        ` WHERE "as".id = _find.arg0 GROUP BY "as".id`,
        ` ORDER BY "as".id ASC`,
        ` LIMIT $3`,
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
        `WITH _find (tag, arg0) AS (SELECT unnest($1::int[]), unnest($2::int[]))`,
        ` SELECT _find.tag as tag, _data.count as count FROM _find AS _find`,
        ` CROSS JOIN LATERAL`,
        ` (SELECT count(distinct "as".id) as count FROM author_schedules AS "as" WHERE "as".id = _find.arg0)`,
        ` AS _data LIMIT $3`,
      ].join(""),
    ]);
    expect(q1).toEqual(0);
    expect(q2).toEqual(0);
  });

  it("inlines shared conditions when batching counts", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    await insertAuthor({ first_name: "a1", last_name: "l2" });
    resetQueryCount();
    const em = newEntityManager();
    // Given two counts that share firstName but differ on lastName
    const [c1, c2] = await Promise.all([
      em.findCount(Author, { firstName: "a1", lastName: "l1" }),
      em.findCount(Author, { firstName: "a1", lastName: "l2" }),
    ]);
    expect(numberOfQueries).toEqual(1);
    // Then the shared firstName is inlined and only lastName flows through the CTE
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH _find (tag, arg0) AS (SELECT unnest($1::int[]), unnest($2::character varying[])) SELECT _find.tag as tag, _data.count as count FROM _find AS _find CROSS JOIN LATERAL (SELECT count(distinct a.id) as count FROM authors AS a WHERE a.deleted_at IS NULL AND a.first_name = $3 AND a.last_name = _find.arg0) AS _data LIMIT $4",
     ]
    `);
    expect(c1).toEqual(1);
    expect(c2).toEqual(1);
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
        `WITH _find (tag, arg0) AS (SELECT unnest($1::int[]), unnest($2::int[]))`,
        ` SELECT array_agg(_find.tag) as _tags, a.*`,
        ` FROM authors AS a`,
        ` CROSS JOIN _find AS _find`,
        ` WHERE a.deleted_at IS NULL AND a.number_of_public_reviews = _find.arg0`,
        ` GROUP BY a.id ORDER BY a.id ASC LIMIT $3`,
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
        `WITH _find (tag, arg0) AS (SELECT unnest($1::int[]), unnest($2::int[]))`,
        ` SELECT array_agg(_find.tag) as _tags, a.*`,
        ` FROM authors AS a`,
        ` CROSS JOIN _find AS _find`,
        ` WHERE a.deleted_at IS NULL AND a."numberOfPublicReviews2" = _find.arg0`,
        ` GROUP BY a.id ORDER BY a.id ASC LIMIT $3`,
      ].join(""),
    ]);
    expect(q1).toEqual([]);
    expect(q2).toEqual([]);
  });
});
