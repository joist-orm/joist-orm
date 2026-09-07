import { expectTypeOf } from "expect-type";
import {
  DateSerde,
  PlainDateSerde,
  PlainDateTimeSerde,
  PlainTimeSerde,
  PrimitiveSerde,
  type Query,
  ZonedDateTimeSerde,
  query,
  sql,
  table,
  tables,
} from "joist-orm";
import {
  Author,
  Book,
  BookRange,
  Comment,
  FavoriteShape,
  Publisher,
  Tag,
  TaskNew,
  TaskOld,
  User,
  newUser,
} from "src/entities";
import { insertAuthor, insertBook, insertComment, insertTask, insertUser } from "src/entities/inserts";
import { PasswordValue } from "src/entities/types";
import { newEntityManager, queries, resetQueryCount, testDriver } from "src/testEm";
import { ZodError } from "zod";

describe("EntityManager.setQueries", () => {
  describe("union", () => {
    it("removes duplicate rows within an operand", async () => {
      // Given an Author named Alice
      await insertAuthor({ first_name: "Alice" });
      // And another Author whose projected name is equal
      await insertAuthor({ first_name: "Alice" });
      // And an Author query for comparing those names
      const em = newEntityManager();
      const a = table(Author);
      // When combining both names with an empty right operand
      const rows = await em.query({
        union: [
          { from: a, select: { name: a.first_name } },
          { from: a, where: a.id.eq("a:0"), select: { name: a.first_name } },
        ],
      });
      // Then duplicates from the left operand collapse even without a match on the right
      expect(rows).toEqual([{ name: "Alice" }]);
    });

    it("removes duplicate rows across operands", async () => {
      // Given one Author selected by both operands
      await insertAuthor({ first_name: "Alice" });
      // And an Author query for the repeated name
      const em = newEntityManager();
      const a = table(Author);
      // And recording isolated from the Author insert
      resetQueryCount();
      // When both operands contribute Alice
      const rows = await em.query({
        union: [
          { from: a, select: { name: a.first_name } },
          { from: a, select: { name: a.first_name } },
        ],
      });
      // Then PostgreSQL returns one copy in one query
      expect(rows).toEqual([{ name: "Alice" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "(SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL) UNION (SELECT a1.first_name AS name FROM authors AS a1 WHERE a1.deleted_at IS NULL)",
       ]
      `);
    });

    it("keeps rows whose names match but ages differ", async () => {
      // Given an Author named Alice aged 20
      await insertAuthor({ first_name: "Alice", age: 20 });
      // And another Alice aged 30, so the complete projected rows differ
      await insertAuthor({ first_name: "Alice", age: 30 });
      // And an Author query selecting both name and age
      const em = newEntityManager();
      const a = table(Author);
      // When each operand selects one Alice
      const rows = await em.query({
        union: [
          { from: a, where: a.id.eq("a:1"), select: { name: a.first_name, age: a.age } },
          { from: a, where: a.id.eq("a:2"), select: { name: a.first_name, age: a.age } },
        ],
        orderBy: { age: "ASC" },
      });
      // Then equality includes age instead of deduplicating only by name
      expect(rows).toEqual([
        { name: "Alice", age: 20 },
        { name: "Alice", age: 30 },
      ]);
    });

    it("treats corresponding NULLs as equal", async () => {
      // Given one Author with a SQL NULL age
      await insertAuthor({ first_name: "Alice", age: null });
      // And an Author query projecting only age
      const em = newEntityManager();
      const a = table(Author);
      // When both operands contribute that NULL
      const rows = await em.query({
        union: [
          { from: a, select: { age: a.age } },
          { from: a, select: { age: a.age } },
        ],
      });
      // Then the two NULL rows collapse to one
      expect(rows).toEqual([{ age: null }]);
    });

    it("returns no rows for two empty operands", async () => {
      // Given no Authors
      // And an Author query over the empty table
      const em = newEntityManager();
      const a = table(Author);
      // When combining two empty projections
      const rows = await em.query({
        union: [
          { from: a, select: { id: a.id } },
          { from: a, select: { id: a.id } },
        ],
      });
      // Then neither operand fabricates a NULL row
      expect(rows).toEqual([]);
    });
  });

  describe("unionAll", () => {
    it("preserves duplicate rows within an operand", async () => {
      // Given an Author named Alice
      await insertAuthor({ first_name: "Alice" });
      // And another Author with the same projected name
      await insertAuthor({ first_name: "Alice" });
      // And an Author query for those names
      const em = newEntityManager();
      const a = table(Author);
      // When combining both names with an empty right operand
      const rows = await em.query({
        unionAll: [
          { from: a, select: { name: a.first_name } },
          { from: a, where: a.id.eq("a:0"), select: { name: a.first_name } },
        ],
      });
      // Then both left-side copies remain
      expect(rows).toEqual([{ name: "Alice" }, { name: "Alice" }]);
    });

    it("adds duplicate rows across operands", async () => {
      // Given one Author selected by both operands
      await insertAuthor({ first_name: "Alice" });
      // And an Author query for the repeated name
      const em = newEntityManager();
      const a = table(Author);
      // And recording isolated from the Author insert
      resetQueryCount();
      // When each operand contributes one Alice
      const rows = await em.query({
        unionAll: [
          { from: a, select: { name: a.first_name } },
          { from: a, select: { name: a.first_name } },
        ],
      });
      // Then both copies are returned by one query
      expect(rows).toEqual([{ name: "Alice" }, { name: "Alice" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "(SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL) UNION ALL (SELECT a1.first_name AS name FROM authors AS a1 WHERE a1.deleted_at IS NULL)",
       ]
      `);
    });

    it("preserves different complete rows from both operands", async () => {
      // Given an Author named Alice aged 20
      await insertAuthor({ first_name: "Alice", age: 20 });
      // And another Alice aged 30
      await insertAuthor({ first_name: "Alice", age: 30 });
      // And an Author query selecting both name and age
      const em = newEntityManager();
      const a = table(Author);
      // When each operand contributes one complete row
      const rows = await em.query({
        unionAll: [
          { from: a, where: a.id.eq("a:1"), select: { name: a.first_name, age: a.age } },
          { from: a, where: a.id.eq("a:2"), select: { name: a.first_name, age: a.age } },
        ],
        orderBy: { age: "ASC" },
      });
      // Then both ages remain associated with their projected rows
      expect(rows).toEqual([
        { name: "Alice", age: 20 },
        { name: "Alice", age: 30 },
      ]);
    });

    it("preserves repeated NULL rows", async () => {
      // Given one Author with a SQL NULL age
      await insertAuthor({ first_name: "Alice", age: null });
      // And an Author query projecting only age
      const em = newEntityManager();
      const a = table(Author);
      // When each operand contributes that NULL
      const rows = await em.query({
        unionAll: [
          { from: a, select: { age: a.age } },
          { from: a, select: { age: a.age } },
        ],
      });
      // Then NULL rows retain their multiplicity
      expect(rows).toEqual([{ age: null }, { age: null }]);
    });

    it("returns no rows for two empty operands", async () => {
      // Given no Authors
      // And an Author query over the empty table
      const em = newEntityManager();
      const a = table(Author);
      // When appending two empty projections
      const rows = await em.query({
        unionAll: [
          { from: a, select: { id: a.id } },
          { from: a, select: { id: a.id } },
        ],
      });
      // Then neither operand fabricates a NULL row
      expect(rows).toEqual([]);
    });

    it("adds rows from three operands", async () => {
      // Given one Author selected by all three operands
      await insertAuthor({ first_name: "Alice" });
      // And an Author query for that name
      const em = newEntityManager();
      const a = table(Author);
      // When each operand contributes one copy
      const rows = await em.query({
        unionAll: [
          { from: a, select: { name: a.first_name } },
          { from: a, select: { name: a.first_name } },
          { from: a, select: { name: a.first_name } },
        ],
      });
      // Then the third operand contributes a third copy
      expect(rows).toEqual([{ name: "Alice" }, { name: "Alice" }, { name: "Alice" }]);
    });
  });

  describe("intersect", () => {
    it("keeps only rows present in both operands", async () => {
      // Given Alice, selected only on the left
      await insertAuthor({ first_name: "Alice" });
      // And Bob, selected by both operands
      await insertAuthor({ first_name: "Bob" });
      // And Carol, selected only on the right
      await insertAuthor({ first_name: "Carol" });
      // And an Author query for their names
      const em = newEntityManager();
      const a = table(Author);
      // And recording isolated from the Author inserts
      resetQueryCount();
      // When intersecting Alice/Bob with Bob/Carol
      const rows = await em.query({
        intersect: [
          { from: a, where: a.id.ne("a:3"), select: { name: a.first_name } },
          { from: a, where: a.id.ne("a:1"), select: { name: a.first_name } },
        ],
      });
      // Then only the shared name survives
      expect(rows).toEqual([{ name: "Bob" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "(SELECT a.first_name AS name FROM authors AS a WHERE a.id != $1 AND a.deleted_at IS NULL) INTERSECT (SELECT a1.first_name AS name FROM authors AS a1 WHERE a1.id != $2 AND a1.deleted_at IS NULL)",
       ]
      `);
    });

    it("returns one copy of a duplicated matching row", async () => {
      // Given an Author named Alice
      await insertAuthor({ first_name: "Alice" });
      // And another Alice, giving each operand two equal projected rows
      await insertAuthor({ first_name: "Alice" });
      // And an Author query for those names
      const em = newEntityManager();
      const a = table(Author);
      // When both operands contain both copies
      const rows = await em.query({
        intersect: [
          { from: a, select: { name: a.first_name } },
          { from: a, select: { name: a.first_name } },
        ],
      });
      // Then INTERSECT removes multiplicity from the matching row
      expect(rows).toEqual([{ name: "Alice" }]);
    });

    it("does not match rows whose ages differ", async () => {
      // Given an Author named Alice aged 20
      await insertAuthor({ first_name: "Alice", age: 20 });
      // And another Alice aged 30, so only the names match
      await insertAuthor({ first_name: "Alice", age: 30 });
      // And an Author query selecting both name and age
      const em = newEntityManager();
      const a = table(Author);
      // When comparing the two complete rows
      const rows = await em.query({
        intersect: [
          { from: a, where: a.id.eq("a:1"), select: { name: a.first_name, age: a.age } },
          { from: a, where: a.id.eq("a:2"), select: { name: a.first_name, age: a.age } },
        ],
      });
      // Then matching names alone do not produce a matching row
      expect(rows).toEqual([]);
    });

    it("matches corresponding NULLs", async () => {
      // Given one Author with a SQL NULL age
      await insertAuthor({ first_name: "Alice", age: null });
      // And an Author query projecting only age
      const em = newEntityManager();
      const a = table(Author);
      // When intersecting two copies of that NULL
      const rows = await em.query({
        intersect: [
          { from: a, select: { age: a.age } },
          { from: a, select: { age: a.age } },
        ],
      });
      // Then NULL is a matching set value
      expect(rows).toEqual([{ age: null }]);
    });

    it("returns no rows for two empty operands", async () => {
      // Given no Authors
      // And an Author query over the empty table
      const em = newEntityManager();
      const a = table(Author);
      // When intersecting two empty projections
      const rows = await em.query({
        intersect: [
          { from: a, select: { id: a.id } },
          { from: a, select: { id: a.id } },
        ],
      });
      // Then there are no shared rows
      expect(rows).toEqual([]);
    });

    it("returns no rows when only the left operand is empty", async () => {
      // Given one Author for the nonempty right operand
      await insertAuthor({ first_name: "Alice" });
      // And an Author query with an empty left projection
      const em = newEntityManager();
      const a = table(Author);
      // When the right row has no left match
      const rows = await em.query({
        intersect: [
          { from: a, where: a.id.eq("a:0"), select: { id: a.id } },
          { from: a, select: { id: a.id } },
        ],
      });
      // Then the right operand cannot add rows on its own
      expect(rows).toEqual([]);
    });

    it("returns no rows when only the right operand is empty", async () => {
      // Given one Author for the nonempty left operand
      await insertAuthor({ first_name: "Alice" });
      // And an Author query with an empty right projection
      const em = newEntityManager();
      const a = table(Author);
      // When the left row has no right match
      const rows = await em.query({
        intersect: [
          { from: a, select: { id: a.id } },
          { from: a, where: a.id.eq("a:0"), select: { id: a.id } },
        ],
      });
      // Then the unmatched left row is removed
      expect(rows).toEqual([]);
    });

    it("preserves mixed nesting instead of relying on INTERSECT precedence", async () => {
      // Given a1, selected by the first union branch
      await insertAuthor({ first_name: "a1" });
      // And a2, selected by the second union branch and the intersection
      await insertAuthor({ first_name: "a2" });
      // And an EntityManager for the grouped set expression
      const em = newEntityManager();
      // And an Author alias for each independent branch
      const a = table(Author);
      // And a reusable query selecting only a1
      const one = query({ from: a, where: a.id.eq("a:1"), select: { id: a.id } });
      // And a reusable query selecting only a2
      const two = query({ from: a, where: a.id.eq("a:2"), select: { id: a.id } });
      // And recording isolated from the seed queries
      resetQueryCount();
      // When intersecting the entire union with a2
      const rows = await em.query({ intersect: [{ union: [one, two] }, two] });
      // Then a1 does not escape through an unparenthesized UNION
      expect(rows).toEqual([{ id: "a:2" }]);
      expect(queries).toHaveLength(1);
      expect(queries).toMatchInlineSnapshot(`
       [
         "((SELECT a.id AS id FROM authors AS a WHERE a.id = $1 AND a.deleted_at IS NULL) UNION (SELECT a1.id AS id FROM authors AS a1 WHERE a1.id = $2 AND a1.deleted_at IS NULL)) INTERSECT (SELECT a2.id AS id FROM authors AS a2 WHERE a2.id = $3 AND a2.deleted_at IS NULL)",
       ]
      `);
    });
  });

  describe("intersectAll", () => {
    it("uses the left count when it is smaller", async () => {
      // Given an Author named Alice
      await insertAuthor({ first_name: "Alice" });
      // And another Alice, selected only by the right operand
      await insertAuthor({ first_name: "Alice" });
      // And an Author query for the equal names
      const em = newEntityManager();
      const a = table(Author);
      // When the left has one copy and the right has two
      const rows = await em.query({
        intersectAll: [
          { from: a, where: a.id.eq("a:1"), select: { name: a.first_name } },
          { from: a, select: { name: a.first_name } },
        ],
      });
      // Then only the smaller left count survives
      expect(rows).toEqual([{ name: "Alice" }]);
    });

    it("uses the right count when it is smaller", async () => {
      // Given an Author named Alice
      await insertAuthor({ first_name: "Alice" });
      // And another Alice, selected only by the left operand
      await insertAuthor({ first_name: "Alice" });
      // And an Author query for the equal names
      const em = newEntityManager();
      const a = table(Author);
      // When the left has two copies and the right has one
      const rows = await em.query({
        intersectAll: [
          { from: a, select: { name: a.first_name } },
          { from: a, where: a.id.eq("a:1"), select: { name: a.first_name } },
        ],
      });
      // Then only the smaller right count survives
      expect(rows).toEqual([{ name: "Alice" }]);
    });

    it("preserves duplicates matched on both sides", async () => {
      // Given an Author named Alice
      await insertAuthor({ first_name: "Alice" });
      // And another Alice, giving both operands two equal rows
      await insertAuthor({ first_name: "Alice" });
      // And an Author query for those names
      const em = newEntityManager();
      const a = table(Author);
      // And recording isolated from the Author inserts
      resetQueryCount();
      // When both left copies have a matching right copy
      const rows = await em.query({
        intersectAll: [
          { from: a, select: { name: a.first_name } },
          { from: a, select: { name: a.first_name } },
        ],
      });
      // Then ALL retains both copies instead of deduplicating them
      expect(rows).toEqual([{ name: "Alice" }, { name: "Alice" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "(SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL) INTERSECT ALL (SELECT a1.first_name AS name FROM authors AS a1 WHERE a1.deleted_at IS NULL)",
       ]
      `);
    });

    it("does not match rows whose ages differ", async () => {
      // Given an Author named Alice aged 20
      await insertAuthor({ first_name: "Alice", age: 20 });
      // And another Alice aged 30, so only the names match
      await insertAuthor({ first_name: "Alice", age: 30 });
      // And an Author query selecting both name and age
      const em = newEntityManager();
      const a = table(Author);
      // When comparing the two complete rows
      const rows = await em.query({
        intersectAll: [
          { from: a, where: a.id.eq("a:1"), select: { name: a.first_name, age: a.age } },
          { from: a, where: a.id.eq("a:2"), select: { name: a.first_name, age: a.age } },
        ],
      });
      // Then ALL changes counts, not whole-row equality
      expect(rows).toEqual([]);
    });

    it("matches repeated NULLs with their multiplicity", async () => {
      // Given one Author with a SQL NULL age
      await insertAuthor({ first_name: "Alice", age: null });
      // And another Author with a SQL NULL age, giving each operand two NULL rows
      await insertAuthor({ first_name: "Bob", age: null });
      // And an Author query projecting only age
      const em = newEntityManager();
      const a = table(Author);
      // When both NULL copies have a corresponding right copy
      const rows = await em.query({
        intersectAll: [
          { from: a, select: { age: a.age } },
          { from: a, select: { age: a.age } },
        ],
      });
      // Then both NULL matches survive
      expect(rows).toEqual([{ age: null }, { age: null }]);
    });

    it("returns no rows for two empty operands", async () => {
      // Given no Authors
      // And an Author query over the empty table
      const em = newEntityManager();
      const a = table(Author);
      // When intersecting two empty projections
      const rows = await em.query({
        intersectAll: [
          { from: a, select: { id: a.id } },
          { from: a, select: { id: a.id } },
        ],
      });
      // Then the minimum count is zero
      expect(rows).toEqual([]);
    });

    it("returns no rows when the right operand is empty", async () => {
      // Given one Author for the nonempty left operand
      await insertAuthor({ first_name: "Alice" });
      // And an Author query with an empty right projection
      const em = newEntityManager();
      const a = table(Author);
      // When the left has one copy and the right has zero
      const rows = await em.query({
        intersectAll: [
          { from: a, select: { id: a.id } },
          { from: a, where: a.id.eq("a:0"), select: { id: a.id } },
        ],
      });
      // Then the zero right count removes the left row
      expect(rows).toEqual([]);
    });

    it("takes the minimum multiplicity across three INTERSECT ALL operands", async () => {
      // Given an Author contributing one copy of the shared name
      await insertAuthor({ first_name: "shared" });
      // And another Author giving the first two operands two copies each
      await insertAuthor({ first_name: "shared" });
      // And an EntityManager for the three-way intersection
      const em = newEntityManager();
      // And an Author alias for independent branch filters
      const a = table(Author);
      // And recording isolated from the fixture inserts
      resetQueryCount();
      // When the first two operands contribute two copies and the third contributes one
      const rows = await em.query({
        intersectAll: [
          { from: a, select: { name: a.first_name } },
          { from: a, select: { name: a.first_name } },
          { from: a, where: a.id.eq("a:1"), select: { name: a.first_name } },
        ],
      });
      // Then the minimum count is one, not the first pair's count of two
      expect(rows).toEqual([{ name: "shared" }]);
      expect(queries).toHaveLength(1);
      expect(queries).toMatchInlineSnapshot(`
       [
         "((SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL) INTERSECT ALL (SELECT a1.first_name AS name FROM authors AS a1 WHERE a1.deleted_at IS NULL)) INTERSECT ALL (SELECT a2.first_name AS name FROM authors AS a2 WHERE a2.id = $1 AND a2.deleted_at IS NULL)",
       ]
      `);
    });
  });

  describe("except", () => {
    it("removes all left copies when the right has a match", async () => {
      // Given an Author named Alice
      await insertAuthor({ first_name: "Alice" });
      // And another Alice, giving the left operand two equal rows
      await insertAuthor({ first_name: "Alice" });
      // And an Author query selecting only one copy on the right
      const em = newEntityManager();
      const a = table(Author);
      // And recording isolated from the Author insert
      resetQueryCount();
      // When one right copy matches both left copies
      const rows = await em.query({
        except: [
          { from: a, select: { name: a.first_name } },
          { from: a, where: a.id.eq("a:1"), select: { name: a.first_name } },
        ],
      });
      // Then EXCEPT removes the name entirely rather than subtracting only one copy
      expect(rows).toEqual([]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "(SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL) EXCEPT (SELECT a1.first_name AS name FROM authors AS a1 WHERE a1.id = $1 AND a1.deleted_at IS NULL)",
       ]
      `);
    });

    it("deduplicates the remaining left rows", async () => {
      // Given an Author named Alice
      await insertAuthor({ first_name: "Alice" });
      // And another Author with the same projected name
      await insertAuthor({ first_name: "Alice" });
      // And an Author query with no matching right rows
      const em = newEntityManager();
      const a = table(Author);
      // When subtracting an empty operand from two equal left rows
      const rows = await em.query({
        except: [
          { from: a, select: { name: a.first_name } },
          { from: a, where: a.id.eq("a:0"), select: { name: a.first_name } },
        ],
      });
      // Then the unmatched name survives only once
      expect(rows).toEqual([{ name: "Alice" }]);
    });

    it("does not return right-only rows", async () => {
      // Given one Author for the right operand
      await insertAuthor({ first_name: "Alice" });
      // And an Author query whose left operand is empty
      const em = newEntityManager();
      const a = table(Author);
      // When subtracting Alice from no left rows
      const rows = await em.query({
        except: [
          { from: a, where: a.id.eq("a:0"), select: { id: a.id } },
          { from: a, select: { id: a.id } },
        ],
      });
      // Then subtraction does not add the right row
      expect(rows).toEqual([]);
    });

    it("keeps a left row when the right age differs", async () => {
      // Given an Author named Alice aged 20
      await insertAuthor({ first_name: "Alice", age: 20 });
      // And another Alice aged 30, so only the names match
      await insertAuthor({ first_name: "Alice", age: 30 });
      // And an Author query selecting both name and age
      const em = newEntityManager();
      const a = table(Author);
      // When subtracting the older Alice from the younger Alice
      const rows = await em.query({
        except: [
          { from: a, where: a.id.eq("a:1"), select: { name: a.first_name, age: a.age } },
          { from: a, where: a.id.eq("a:2"), select: { name: a.first_name, age: a.age } },
        ],
      });
      // Then a matching name alone does not remove the left row
      expect(rows).toEqual([{ name: "Alice", age: 20 }]);
    });

    it("removes a NULL matched by the right operand", async () => {
      // Given one Author with a SQL NULL age
      await insertAuthor({ first_name: "Alice", age: null });
      // And an Author query projecting only age
      const em = newEntityManager();
      const a = table(Author);
      // When subtracting one NULL row from another
      const rows = await em.query({
        except: [
          { from: a, select: { age: a.age } },
          { from: a, select: { age: a.age } },
        ],
      });
      // Then corresponding NULLs compare equal and the left row is removed
      expect(rows).toEqual([]);
    });

    it("returns no rows for two empty operands", async () => {
      // Given no Authors
      // And an Author query over the empty table
      const em = newEntityManager();
      const a = table(Author);
      // When subtracting one empty projection from another
      const rows = await em.query({
        except: [
          { from: a, select: { id: a.id } },
          { from: a, select: { id: a.id } },
        ],
      });
      // Then there are no left rows to retain
      expect(rows).toEqual([]);
    });

    it("preserves right-nested EXCEPT instead of flattening it", async () => {
      // Given one Author selected at every nesting level
      await insertAuthor({ first_name: "Alice" });
      // And an Author query reused at each level
      const em = newEntityManager();
      const a = table(Author);
      const one = query({ from: a, select: { id: a.id } });
      // And recording isolated from the Author insert
      resetQueryCount();
      // When the right operand subtracts the Author from itself
      const rows = await em.query({ except: [one, { except: [one, one] }] });
      // Then the right operand is empty, retaining the Author that flattened subtraction would remove
      expect(rows).toEqual([{ id: "a:1" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "(SELECT a.id AS id FROM authors AS a WHERE a.deleted_at IS NULL) EXCEPT ((SELECT a1.id AS id FROM authors AS a1 WHERE a1.deleted_at IS NULL) EXCEPT (SELECT a2.id AS id FROM authors AS a2 WHERE a2.deleted_at IS NULL))",
       ]
      `);
    });
  });

  describe("exceptAll", () => {
    it("subtracts the right multiplicity from the left", async () => {
      // Given an Author named Alice
      await insertAuthor({ first_name: "Alice" });
      // And another Alice, giving the left operand two copies
      await insertAuthor({ first_name: "Alice" });
      // And an Author query selecting only one copy on the right
      const em = newEntityManager();
      const a = table(Author);
      // And recording isolated from the Author inserts
      resetQueryCount();
      // When subtracting one matching copy from two
      const rows = await em.query({
        exceptAll: [
          { from: a, select: { name: a.first_name } },
          { from: a, where: a.id.eq("a:1"), select: { name: a.first_name } },
        ],
      });
      // Then one unmatched copy remains
      expect(rows).toEqual([{ name: "Alice" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "(SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL) EXCEPT ALL (SELECT a1.first_name AS name FROM authors AS a1 WHERE a1.id = $1 AND a1.deleted_at IS NULL)",
       ]
      `);
    });

    it("floors the count at zero when the right has more copies", async () => {
      // Given an Author named Alice
      await insertAuthor({ first_name: "Alice" });
      // And another Alice, giving the right operand two copies
      await insertAuthor({ first_name: "Alice" });
      // And an Author query selecting only one copy on the left
      const em = newEntityManager();
      const a = table(Author);
      // When subtracting two copies from one
      const rows = await em.query({
        exceptAll: [
          { from: a, where: a.id.eq("a:1"), select: { name: a.first_name } },
          { from: a, select: { name: a.first_name } },
        ],
      });
      // Then excess right copies do not become result rows
      expect(rows).toEqual([]);
    });

    it("preserves duplicate left rows without a right match", async () => {
      // Given an Author named Alice
      await insertAuthor({ first_name: "Alice" });
      // And another Author with the same projected name
      await insertAuthor({ first_name: "Alice" });
      // And an Author query with an empty right operand
      const em = newEntityManager();
      const a = table(Author);
      // When no right row subtracts either left copy
      const rows = await em.query({
        exceptAll: [
          { from: a, select: { name: a.first_name } },
          { from: a, where: a.id.eq("a:0"), select: { name: a.first_name } },
        ],
      });
      // Then ALL retains both unmatched copies
      expect(rows).toEqual([{ name: "Alice" }, { name: "Alice" }]);
    });

    it("keeps a left row when the right age differs", async () => {
      // Given an Author named Alice aged 20
      await insertAuthor({ first_name: "Alice", age: 20 });
      // And another Alice aged 30, so only the names match
      await insertAuthor({ first_name: "Alice", age: 30 });
      // And an Author query selecting both name and age
      const em = newEntityManager();
      const a = table(Author);
      // When subtracting the older Alice from the younger Alice
      const rows = await em.query({
        exceptAll: [
          { from: a, where: a.id.eq("a:1"), select: { name: a.first_name, age: a.age } },
          { from: a, where: a.id.eq("a:2"), select: { name: a.first_name, age: a.age } },
        ],
      });
      // Then ALL changes counts, not whole-row equality
      expect(rows).toEqual([{ name: "Alice", age: 20 }]);
    });

    it("removes a NULL matched by the right operand", async () => {
      // Given one Author with a SQL NULL age
      await insertAuthor({ first_name: "Alice", age: null });
      // And an Author query projecting only age
      const em = newEntityManager();
      const a = table(Author);
      // When subtracting one NULL row from another
      const rows = await em.query({
        exceptAll: [
          { from: a, select: { age: a.age } },
          { from: a, select: { age: a.age } },
        ],
      });
      // Then the corresponding NULL removes one left copy
      expect(rows).toEqual([]);
    });

    it("returns no rows for two empty operands", async () => {
      // Given no Authors
      // And an Author query over the empty table
      const em = newEntityManager();
      const a = table(Author);
      // When subtracting one empty projection from another
      const rows = await em.query({
        exceptAll: [
          { from: a, select: { id: a.id } },
          { from: a, select: { id: a.id } },
        ],
      });
      // Then there are no left copies to retain
      expect(rows).toEqual([]);
    });

    it("subtracts three operands from left to right", async () => {
      // Given an Author contributing one copy of the shared name
      await insertAuthor({ first_name: "shared" });
      // And another Author giving the first operand two copies
      await insertAuthor({ first_name: "shared" });
      // And an EntityManager for the compound read
      const em = newEntityManager();
      // And an Author alias for all three operands
      const a = table(Author);
      // And recording isolated from the Author inserts
      resetQueryCount();
      // When each later operand subtracts one copy from the accumulated left result
      const rows = await em.query({
        exceptAll: [
          { from: a, select: { name: a.first_name } },
          { from: a, where: a.id.eq("a:1"), select: { name: a.first_name } },
          { from: a, where: a.id.eq("a:2"), select: { name: a.first_name } },
        ],
      });
      // Then no copies remain, rather than the two copies from right association
      expect(rows).toEqual([]);
      expect(queries).toHaveLength(1);
      expect(queries).toMatchInlineSnapshot(`
       [
         "((SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL) EXCEPT ALL (SELECT a1.first_name AS name FROM authors AS a1 WHERE a1.id = $1 AND a1.deleted_at IS NULL)) EXCEPT ALL (SELECT a2.first_name AS name FROM authors AS a2 WHERE a2.id = $2 AND a2.deleted_at IS NULL)",
       ]
      `);
    });
  });

  describe("columns and pagination", () => {
    it("aligns a paginated query value without repeating its volatile aggregate", async () => {
      // Given one Author contributing one non-null random value to the aggregate
      await insertAuthor({ first_name: "Alice" });
      // And an EntityManager for the compound read
      const em = newEntityManager();
      // And an Author alias local to each branch
      const a = table(Author);
      // And a reversed reusable projection with DISTINCT and pagination owned by its branch
      const reversed = query({
        from: a,
        select: { name: a.first_name, count: sql<number>`random()`.count() },
        groupBy: [a.first_name],
        distinct: true,
        orderBy: { count: "DESC" },
        limit: 1,
      });
      // And query recording isolated from the Author insert
      resetQueryCount();
      // When the first branch establishes the opposite output-column order
      const rows = await em.query({
        union: [
          {
            from: a,
            where: a.id.eq("a:0"),
            groupBy: [a.first_name],
            select: { count: a.id.count(), name: a.first_name },
          },
          reversed,
        ],
      });
      // Then the wrapper references outputs and leaves the volatile expression in its original scope
      expect(rows).toEqual([{ count: 1, name: "Alice" }]);
      expect(queries).toMatchInlineSnapshot(`
       [
         "(SELECT count(a.id)::int AS "count", a.first_name AS name FROM authors AS a WHERE a.id = $1 AND a.deleted_at IS NULL GROUP BY a.first_name) UNION (SELECT sq."count" AS "count", sq.name AS name FROM (SELECT DISTINCT a1.first_name AS name, count(random())::int AS "count" FROM authors AS a1 WHERE a1.deleted_at IS NULL GROUP BY a1.first_name ORDER BY "count" DESC LIMIT $2) AS sq)",
       ]
      `);
    });

    it("resolves a nested multi-column projection once per output traversal", () => {
      // Given an Author projection with eight independent named columns
      const a = table(Author);
      // And a projection proxy that counts output enumeration without changing its columns
      let enumerations = 0;
      const select = new Proxy(
        {
          id: a.id,
          name: a.first_name,
          lastName: a.last_name,
          age: a.age,
          createdAt: a.created_at,
          updatedAt: a.updated_at,
          initials: a.initials,
          popular: a.is_popular,
        },
        {
          ownKeys(target) {
            enumerations++;
            return Reflect.ownKeys(target);
          },
        },
      );
      // And six ordinary wrappers that select all columns of their source
      let names = query({ from: a, select });
      for (let i = 0; i < 6; i++) names = query({ from: names, select: names });
      // And enumeration isolated from constructing those wrappers
      enumerations = 0;
      // When resolving one more wrapper's output metadata
      query({ from: names, select: names });
      // Then the base projection is visited once, not once per column at every nesting level
      expect(enumerations).toBe(1);
    });

    it("keeps a reusable select-named column in POJO mode", async () => {
      // Given an Author name selected under the name of an ordinary query clause
      await insertAuthor({ first_name: "Alice" });
      // And an EntityManager for the compound read
      const em = newEntityManager();
      // And an Author alias for the reusable projection
      const a = table(Author);
      // And a table-shaped query whose select property is a column, not a query clause
      const names = query({ from: a, select: { select: a.first_name } });
      // And a named compound that orders by that output key
      const combined = query({ union: [names, names], orderBy: { select: "ASC" }, as: "names" });
      // When using the compound as an ordinary derived source
      const rows = await em.query({ from: combined, select: combined, where: combined.select.eq("Alice") });
      // Then runtime mode agrees with the table-shaped inferred type
      expect(rows).toEqual([{ select: "Alice" }]);
    });

    it("aligns frozen POJO projections by key without mutating branch queries", async () => {
      // Given an Author whose name and last name must not exchange columns
      await insertAuthor({ first_name: "author", last_name: "author detail" });
      // And a Book whose title differs from its Author's name for the reversed projection
      await insertBook({ title: "book", author_id: 1 });
      // And an EntityManager for the combined read
      const em = newEntityManager();
      // And separate Author and Book aliases
      const [a, b] = tables(Author, Book);
      // And an immutable first projection defining the canonical output order
      const author = Object.freeze({ from: a, select: Object.freeze({ name: a.first_name, detail: a.last_name }) });
      // And an immutable second projection with the opposite key insertion order
      const book = Object.freeze({
        from: b,
        join: [{ inner: a, on: b.author_id.eq(a.id) }],
        select: Object.freeze({ detail: a.first_name, name: b.title }),
      });
      // And an immutable tuple owned by the caller
      const operands = Object.freeze([author, book] as const);
      // And recording isolated from seed inserts
      resetQueryCount();
      // When normalizing the later branch to the first projection's column order
      const rows = await em.query({ union: operands, orderBy: { name: "ASC" } });
      // Then name and detail retain their named meanings and the caller's order is unchanged
      expect(rows).toEqual([
        { name: "author", detail: "author detail" },
        { name: "book", detail: "author" },
      ]);
      expect(Object.keys(author.select)).toEqual(["name", "detail"]);
      expect(Object.keys(book.select)).toEqual(["detail", "name"]);
      expect(operands[0]).toBe(author);
      expect(operands[1]).toBe(book);
      expect(queries).toHaveLength(1);
      expect(queries).toMatchInlineSnapshot(`
       [
         "(SELECT a.first_name AS name, a.last_name AS detail FROM authors AS a WHERE a.deleted_at IS NULL) UNION (SELECT sq.name AS name, sq.detail AS detail FROM (SELECT a1.first_name AS detail, b.title AS name FROM books AS b JOIN authors AS a1 ON b.author_id = a1.id WHERE b.deleted_at IS NULL) AS sq) ORDER BY name ASC",
       ]
      `);
    });

    it("aligns reusable query values without losing DISTINCT or their own page", async () => {
      // Given two Authors with equal projected rows for branch-local DISTINCT
      await insertAuthor({ first_name: "a1", last_name: "detail 1" });
      await insertAuthor({ first_name: "a1", last_name: "detail 1" });
      // And two later names so offset selects a2 only after deduplication
      await insertAuthor({ first_name: "a2", last_name: "detail 2" });
      await insertAuthor({ first_name: "a3", last_name: "detail 3" });
      // And an EntityManager for the reusable branch read
      const em = newEntityManager();
      // And an Author alias for both branches
      const a = table(Author);
      // And a named branch whose reversed projection has its own DISTINCT, ordering, limit, and offset
      const page = query({
        from: a,
        select: { detail: a.last_name, name: a.first_name },
        distinct: true,
        orderBy: { name: "ASC" },
        limit: 1,
        offset: 1,
        as: "author_page",
      });
      // And recording isolated from Author inserts
      resetQueryCount();
      // When combining an inline a1 branch with the paginated reusable branch
      const rows = await em.query({
        unionAll: [{ from: a, where: a.id.eq("a:1"), select: { name: a.first_name, detail: a.last_name } }, page],
        orderBy: { name: "ASC" },
      });
      // Then reordering output columns does not move the page or DISTINCT into the outer scope
      expect(rows).toEqual([
        { name: "a1", detail: "detail 1" },
        { name: "a2", detail: "detail 2" },
      ]);
      expect(queries).toHaveLength(1);
      expect(queries).toMatchInlineSnapshot(`
       [
         "(SELECT a.first_name AS name, a.last_name AS detail FROM authors AS a WHERE a.id = $1 AND a.deleted_at IS NULL) UNION ALL (SELECT sq.name AS name, sq.detail AS detail FROM (SELECT DISTINCT a1.last_name AS detail, a1.first_name AS name FROM authors AS a1 WHERE a1.deleted_at IS NULL ORDER BY name ASC LIMIT $2 OFFSET $3) AS sq) ORDER BY name ASC",
       ]
      `);
    });

    it("uses a named compound query value as an operand without losing its own page", async () => {
      // Given two Authors selected by the inner compound before pagination
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And an EntityManager for nested reusable compounds
      const em = newEntityManager();
      // And an Author alias shared by independent branches
      const a = table(Author);
      // And a named compound whose descending one-row page contains only a2
      const latest = query({
        union: [
          { from: a, select: { id: a.id } },
          { from: a, select: { id: a.id } },
        ],
        orderBy: { id: "DESC" },
        limit: 1,
        as: "latest_author",
      });
      // And recording isolated from the Author inserts
      resetQueryCount();
      // When combining that reusable compound with an inline a1 branch
      const rows = await em.query({
        unionAll: [{ from: a, where: a.id.eq("a:1"), select: { id: a.id } }, latest],
        orderBy: { id: "ASC" },
      });
      // Then the inner compound's page remains local and the outer ordering remains independent
      expect(rows).toEqual([{ id: "a:1" }, { id: "a:2" }]);
      expect(queries).toHaveLength(1);
      expect(queries).toMatchInlineSnapshot(`
       [
         "(SELECT a.id AS id FROM authors AS a WHERE a.id = $1 AND a.deleted_at IS NULL) UNION ALL ((SELECT a1.id AS id FROM authors AS a1 WHERE a1.deleted_at IS NULL) UNION (SELECT a2.id AS id FROM authors AS a2 WHERE a2.deleted_at IS NULL) ORDER BY id DESC LIMIT $2) ORDER BY id ASC",
       ]
      `);
    });

    it("keeps branch and compound pagination separate with ordered parameter bindings", async () => {
      // Given Author names in an order different from their insertion order
      await insertAuthor({ first_name: "Cedar" });
      await insertAuthor({ first_name: "Aspen" });
      await insertAuthor({ first_name: "Birch" });
      // And Book titles whose branch uses the opposite direction
      await insertBook({ title: "Dune", author_id: 1 });
      await insertBook({ title: "Fable", author_id: 1 });
      await insertBook({ title: "Elm", author_id: 1 });
      // And an EntityManager for the paginated compound
      const em = newEntityManager();
      // And aliases for the two branch sources
      const [a, b] = tables(Author, Book);
      // And a call-through driver spy exposing the actual ordered bindings
      const execute = jest.spyOn(testDriver.driver, "executeQuery");
      // And SQL recording isolated from the fixture inserts
      resetQueryCount();
      try {
        // When each branch has its own page and the compound has a different outer page
        const rows = await em.query({
          unionAll: [
            {
              from: a,
              where: a.first_name.ne("absent author"),
              select: { name: a.first_name },
              orderBy: { name: "ASC" },
              limit: 2,
              offset: 1,
            },
            {
              from: b,
              where: b.title.ne("absent book"),
              select: { name: b.title },
              orderBy: { name: "DESC" },
              limit: 2,
              offset: 1,
            },
          ],
          orderBy: { name: "DESC" },
          limit: 2,
          offset: 1,
        });
        // Then branch pages contribute Birch/Cedar and Elm/Dune, and the outer page selects Dune/Cedar
        expect(rows).toEqual([{ name: "Dune" }, { name: "Cedar" }]);
        expect(queries).toHaveLength(1);
        expect(queries).toMatchInlineSnapshot(`
         [
           "(SELECT a.first_name AS name FROM authors AS a WHERE a.first_name != $1 AND a.deleted_at IS NULL ORDER BY name ASC LIMIT $2 OFFSET $3) UNION ALL (SELECT b.title AS name FROM books AS b WHERE b.title != $4 AND b.deleted_at IS NULL ORDER BY name DESC LIMIT $5 OFFSET $6) ORDER BY name DESC LIMIT $7 OFFSET $8",
         ]
        `);
        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute.mock.calls[0][2]).toEqual(["absent author", 2, 1, "absent book", 2, 1, 2, 1]);
      } finally {
        execute.mockRestore();
      }
    });

    it.each(["object", "array"] as const)(
      "orders quoted output keys and prunes undefined directions in %s form",
      async (form) => {
        // Given an Author named b with a known age
        await insertAuthor({ first_name: "b", age: 20 });
        // And an Author named a with an unknown age, inserted after b
        await insertAuthor({ first_name: "a" });
        // And an EntityManager for keyed compound ordering
        const em = newEntityManager();
        // And an Author alias for the readonly branches
        const a = table(Author);
        // And a quoted display key that must remain one output identifier
        const select = { 'Display "Name"': a.first_name, age: a.age, union: a.first_name };
        // And an absent optional name direction, leaving age as the only sort
        const byName: "ASC" | undefined = undefined;
        // When the age sort is the only supplied direction, with explicit NULLS FIRST
        const rows = await em.query({
          union: [
            { from: a, select },
            { from: a, select },
          ],
          orderBy:
            form === "object"
              ? { 'Display "Name"': byName, age: "DESC NULLS FIRST" }
              : [{ 'Display "Name"': byName }, { age: "DESC NULLS FIRST" }],
        });
        // Then SQL treats display keys as identifiers and leaves the NULL age first
        expect(rows).toEqual([
          { 'Display "Name"': "a", age: null, union: "a" },
          { 'Display "Name"': "b", age: 20, union: "b" },
        ]);
      },
    );

    it("executes a named compound directly even when an output key is union", async () => {
      // Given one Author for duplicate elimination
      await insertAuthor({ first_name: "a1" });
      // And an EntityManager for direct query-value execution
      const em = newEntityManager();
      // And an Author alias for both branches
      const a = table(Author);
      // And a named compound with an output column that is also an operation keyword
      const names = query({
        union: [
          { from: a, select: { union: a.first_name } },
          { from: a, select: { union: a.first_name } },
        ],
        as: "names",
      });
      // And recording isolated from the fixture insert
      resetQueryCount();
      // When executing the named value without an outer SELECT
      const rows = await em.query(names);
      // Then its union column is a result column, not a fluent method or another root operation
      expect(rows).toEqual([{ union: "a1" }]);
      expect(queries).toHaveLength(1);
      expect(queries).toMatchInlineSnapshot(`
       [
         "(SELECT a.first_name AS "union" FROM authors AS a WHERE a.deleted_at IS NULL) UNION (SELECT a1.first_name AS "union" FROM authors AS a1 WHERE a1.deleted_at IS NULL)",
       ]
      `);
    });

    it("uses a named compound as a derived source for predicates and expression ordering", async () => {
      // Given an Author whose mixed-case name sorts after the Book when lowercased
      await insertAuthor({ first_name: "Zebra" });
      // And a Book whose lowercase title sorts first
      await insertBook({ title: "apple", author_id: 1 });
      // And an EntityManager for the outer query
      const em = newEntityManager();
      // And Author and Book aliases for the compound branches
      const [a, b] = tables(Author, Book);
      // And a compound name containing a quote and SQL punctuation that must remain one identifier
      const names = query({
        union: [
          { from: a, select: { name: a.first_name } },
          { from: b, select: { name: b.title } },
        ],
        as: 'names" --',
      });
      // And recording isolated from seed queries
      resetQueryCount();
      // When an ordinary outer query filters and orders the compound's columns with an expression
      const rows = await em.query({
        from: names,
        where: names.name.ne(""),
        select: names,
        orderBy: [{ asc: sql<string>`lower(${names.name})` }],
      });
      // Then derived columns retain their values and resolve the quoted source name
      expect(rows).toEqual([{ name: "apple" }, { name: "Zebra" }]);
      expect(queries).toHaveLength(1);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT "names"" --".name AS name FROM ((SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL) UNION (SELECT b.title AS name FROM books AS b WHERE b.deleted_at IS NULL)) AS "names"" --" WHERE "names"" --".name != $1 ORDER BY lower("names"" --".name) ASC",
       ]
      `);
    });
  });

  describe("codecs", () => {
    it.each(["PK first", "FK first"] as const)("decodes compatible Author PK/FK outputs with %s", async (order) => {
      // Given two Authors with distinct physical keys
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And a Book contributing a2 through its Author FK, not its own Book id
      await insertBook({ title: "b1", author_id: 2 });
      // And an EntityManager for direct POJO results
      const em = newEntityManager();
      // And Author and Book aliases whose selected keys have separate serde instances
      const [a, b] = tables(Author, Book);
      // And a PK branch selecting a1
      const pk = { from: a, where: a.id.eq("a:1"), select: { id: a.id } } satisfies Query;
      // And an FK branch selecting a2
      const fk = { from: b, select: { id: b.author_id } } satisfies Query;
      // When combining the same Author-id domain in either order
      const rows = await em.query({ union: order === "PK first" ? [pk, fk] : [fk, pk], orderBy: { id: "ASC" } });
      // Then neither output is tagged as a Book id and the first decoder does not change the results
      expect(rows).toEqual([{ id: "a:1" }, { id: "a:2" }]);
    });

    it("encodes predicates on a combined Author-id column", async () => {
      // Given two Authors so the outer id predicate must discard a real competing row
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And a Book contributing a1 through its FK
      await insertBook({ title: "b1", author_id: 1 });
      // And an EntityManager for the outer derived-table query
      const em = newEntityManager();
      // And aliases for compatible Author-id branches
      const [a, b] = tables(Author, Book);
      // And a named compound with the FK branch first
      const ids = query({
        union: [
          { from: b, select: { id: b.author_id } },
          { from: a, select: { id: a.id } },
        ],
        as: "author_ids",
      });
      // And a call-through spy for the actual physical comparison binding
      const execute = jest.spyOn(testDriver.driver, "executeQuery");
      // And recording isolated from seed inserts
      resetQueryCount();
      try {
        // When comparing the combined column with a tagged Author id
        const rows = await em.query({ from: ids, where: ids.id.eq("a:2"), select: ids });
        // Then comparison encoding strips the tag while result decoding restores it
        expect(rows).toEqual([{ id: "a:2" }]);
        expect(queries).toHaveLength(1);
        expect(queries).toMatchInlineSnapshot(`
         [
           "SELECT author_ids.id AS id FROM ((SELECT b.author_id AS id FROM books AS b WHERE b.deleted_at IS NULL) UNION (SELECT a.id AS id FROM authors AS a WHERE a.deleted_at IS NULL)) AS author_ids WHERE author_ids.id = $1",
         ]
        `);
        expect(execute.mock.calls[0][2]).toEqual([2]);
      } finally {
        execute.mockRestore();
      }
    });

    it("left joins a compound and encodes an Author-id coalesce fallback", async () => {
      // Given two Authors, with a2 missing from the compound
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And one Book for a1, duplicating the first branch's Author id
      await insertBook({ title: "b1", author_id: 1 });
      // And an EntityManager for the outer join
      const em = newEntityManager();
      // And aliases for the outer source and compound branches
      const [a, b] = tables(Author, Book);
      // And a separate Author alias local to the PK branch
      const inner = table(Author, "inner_author");
      // And a compound containing only a1
      const ids = query({
        union: [
          { from: inner, where: inner.id.eq("a:1"), select: { id: inner.id } },
          { from: b, select: { id: b.author_id } },
        ],
        as: "author_ids",
      });
      // And a call-through spy exposing the fallback and branch filter bindings
      const execute = jest.spyOn(testDriver.driver, "executeQuery");
      // And recording isolated from fixture setup
      resetQueryCount();
      try {
        // When left joining by the combined id and projecting both nullable and coalesced columns
        const rows = await em.query({
          from: a,
          join: [{ left: ids, on: ids.id.eq(a.id) }],
          select: { name: a.first_name, id: ids.id, fallback: ids.id.coalesce("a:9") },
          orderBy: { name: "ASC" },
        });
        // Then the absent row remains NULL and only coalesce produces the encoded Author-id fallback
        expect(rows).toEqual([
          { name: "a1", id: "a:1", fallback: "a:1" },
          { name: "a2", id: null, fallback: "a:9" },
        ]);
        expect(queries).toHaveLength(1);
        expect(queries).toMatchInlineSnapshot(`
         [
           "SELECT a.first_name AS name, author_ids.id AS id, coalesce(author_ids.id, $1) AS fallback FROM authors AS a LEFT OUTER JOIN ((SELECT a1.id AS id FROM authors AS a1 WHERE a1.id = $2 AND a1.deleted_at IS NULL) UNION (SELECT b.author_id AS id FROM books AS b WHERE b.deleted_at IS NULL)) AS author_ids ON author_ids.id = a.id WHERE a.deleted_at IS NULL ORDER BY name ASC",
         ]
        `);
        expect(execute.mock.calls[0][2]).toEqual([9, 1]);
      } finally {
        execute.mockRestore();
      }
    });

    it.each(["PK first", "FK first"] as const)(
      "selects the Author component of polymorphic IN with %s",
      async (order) => {
        // Given Author a1 selected by the PK branch
        await insertAuthor({ first_name: "a1" });
        // And Author a2 selected by the Book FK branch
        await insertAuthor({ first_name: "a2" });
        // And Author a3 excluded from the compound
        await insertAuthor({ first_name: "a3" });
        // And Book b1 referencing a2 while sharing its physical key with Author a1
        await insertBook({ title: "b1", author_id: 2 });
        // And a Comment on the Author selected by the PK branch
        await insertComment({ text: "on a1", parent_author_id: 1 });
        // And a Comment on the Author selected by the FK branch
        await insertComment({ text: "on a2", parent_author_id: 2 });
        // And a Comment on the excluded Author
        await insertComment({ text: "on a3", parent_author_id: 3 });
        // And a Comment on Book b1 that must not match the Author id with the same physical key
        await insertComment({ text: "on b1", parent_book_id: 1 });
        // And an EntityManager for the polymorphic predicate
        const em = newEntityManager();
        // And separate aliases for the Comment source and both POJO branches
        const [c, a, b] = tables(Comment, Author, Book);
        // And a POJO PK query selecting a1
        const pk = query({ from: a, where: a.id.eq("a:1"), select: { id: a.id } });
        // And a compatible POJO FK query selecting a2 through its Book
        const fk = query({ from: b, select: { id: b.author_id } });
        // And a compound whose agreed target domain must not depend on which branch owns the first column
        const ids = query({ union: order === "PK first" ? [pk, fk] : [fk, pk], as: "author_ids" });
        // When filtering Comment parents with an ordinary scalar projection of the compound id
        const rows = await em.query({
          from: c,
          where: c.parent.in(query({ from: ids, select: ids.id })),
          select: { text: c.text },
          orderBy: { text: "ASC" },
        });
        // Then only the Author component matches, not the Book component or unselected Author
        expect(rows).toEqual([{ text: "on a1" }, { text: "on a2" }]);
      },
    );

    it.each(["nullable first", "nullable last"] as const)(
      "preserves left-join NULLs with the %s branch",
      async (order) => {
        // Given an Author without Books, producing a NULL from the left join
        await insertAuthor({ first_name: "a1" });
        // And an EntityManager for the nullable union
        const em = newEntityManager();
        // And Author and Book aliases with different sources but compatible varchar outputs
        const [a, b] = tables(Author, Book);
        // And a nullable projection of the missing left-joined Book
        const nullable = {
          from: a,
          join: [{ left: b, on: b.author_id.eq(a.id) }],
          select: { name: b.title },
        } satisfies Query;
        // And a nonnullable projection of the Author's own name
        const required = { from: a, select: { name: a.first_name } } satisfies Query;
        // When either branch can be the first branch supplying the output schema
        const rows = await em.query({
          union: order === "nullable first" ? [nullable, required] : [required, nullable],
          orderBy: { name: "ASC NULLS LAST" },
        });
        // Then the missing Book stays NULL rather than using the required branch's assumptions
        expect(rows).toEqual([{ name: "a1" }, { name: null }]);
      },
    );

    it("preserves a known codec when every selected age is NULL", async () => {
      // Given an Author whose age is SQL NULL
      await insertAuthor({ first_name: "a1" });
      // And an EntityManager for NULL-only but physically typed branches
      const em = newEntityManager();
      // And independent Author aliases with the same known int4 domain
      const [a, other] = tables(Author, Author);
      // When combining two NULL age projections
      const rows = await em.query({
        union: [
          { from: a, select: { age: a.age } },
          { from: other, select: { age: other.age } },
        ],
      });
      // Then deduplication returns one NULL, not a fabricated number or an unknown raw-SQL codec
      expect(rows).toEqual([{ age: null }]);
    });

    it("decodes matching SUM outputs as numbers rather than driver int8 strings", async () => {
      // Given an Author whose age forms the first aggregate group
      await insertAuthor({ first_name: "a1", age: 20 });
      // And a second Author whose age forms a different aggregate result
      await insertAuthor({ first_name: "a2", age: 40 });
      // And an EntityManager for aggregate decoding
      const em = newEntityManager();
      // And independent Author aliases whose SUM expressions share int8 and Number codecs
      const [a, other] = tables(Author, Author);
      // When both branches select SUM rather than mixing SUM with an int4 age column
      const rows = await em.query({
        union: [
          { from: a, where: a.id.eq("a:1"), select: { age: a.age.sum() } },
          { from: other, where: other.id.eq("a:2"), select: { age: other.age.sum() } },
        ],
        orderBy: { age: "ASC" },
      });
      // Then the agreed aggregate decoder returns numbers for every branch
      expect(rows).toEqual([{ age: 20 }, { age: 40 }]);
    });

    it("combines MIN and MAX of varchar columns using their matching text outputs", async () => {
      // Given an Author name for the minimum aggregate
      await insertAuthor({ first_name: "author" });
      // And a Book title for the maximum aggregate
      await insertBook({ title: "book", author_id: 1 });
      // And an EntityManager for matching aggregate output types
      const em = newEntityManager();
      // And Author and Book aliases whose raw varchar fields are not themselves operands here
      const [a, b] = tables(Author, Book);
      // When both aggregates return text even though their input columns are varchar
      const rows = await em.query({
        union: [
          { from: a, select: { name: a.first_name.min() } },
          { from: b, select: { name: b.title.max() } },
        ],
        orderBy: { name: "ASC" },
      });
      // Then the matching text codecs decode both aggregate results
      expect(rows).toEqual([{ name: "author" }, { name: "book" }]);
    });

    it("decodes scalar enum, native enum, schema JSON, and Date columns from matching domains", async () => {
      // Given an Author with physical enum values, schema-backed JSON, and a known timestamp
      await insertAuthor({
        first_name: "a1",
        range_of_books: 1,
        favorite_shape: "circle",
        business_address: { street: "123 Main", extra: "strip this" },
        created_at: new Date("2020-01-02T03:04:05.000Z"),
      });
      // And another Author with SQL NULL for the optional domains and a different timestamp
      await insertAuthor({ first_name: "a2", created_at: new Date("2021-02-03T04:05:06.000Z") });
      // And an EntityManager for the decoded compound
      const em = newEntityManager();
      // And two separate aliases whose fields share logical domains, not expression identity
      const [a, other] = tables(Author, Author);
      // When UNION compares the same physical rows from both aliases
      const rows = await em.query({
        union: [
          {
            from: a,
            select: {
              name: a.first_name,
              range: a.range_of_books,
              shape: a.favorite_shape,
              address: a.business_address,
              createdAt: a.created_at,
            },
          },
          {
            from: other,
            select: {
              name: other.first_name,
              range: other.range_of_books,
              shape: other.favorite_shape,
              address: other.business_address,
              createdAt: other.created_at,
            },
          },
        ],
        orderBy: { name: "ASC" },
      });
      // Then each domain decodes normally and schema parsing strips extra JSON keys
      expect(rows).toEqual([
        {
          name: "a1",
          range: BookRange.Few,
          shape: FavoriteShape.Circle,
          address: { street: "123 Main" },
          createdAt: new Date("2020-01-02T03:04:05.000Z"),
        },
        { name: "a2", range: null, shape: null, address: null, createdAt: new Date("2021-02-03T04:05:06.000Z") },
      ]);
    });

    it("uses SQL row equality before schema JSON decoding", async () => {
      // Given an Author with a schema-valid address and one extra physical JSON key
      await insertAuthor({ first_name: "a1", business_address: { street: "123 Main", extra: "left" } });
      // And another Author with the same logical address but a different extra physical key
      await insertAuthor({ first_name: "a2", business_address: { street: "123 Main", extra: "right" } });
      // And an EntityManager for set equality before decoding
      const em = newEntityManager();
      // And an Author alias for both address branches
      const a = table(Author);
      // When UNION compares physically unequal JSONB rows before the schema strips extra keys
      const rows = await em.query({
        union: [
          { from: a, where: a.id.eq("a:1"), select: { address: a.business_address } },
          { from: a, where: a.id.eq("a:2"), select: { address: a.business_address } },
        ],
      });
      // Then both SQL rows survive even though their decoded JavaScript values are equal
      expect(rows).toEqual([{ address: { street: "123 Main" } }, { address: { street: "123 Main" } }]);
    });

    it("rejects invalid schema JSON during compound result decoding", async () => {
      // Given an Author whose physical JSON violates AddressSchema's string street requirement
      await insertAuthor({ first_name: "a1", business_address: { street: 123 } });
      // And an EntityManager for result decoding
      const em = newEntityManager();
      // And an Author alias with a known schema codec in both branches
      const a = table(Author);
      // When executing a codec-compatible compound over invalid stored JSON
      const result = em.query({
        union: [
          { from: a, select: { address: a.business_address } },
          { from: a, select: { address: a.business_address } },
        ],
      });
      // Then runtime schema validation is retained after the set operation
      await expect(result).rejects.toThrow(ZodError);
    });

    it("decodes custom scalar passwords and encodes derived comparison values", async () => {
      // Given a PasswordValue with its persisted encoding
      const password = PasswordValue.fromPlainText("secret");
      // And a User storing that password
      await insertUser({ name: "u1", password: password.encoded });
      // And another User with a different password to be excluded by the outer predicate
      await insertUser({ name: "u2", password: PasswordValue.fromPlainText("other").encoded });
      // And an EntityManager for the custom-domain compound
      const em = newEntityManager();
      // And independent User aliases sharing the same custom mapper
      const [u, other] = tables(User, User);
      // And a derived compound retaining the password's custom encoder and decoder
      const passwords = query({
        union: [
          { from: u, select: { password: u.password } },
          { from: other, select: { password: other.password } },
        ],
        as: "passwords",
      });
      // And a call-through spy for the encoded comparison parameter
      const execute = jest.spyOn(testDriver.driver, "executeQuery");
      // And recording isolated from User inserts
      resetQueryCount();
      try {
        // When comparing the combined custom column with a PasswordValue
        const rows = await em.query({ from: passwords, where: passwords.password.eq(password), select: passwords });
        // Then the result remains a PasswordValue and the driver receives its stored string
        expect(rows).toEqual([{ password }]);
        expect(rows[0].password).toBeInstanceOf(PasswordValue);
        expect(rows[0].password!.matches("secret")).toBe(true);
        expect(queries).toHaveLength(1);
        expect(queries).toMatchInlineSnapshot(`
         [
           "SELECT passwords.password AS password FROM ((SELECT u.password AS password FROM users AS u) UNION (SELECT u1.password AS password FROM users AS u1)) AS passwords WHERE passwords.password = $1",
         ]
        `);
        expect(execute.mock.calls[0][2]).toEqual([password.encoded]);
      } finally {
        execute.mockRestore();
      }
    });

    it.each(["populated", "empty", "null"] as const)("filters and combines %s custom password arrays", async (kind) => {
      // Given a User with an ordered password history, an empty history, or SQL NULL
      const em = newEntityManager();
      const password = PasswordValue.fromPlainText("previous");
      const older = PasswordValue.fromPlainText("older");
      const history = kind === "populated" ? [password, older] : kind === "empty" ? [] : null;
      const user = newUser(em, { passwordHistory: history ?? undefined });
      // And another User whose different history must not match the array predicate
      newUser(em, { passwordHistory: [older, password] });
      await em.flush();
      // And independent aliases sharing the generated password-history codec
      const [u, other] = tables(User, User);
      const histories = query({
        union: [
          { from: u, select: { history: u.password_history } },
          { from: other, select: { history: other.password_history } },
        ],
        as: "histories",
      });
      // When filtering both a physical alias and the compound's derived array column
      const direct = await em.query({ from: u, where: u.password_history.eq(history), select: u.password_history });
      const combined = await em.query({ from: histories, where: histories.history.eq(history), select: histories });
      const found = await em.find(User, { passwordHistory: { eq: history } });
      // Then each path encodes elements, preserves SQL NULL, and decodes the same domain array
      expect(direct).toEqual([history]);
      expect(combined).toEqual([{ history }]);
      expectTypeOf(combined).toEqualTypeOf<{ history: PasswordValue[] | null }[]>();
      expect(found).toEqual([user]);
      if (kind === "populated") {
        expect(combined[0].history![0]).toBeInstanceOf(PasswordValue);
        expect(combined[0].history![0].matches("previous")).toBe(true);
      }
    });

    it("combines physical primitive arrays with matching arrayAgg outputs", async () => {
      // Given an Author whose varchar array matches its single first name
      await insertAuthor({ first_name: "a1", nick_names: ["a1"] });
      // And an EntityManager for primitive-array set equality
      const em = newEntityManager();
      // And independent Author aliases for the physical and aggregate representations
      const [a, other] = tables(Author, Author);
      // When combining a physical varchar array with array_agg(varchar)
      const rows = await em.query({
        union: [
          { from: a, select: { names: a.nick_names } },
          { from: other, select: { names: other.first_name.arrayAgg() } },
        ],
      });
      // Then compatible array domains deduplicate and decode without converting the elements
      expect(rows).toEqual([{ names: ["a1"] }]);
    });

    it("preserves SQL NULL and empty physical primitive arrays", async () => {
      // Given an Author with a SQL NULL nickname array
      await insertAuthor({ first_name: "a1", nick_names: null });
      // And another Author with an empty array rather than SQL NULL
      await insertAuthor({ first_name: "a2", nick_names: [] });
      // And an EntityManager for the array projection
      const em = newEntityManager();
      // And an Author alias for both branches
      const a = table(Author);
      // When combining both array representations without entity getter defaults
      const rows = await em.query({
        union: [
          { from: a, select: { names: a.nick_names } },
          { from: a, select: { names: a.nick_names } },
        ],
        orderBy: { names: "ASC NULLS LAST" },
      });
      // Then the empty array and SQL NULL remain separate SQL values
      expect(rows).toEqual([{ names: [] }, { names: null }]);
    });

    it("decodes compatible Author-id arrayAgg outputs and encodes each fallback element", async () => {
      // Given an Author whose id can be selected through a PK or Book FK
      await insertAuthor({ first_name: "a1" });
      // And one Book whose Author-id aggregate equals the PK aggregate
      await insertBook({ title: "b1", author_id: 1 });
      // And an EntityManager for aggregate array decoding
      const em = newEntityManager();
      // And aliases for the two Author-id aggregate sources
      const [a, b] = tables(Author, Book);
      // And an empty aggregate compound for exercising an Author-id array fallback
      const empty = query({
        union: [
          { from: a, where: a.id.eq("a:9"), select: { ids: a.id.arrayAgg() } },
          { from: b, where: b.id.eq("b:9"), select: { ids: b.author_id.arrayAgg() } },
        ],
        as: "empty_ids",
      });
      // And a named compound whose array elements share the Author-id domain
      const ids = query({
        union: [
          { from: a, select: { ids: a.id.arrayAgg() } },
          { from: b, select: { ids: b.author_id.arrayAgg() } },
        ],
        as: "author_ids",
      });
      // And a call-through spy exposing fallback encoding and branch bindings
      const execute = jest.spyOn(testDriver.driver, "executeQuery");
      // And recording isolated from the seed inserts
      resetQueryCount();
      try {
        // When selecting the combined array and a coalesced NULL aggregate
        const rows = await em.query({
          from: ids,
          select: { ids: ids.ids, fallback: query({ from: empty, select: empty.ids }).coalesce(["a:9"]) },
        });
        // Then both real and fallback arrays contain tagged Author ids after decoding
        expect(rows).toEqual([{ ids: ["a:1"], fallback: ["a:9"] }]);
        expect(queries).toHaveLength(1);
        expect(queries).toMatchInlineSnapshot(`
         [
           "SELECT author_ids.ids AS ids, coalesce((SELECT empty_ids.ids AS value FROM ((SELECT array_agg(a1.id) AS ids FROM authors AS a1 WHERE a1.id = $1 AND a1.deleted_at IS NULL) UNION (SELECT array_agg(b1.author_id) AS ids FROM books AS b1 WHERE b1.id = $2 AND b1.deleted_at IS NULL)) AS empty_ids), $3) AS fallback FROM ((SELECT array_agg(a.id) AS ids FROM authors AS a WHERE a.deleted_at IS NULL) UNION (SELECT array_agg(b.author_id) AS ids FROM books AS b WHERE b.deleted_at IS NULL)) AS author_ids",
         ]
        `);
        expect(execute.mock.calls[0][2]).toEqual([9, 9, [9]]);
      } finally {
        execute.mockRestore();
      }
    });
  });

  describe("runtime validation", () => {
    describe.each(["union", "unionAll", "intersect", "intersectAll", "except", "exceptAll"] as const)(
      "%s",
      (operation) => {
        it.each([0, 1])("rejects %i operands at construction and execution", async (length) => {
          // Given an Author alias for an otherwise valid read operand
          const a = table(Author);
          // And an EntityManager to check the untyped execution boundary
          const em = newEntityManager();
          // And an invalid operand list containing fewer than two reads
          const invalid = { [operation]: [{ from: a, select: { id: a.id } }].slice(0, length) };
          // And recording isolated to detect any SQL sent before validation
          resetQueryCount();
          // When constructing and executing the undersized compound
          // Then both entry points reject it without querying PostgreSQL
          expect(() => query(invalid as any)).toThrow();
          await expect(em.query(invalid as any)).rejects.toThrow();
          expect(queries).toEqual([]);
        });

        it.each(["Author first", "Book first"] as const)(
          "rejects mixed Author/Book id domains with %s",
          async (order) => {
            // Given Author and Book aliases whose primary keys share int4 storage but not an id domain
            const [a, b] = tables(Author, Book);
            // And an EntityManager for untyped runtime validation
            const em = newEntityManager();
            // And a primary-key branch in the Author-id domain
            const author = { from: a, select: { id: a.id } };
            // And a primary-key branch in the incompatible Book-id domain
            const book = { from: b, select: { id: b.id } };
            // And an invalid compound in the requested operand order
            const invalid = { [operation]: order === "Author first" ? [author, book] : [book, author] };
            // And recording isolated to prove this is compiler validation, not a database error
            resetQueryCount();
            // When constructing and executing incompatible id domains
            // Then every operator rejects them, including operations whose result type retains the left row
            expect(() => query(invalid as any)).toThrow();
            await expect(em.query(invalid as any)).rejects.toThrow();
            expect(queries).toEqual([]);
          },
        );

        it.each(["age first", "sum first"] as const)("rejects int4 age versus int8 SUM with %s", async (order) => {
          // Given an Author alias whose age column and sum have different physical numeric representations
          const a = table(Author);
          // And an EntityManager for untyped runtime validation
          const em = newEntityManager();
          // And a number-valued int4 age column
          const age = { from: a, select: { age: a.age } };
          // And a number-valued SUM whose int8 representation cannot be inferred from its TypeScript type
          const sum = { from: a, select: { age: a.age.sum() } };
          // And an invalid compound in the requested operand order
          const invalid = { [operation]: order === "age first" ? [age, sum] : [sum, age] };
          // And recording isolated from any database work
          resetQueryCount();
          // When constructing and executing the numeric promotion case
          // Then conservative codec validation rejects both decoder orders before SQL
          expect(() => query(invalid as any)).toThrow();
          await expect(em.query(invalid as any)).rejects.toThrow();
          expect(queries).toEqual([]);
        });
      },
    );

    it.each([undefined, null, false])("rejects a %p first EXCEPT operand instead of omitting it", async (operand) => {
      // Given an Author alias for the two valid later branches
      const a = table(Author);
      // And an EntityManager for untyped execution
      const em = newEntityManager();
      // And an invalid first operand whose omission would change which rows EXCEPT subtracts from
      const invalid = { except: [operand, { from: a, select: { id: a.id } }, { from: a, select: { id: a.id } }] };
      // And recording isolated from any SQL
      resetQueryCount();
      // When passing an optional-value sentinel where a read operand is required
      // Then construction and execution reject it instead of pruning the first branch
      expect(() => query(invalid as any)).toThrow();
      await expect(em.query(invalid as any)).rejects.toThrow();
      expect(queries).toEqual([]);
    });

    it.each([undefined, null, false])("rejects a %p later UNION operand instead of omitting it", async (operand) => {
      // Given an Author alias for two valid initial branches
      const a = table(Author);
      // And an EntityManager for untyped execution
      const em = newEntityManager();
      // And an invalid third operand even though the first two already satisfy minimum arity
      const invalid = { union: [{ from: a, select: { id: a.id } }, { from: a, select: { id: a.id } }, operand] };
      // And recording isolated from any SQL
      resetQueryCount();
      // When an optional-value sentinel reaches a later operand position
      // Then validation checks every operand rather than stopping after the required pair
      expect(() => query(invalid as any)).toThrow();
      await expect(em.query(invalid as any)).rejects.toThrow();
      expect(queries).toEqual([]);
    });

    it.each([undefined, null, false, {}])("rejects a non-array operation value of %p", async (operands) => {
      // Given an EntityManager for untyped set-shape validation
      const em = newEntityManager();
      // And a root operation whose value is not an operand array
      const invalid = { union: operands };
      // And recording isolated from any SQL
      resetQueryCount();
      // When constructing and executing the malformed set root
      // Then the operation is not mistaken for an ordinary read or an omitted clause
      expect(() => query(invalid as any)).toThrow();
      await expect(em.query(invalid as any)).rejects.toThrow();
      expect(queries).toEqual([]);
    });

    it("rejects multiple root operation keys", async () => {
      // Given an Author alias for valid operand shapes
      const a = table(Author);
      // And an EntityManager for untyped execution
      const em = newEntityManager();
      // And a valid pair of read operands
      const operands = [
        { from: a, select: { id: a.id } },
        { from: a, select: { id: a.id } },
      ];
      // And a root claiming both UNION and EXCEPT instead of exactly one operation
      const invalid = { union: operands, except: operands };
      // And recording isolated from SQL
      resetQueryCount();
      // When constructing and executing the ambiguous root
      // Then neither operation silently wins by property insertion order
      expect(() => query(invalid as any)).toThrow();
      await expect(em.query(invalid as any)).rejects.toThrow();
      expect(queries).toEqual([]);
    });

    it.each(["from", "select", "join", "where", "groupBy", "having", "distinct", "softDeletes", "pruneJoins"] as const)(
      "rejects compound-level %s instead of applying it to a branch",
      async (clause) => {
        // Given an Author alias for valid ordinary branch clauses
        const a = table(Author);
        // And an EntityManager for untyped execution
        const em = newEntityManager();
        // And ordinary SELECT clauses that are illegal on a compound root
        const clauses = {
          from: a,
          select: { id: a.id },
          join: [],
          where: a.age.gt(20),
          groupBy: [a.id],
          having: a.id.count().gt(0),
          distinct: true,
          softDeletes: "include",
          pruneJoins: false,
        };
        // And an otherwise valid compound carrying one illegal root clause
        const invalid = {
          union: [
            { from: a, select: { id: a.id } },
            { from: a, select: { id: a.id } },
          ],
          [clause]: clauses[clause],
        };
        // And recording isolated from any SQL
        resetQueryCount();
        // When constructing and executing a compound with an ordinary branch clause at the root
        // Then both entry points reject it instead of guessing the clause's scope
        expect(() => query(invalid as any)).toThrow();
        await expect(em.query(invalid as any)).rejects.toThrow();
        expect(queries).toEqual([]);
      },
    );

    it.each(["missing", "extra"] as const)("rejects a later POJO projection with %s keys", async (shape) => {
      // Given an Author alias for known compatible field codecs
      const a = table(Author);
      // And an EntityManager for untyped projection validation
      const em = newEntityManager();
      // And a later branch whose key set differs from the first branch's name/age contract
      const select = shape === "missing" ? { name: a.first_name } : { name: a.first_name, age: a.age, id: a.id };
      // And an invalid compound whose first branch defines the name/age contract
      const invalid = {
        union: [
          { from: a, select: { name: a.first_name, age: a.age } },
          { from: a, select },
        ],
      };
      // And recording isolated from SQL
      resetQueryCount();
      // When mismatched POJO keys cross an untyped boundary
      // Then neither missing nor extra keys can silently alter positional SQL output
      expect(() => query(invalid as any)).toThrow();
      await expect(em.query(invalid as any)).rejects.toThrow();
      expect(queries).toEqual([]);
    });

    it("rejects different keys hidden inside reusable query values", async () => {
      // Given an Author alias for independently valid named projections
      const a = table(Author);
      // And an EntityManager for untyped execution
      const em = newEntityManager();
      // And a reusable branch exposing name rather than title
      const names = query({ from: a, select: { name: a.first_name } });
      // And another reusable branch with the same codec but a different output key
      const titles = query({ from: a, select: { title: a.first_name } });
      // And recording isolated from SQL
      resetQueryCount();
      // When reusable values with unequal key sets become set operands
      // Then the query wrappers do not bypass output-shape validation
      expect(() => query({ union: [names, titles] } as any)).toThrow();
      await expect(em.query({ union: [names, titles] } as any)).rejects.toThrow();
      expect(queries).toEqual([]);
    });

    describe.each(["inline", "query value"] as const)("%s scalar operands", (form) => {
      it.each(["left", "right", "both"] as const)("rejects scalar operands on %s sides", async (side) => {
        // Given an Author alias with a known id codec shared by both row shapes
        const a = table(Author);
        // And an EntityManager for untyped execution
        const em = newEntityManager();
        // And a scalar read that is valid outside a set operation
        const scalar = form === "inline" ? { from: a, select: a.id } : query({ from: a, select: a.id });
        // And a valid POJO partner with the same id codec
        const pojo = { from: a, select: { value: a.id } };
        // And scalar reads on one or both sides, not just incompatible mixed row shapes
        const invalid = { union: [side === "right" ? pojo : scalar, side === "left" ? pojo : scalar] };
        // And recording isolated from SQL
        resetQueryCount();
        // When scalar operands cross either public boundary
        // Then even two matching scalar reads are rejected before SQL
        expect(() => query(invalid as any)).toThrow(
          "Set operations require POJO operands; wrap scalar expressions in a named select projection",
        );
        await expect(em.query(invalid as any)).rejects.toThrow(
          "Set operations require POJO operands; wrap scalar expressions in a named select projection",
        );
        expect(queries).toEqual([]);
      });

      it.each(["left", "right", "both"] as const)("rejects nested scalar operands on %s sides", async (side) => {
        // Given an Author alias with a known id codec for the nested projection
        const a = table(Author);
        // And an EntityManager for recursive runtime validation
        const em = newEntityManager();
        // And a scalar read that must remain invalid inside a nested set operation
        const scalar = form === "inline" ? { from: a, select: a.id } : query({ from: a, select: a.id });
        // And a valid POJO partner for both the outer and nested set operations
        const pojo = { from: a, select: { value: a.id } };
        // And a non-first nested operand containing one or two scalar reads
        const invalid = {
          union: [pojo, { except: [side === "right" ? pojo : scalar, side === "left" ? pojo : scalar] }],
        };
        // And recording isolated from SQL
        resetQueryCount();
        // When validation descends past the valid first POJO operand
        // Then nested scalar reads report the POJO requirement, not a codec or key mismatch
        expect(() => query(invalid as any)).toThrow(
          "Set operations require POJO operands; wrap scalar expressions in a named select projection",
        );
        await expect(em.query(invalid as any)).rejects.toThrow(
          "Set operations require POJO operands; wrap scalar expressions in a named select projection",
        );
        expect(queries).toEqual([]);
      });
    });

    it.each(["inline", "query value"] as const)("rejects %s entity-mode operands", async (form) => {
      // Given an Author alias whose bare select requests entity hydration
      const a = table(Author);
      // And an EntityManager for untyped execution
      const em = newEntityManager();
      // And an entity-mode operand rather than a POJO read
      const entity = form === "inline" ? { from: a, select: a } : query({ from: a, select: a });
      // And recording isolated from SQL
      resetQueryCount();
      // When entity-mode reads become UNION operands
      // Then identity-map hydration is not mistaken for set-row decoding
      expect(() => query({ union: [entity, entity] } as any)).toThrow(
        "Set operations do not support entity-mode operands",
      );
      await expect(em.query({ union: [entity, entity] } as any)).rejects.toThrow(
        "Set operations do not support entity-mode operands",
      );
      expect(queries).toEqual([]);
    });

    it("rejects CTI entity-mode operands with expanded physical columns", async () => {
      // Given a Publisher alias whose entity projection spans its CTI hierarchy
      const p = table(Publisher);
      // And an EntityManager for untyped execution
      const em = newEntityManager();
      // And a reusable CTI entity query, valid only as an ordinary entity read
      const publishers = query({ from: p, select: p });
      // And recording isolated from SQL
      resetQueryCount();
      // When CTI entity values become set operands
      // Then hidden hydration columns are not used as a set projection schema
      expect(() => query({ union: [publishers, publishers] } as any)).toThrow(
        "Set operations do not support entity-mode operands",
      );
      await expect(em.query({ union: [publishers, publishers] } as any)).rejects.toThrow(
        "Set operations do not support entity-mode operands",
      );
      expect(queries).toEqual([]);
    });

    it("rejects ordinary Expr values as operands even when their codecs are known", async () => {
      // Given an Author alias with an ordinary scalar field expression, not a scalar query value
      const a = table(Author);
      // And an EntityManager for untyped execution
      const em = newEntityManager();
      // And recording isolated from SQL
      resetQueryCount();
      // When a field Expr is supplied where a read query is required
      // Then the Expr protocol alone does not supply opaque query identity
      expect(() => query({ union: [a.id, { from: a, select: { id: a.id } }] } as any)).toThrow();
      await expect(em.query({ union: [a.id, { from: a, select: { id: a.id } }] } as any)).rejects.toThrow();
      expect(queries).toEqual([]);
    });

    it("rejects direct execution of an arbitrary Expr", async () => {
      // Given an Author alias whose id is not a scalar query value
      const a = table(Author);
      // And an EntityManager for direct untyped execution
      const em = newEntityManager();
      // And recording isolated from SQL
      resetQueryCount();
      // When passing an ordinary Expr directly to em.query
      // Then an expression without a read source is not executable
      await expect(em.query(a.id as any)).rejects.toThrow();
      expect(queries).toEqual([]);
    });

    it("rejects raw sql outputs even when both branches reuse the exact same expression", async () => {
      // Given an Author alias for an otherwise ordinary read
      const a = table(Author);
      // And an EntityManager for untyped codec validation
      const em = newEntityManager();
      // And one raw expression whose number annotation does not declare a runtime codec
      const age = sql<number>`${a.age}`;
      // And two branches sharing that exact expression instance
      const invalid = {
        union: [
          { from: a, select: { age } },
          { from: a, select: { age } },
        ],
      };
      // And recording isolated from SQL
      resetQueryCount();
      // When unknown raw outputs are combined
      // Then identical expression identity does not imply a known SQL type or logical domain
      expect(() => query(invalid as any)).toThrow();
      await expect(em.query(invalid as any)).rejects.toThrow();
      expect(queries).toEqual([]);
    });

    it("rejects raw NULL-only operands instead of inferring a precise codec from sql generics", async () => {
      // Given an Author alias for raw NULL projections
      const a = table(Author);
      // And an EntityManager for untyped validation
      const em = newEntityManager();
      // And raw NULL expressions with type annotations but no declared physical or logical domains
      const invalid = {
        union: [
          { from: a, select: { value: sql<null>`NULL` } },
          { from: a, select: { value: sql<number | null>`NULL::integer` } },
        ],
      };
      // And recording isolated from SQL
      resetQueryCount();
      // When NULL-only raw branches reach the set boundary
      // Then an escape-hatch generic cannot supply the missing codec information
      expect(() => query(invalid as any)).toThrow(
        "Set column 'value' has an unknown or unsupported output codec; sql<R> does not declare a SQL type or codec",
      );
      await expect(em.query(invalid as any)).rejects.toThrow(
        "Set column 'value' has an unknown or unsupported output codec; sql<R> does not declare a SQL type or codec",
      );
      expect(queries).toEqual([]);
    });

    it("rejects incompatible codecs inside a non-first nested compound", async () => {
      // Given Author and Book aliases with different id domains
      const [a, b] = tables(Author, Book);
      // And an EntityManager for recursive runtime validation
      const em = newEntityManager();
      // And a valid first branch followed by a nested branch that mixes Author and Book ids
      const invalid = {
        union: [
          { from: a, select: { id: a.id } },
          {
            except: [
              { from: a, select: { id: a.id } },
              { from: b, select: { id: b.id } },
            ],
          },
        ],
      };
      // And recording isolated from SQL
      resetQueryCount();
      // When the outer compound is constructed or executed
      // Then validation descends into every nested operand rather than trusting the first output
      expect(() => query(invalid as any)).toThrow();
      await expect(em.query(invalid as any)).rejects.toThrow();
      expect(queries).toEqual([]);
    });

    it("rejects physical enum arrays even when both operands use the same field", async () => {
      // Given an Author alias whose favoriteColors is a physical array of enum ids
      const a = table(Author);
      // And an EntityManager for conservative array validation
      const em = newEntityManager();
      // And matching expressions whose physical array codec is deliberately unsupported
      const invalid = {
        union: [
          { from: a, select: { colors: a.favorite_colors } },
          { from: a, select: { colors: a.favorite_colors } },
        ],
      };
      // And recording isolated from SQL
      resetQueryCount();
      // When physical enum arrays become set outputs
      // Then matching expression identity does not bypass the unsupported array policy
      expect(() => query(invalid as any)).toThrow();
      await expect(em.query(invalid as any)).rejects.toThrow();
      expect(queries).toEqual([]);
    });

    it("rejects different schema JSON domains even with identical JSONB storage", async () => {
      // Given an Author alias with Superstruct address and Zod businessAddress codecs
      const a = table(Author);
      // And an EntityManager for codec-domain validation
      const em = newEntityManager();
      // And equal output keys whose JSONB representations have different schema validators
      const invalid = {
        union: [
          { from: a, select: { address: a.address } },
          { from: a, select: { address: a.business_address } },
        ],
      };
      // And recording isolated from SQL
      resetQueryCount();
      // When physically equal types do not establish the same logical domain
      // Then the first schema is not silently chosen to decode the other schema's values
      expect(() => query(invalid as any)).toThrow();
      await expect(em.query(invalid as any)).rejects.toThrow();
      expect(queries).toEqual([]);
    });

    it("rejects custom passwords mixed with primitive varchar values", async () => {
      // Given a User alias whose name and password use varchar with different logical domains
      const u = table(User);
      // And an EntityManager for untyped codec validation
      const em = newEntityManager();
      // And a custom PasswordValue projection mixed with an ordinary string projection
      const invalid = {
        union: [
          { from: u, select: { value: u.password } },
          { from: u, select: { value: u.name } },
        ],
      };
      // And recording isolated from SQL
      resetQueryCount();
      // When equal storage types conceal different encoders and decoders
      // Then primitive strings cannot be decoded as custom passwords
      expect(() => query(invalid as any)).toThrow();
      await expect(em.query(invalid as any)).rejects.toThrow();
      expect(queries).toEqual([]);
    });

    it("rejects scalar enums mixed with primitive integers", async () => {
      // Given an Author alias whose BookRange ids and ages use int4 with different domains
      const a = table(Author);
      // And an EntityManager for runtime codec validation
      const em = newEntityManager();
      // And an enum projection mixed with a numeric projection under the same key
      const invalid = {
        union: [
          { from: a, select: { value: a.range_of_books } },
          { from: a, select: { value: a.age } },
        ],
      };
      // And recording isolated from SQL
      resetQueryCount();
      // When physical integer equality does not imply logical equality
      // Then age values are not decoded as BookRange codes
      expect(() => query(invalid as any)).toThrow();
      await expect(em.query(invalid as any)).rejects.toThrow();
      expect(queries).toEqual([]);
    });

    it.each(["missing key", "branch column", "expression", "invalid direction"] as const)(
      "rejects compound ordering by %s",
      async (kind) => {
        // Given an Author alias exposing only name in each branch
        const a = table(Author);
        // And an EntityManager for untyped ordering validation
        const em = newEntityManager();
        // And invalid sorts that either leave the output-key scope or contain SQL punctuation
        const sorts = {
          "missing key": { age: "ASC" },
          "branch column": [{ asc: a.first_name }],
          expression: [{ asc: sql<string>`lower(${a.first_name})` }],
          "invalid direction": { name: "ASC; DROP TABLE authors" },
        };
        // And a compound with one of those invalid root orderings
        const invalid = {
          union: [
            { from: a, select: { name: a.first_name } },
            { from: a, select: { name: a.first_name } },
          ],
          orderBy: sorts[kind],
        };
        // And recording isolated from SQL
        resetQueryCount();
        // When validating compound ordering at construction and execution
        // Then only output-key hashes with valid directions are accepted
        expect(() => query(invalid as any)).toThrow();
        await expect(em.query(invalid as any)).rejects.toThrow();
        expect(queries).toEqual([]);
      },
    );

    it("rejects sibling alias leakage", async () => {
      // Given separate Author and Book aliases, neither an enclosing source for the other
      const [a, b] = tables(Author, Book);
      // And an EntityManager for execution-time alias scope validation
      const em = newEntityManager();
      // And a second branch illegally referencing the first branch's Author alias
      const invalid = {
        union: [
          { from: a, select: { name: a.first_name } },
          { from: b, where: b.author_id.eq(a.id), select: { name: b.title } },
        ],
      };
      // And recording isolated from SQL
      resetQueryCount();
      // When sibling operands are parsed in independent scopes
      // Then the first branch's alias is not available as an outer correlation in the second
      await expect(em.query(invalid as any)).rejects.toThrow();
      expect(queries).toEqual([]);
    });

    it("does not implicitly make a correlated derived compound LATERAL", async () => {
      // Given an Author that would match a correlated Book lookup if LATERAL were supported
      await insertAuthor({ first_name: "a1" });
      // And a Book for that Author
      await insertBook({ title: "b1", author_id: 1 });
      // And an EntityManager for the ordinary derived-table join
      const em = newEntityManager();
      // And aliases for the outer Author and inner Book branches
      const [a, b] = tables(Author, Book);
      // And a compound whose second branch references the outer Author from a derived-table source
      const books = query({
        union: [
          { from: b, where: b.title.eq("absent"), select: { authorId: b.author_id } },
          { from: b, where: b.author_id.eq(a.id), select: { authorId: b.author_id } },
        ],
        as: "books",
      });
      // When the correlated compound is joined as an ordinary derived table, not a scalar or IN query
      const result = em.query({
        from: a,
        join: [{ inner: books, on: books.authorId.eq(a.id) }],
        select: { id: books.authorId },
      } as any);
      // Then set composition does not silently add LATERAL and change the existing source-scope rules
      await expect(result).rejects.toThrow();
    });

    it("rejects polymorphic IN compounds with a non-id domain", () => {
      // Given Comment and Author aliases for a polymorphic parent predicate
      const [c, a] = tables(Comment, Author);
      // And a valid POJO compound of Author names rather than Author ids
      const names = query({
        union: [
          { from: a, select: { name: a.first_name } },
          { from: a, select: { name: a.first_name } },
        ],
        as: "author_names",
      });
      // When an ordinary scalar projection is supplied as an untyped polymorphic parent target
      // Then condition construction cannot choose a parent component from a string codec
      expect(() => c.parent.in(query({ from: names, select: names.name }) as any)).toThrow(
        "parent is polymorphic, so `in` needs a subquery selecting an id or FK column",
      );
    });

    it("rejects polymorphic IN compounds with an unsupported id target", () => {
      // Given Comment and Tag aliases, where Tag is not a Comment parent component
      const [c, t] = tables(Comment, Tag);
      // And a compatible Tag-id POJO compound that still cannot identify a Comment parent component
      const ids = query({
        union: [
          { from: t, select: { id: t.id } },
          { from: t, select: { id: t.id } },
        ],
        as: "tag_ids",
      });
      // When those ids cross an untyped Comment parent predicate boundary
      // Then known id metadata is insufficient unless that target is a supported parent component
      expect(() => c.parent.in(query({ from: ids, select: ids.id }) as any)).toThrow("parent has no component for Tag");
    });

    it("rejects mutation-shaped operands instead of treating RETURNING as a read", async () => {
      // Given an Author alias for a read and a mutation-shaped object
      const a = table(Author);
      // And an EntityManager for the untyped read boundary
      const em = newEntityManager();
      // And a DELETE-shaped operand whose RETURNING projection does not make it an inline read
      const invalid = {
        union: [
          { from: a, select: { id: a.id } },
          { delete: a, where: a.id.eq("a:1"), returning: { id: a.id } },
        ],
      };
      // And recording isolated to ensure no mutation reaches PostgreSQL
      resetQueryCount();
      // When constructing and executing a compound containing a statement rather than a read
      // Then this read-only API rejects the statement without executing SQL
      expect(() => query(invalid as any)).toThrow();
      await expect(em.query(invalid as any)).rejects.toThrow();
      expect(queries).toEqual([]);
    });
  });

  describe("physical codec boundaries without SQL", () => {
    it.each([
      { canonical: "int4", spelling: "integer" },
      { canonical: "varchar", spelling: "character varying" },
      { canonical: "varchar[]", spelling: "character varying[]" },
    ])("canonicalizes known primitive $spelling outputs", (testCase) => {
      // Given a primitive column using PostgreSQL's canonical type spelling
      const left = new PrimitiveSerde("left", "left", testCase.canonical, testCase.canonical.endsWith("[]"));
      // And an independent column using an equivalent physical type spelling
      const right = new PrimitiveSerde("right", "right", testCase.spelling, testCase.spelling.endsWith("[]"));
      // When inspecting the native compatibility metadata
      // Then canonical physical types and logical domains agree without serde identity
      expect(left.outputType).toBeDefined();
      expect(left.outputType?.dbType).toBe(testCase.canonical);
      expect(right.outputType).toEqual(left.outputType);
    });

    it.each([
      { name: "PlainDate", serde: PlainDateSerde, dbType: "date" },
      { name: "PlainTime", serde: PlainTimeSerde, dbType: "time" },
      { name: "PlainDateTime", serde: PlainDateTimeSerde, dbType: "timestamp" },
      { name: "ZonedDateTime", serde: ZonedDateTimeSerde, dbType: "timestamptz" },
    ])("recognizes matching scalar Temporal $name domains", (testCase) => {
      // Given a Temporal scalar column codec without changing the integration schema's Date configuration
      const left = new testCase.serde("left", "left", testCase.dbType);
      // And an independent scalar column using the same Temporal mapper and physical type
      const right = new testCase.serde("right", "right", testCase.dbType);
      // And a Date codec with the same physical representation but a different logical domain
      const date = new DateSerde("date", "date", testCase.dbType);
      // When inspecting the native codec metadata used by set validation
      // Then matching Temporal columns agree but are not interchangeable with Date columns
      expect(left.outputType).toBeDefined();
      expect(right.outputType).toEqual(left.outputType);
      expect(left.outputType?.domain).not.toBe(date.outputType?.domain);
    });
  });

  describe("scope and branch policies", () => {
    it.each(["ordinary", "compound"] as const)("snapshots a condition reused in outer and %s scopes", async (kind) => {
      // Given an Author whose name passes the shared predicate
      await insertAuthor({ first_name: "Alice" });
      // And an Author excluded by that predicate in every scope
      await insertAuthor({ first_name: "absent" });
      // And an EntityManager for the correlated read
      const em = newEntityManager();
      // And an Author alias reused in outer and nested source scopes
      const a = table(Author);
      // And one condition object shared by all occurrences, not a new condition per scope
      const shared = a.first_name.ne("absent");
      // And a POJO branch that resolves that condition under its own Author alias
      const branch = { from: a, where: shared, select: { id: a.id } };
      // And either the ordinary subquery or a compound containing two copies of that branch
      const ids =
        kind === "ordinary"
          ? query({ ...branch, as: "author_ids" })
          : query({ union: [branch, branch], as: "author_ids" });
      // And recording isolated from the Author inserts
      resetQueryCount();
      // When the outer predicate resolves before the nested query resolves the same condition
      const rows = await em.query({
        from: a,
        where: { and: [shared, a.id.in(query({ from: ids, select: ids.id }))] },
        select: { name: a.first_name },
      });
      // Then each occurrence uses its local alias and the outer condition is not overwritten
      expect(rows).toEqual([{ name: "Alice" }]);
      // Each source shape needs its own snapshot site for Jest to record the different SQL statements.
      if (kind === "ordinary") {
        expect(queries).toMatchInlineSnapshot(`
         [
           "SELECT a.first_name AS name FROM authors AS a WHERE (a.first_name != $1 AND a.id IN (SELECT author_ids.id AS value FROM (SELECT a1.id AS id FROM authors AS a1 WHERE a1.first_name != $2 AND a1.deleted_at IS NULL) AS author_ids)) AND a.deleted_at IS NULL",
         ]
        `);
      } else {
        expect(queries).toMatchInlineSnapshot(`
         [
           "SELECT a.first_name AS name FROM authors AS a WHERE (a.first_name != $1 AND a.id IN (SELECT author_ids.id AS value FROM ((SELECT a1.id AS id FROM authors AS a1 WHERE a1.first_name != $2 AND a1.deleted_at IS NULL) UNION (SELECT a2.id AS id FROM authors AS a2 WHERE a2.first_name != $3 AND a2.deleted_at IS NULL)) AS author_ids)) AND a.deleted_at IS NULL",
         ]
        `);
      }
    });

    it("preserves branch GROUP BY and HAVING filters", async () => {
      // Given three Authors with different Book counts
      await insertAuthor({ first_name: "two books" });
      await insertAuthor({ first_name: "one book" });
      await insertAuthor({ first_name: "no books" });
      // And two Books for a1, meeting the first branch's HAVING threshold
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      // And one Book for a2, meeting neither branch's HAVING condition
      await insertBook({ title: "b3", author_id: 2 });
      // And an EntityManager for the aggregate compound
      const em = newEntityManager();
      // And Author and Book aliases local to their branch scopes
      const [a, b] = tables(Author, Book);
      // And recording isolated from the fixtures
      resetQueryCount();
      // When combining prolific Authors with Authors whose left-joined Book count is zero
      const rows = await em.query({
        unionAll: [
          {
            from: b,
            groupBy: [b.author_id],
            having: b.id.count().gt(1),
            select: { id: b.author_id, count: b.id.count() },
          },
          {
            from: a,
            join: [a.books.as(b)],
            groupBy: [a.id],
            having: b.id.count().eq(0),
            select: { id: a.id, count: b.id.count() },
          },
        ],
        orderBy: { id: "ASC" },
      });
      // Then each branch applies HAVING after its own grouping instead of filtering the combined rows
      expect(rows).toEqual([
        { id: "a:1", count: 2 },
        { id: "a:3", count: 0 },
      ]);
      expect(queries).toHaveLength(1);
      expect(queries).toMatchInlineSnapshot(`
       [
         "(SELECT b.author_id AS id, count(b.id)::int AS "count" FROM books AS b WHERE b.deleted_at IS NULL GROUP BY b.author_id HAVING count(b.id)::int > $1) UNION ALL (SELECT a.id AS id, count(b1.id)::int AS "count" FROM authors AS a LEFT OUTER JOIN books AS b1 ON b1.author_id = a.id AND b1.deleted_at IS NULL WHERE a.deleted_at IS NULL GROUP BY a.id HAVING count(b1.id)::int = $2) ORDER BY id ASC",
       ]
      `);
    });

    it("keeps an outer Book join referenced only by the non-first POJO branch", async () => {
      // Given Author a1 for the outer Book join
      await insertAuthor({ first_name: "a1" });
      // And Author a2 with no Books, so the retained join must preserve its NULL row
      await insertAuthor({ first_name: "a2" });
      // And one Book for a1 as the outer join's only matching row
      await insertBook({ title: "b1", author_id: 1 });
      // And a Comment on that Book, not on its Author
      await insertComment({ text: "on b1", parent_book_id: 1 });
      // And an EntityManager for the correlated outer query
      const em = newEntityManager();
      // And aliases for the outer Author/Book and inner Comment
      const [a, b, c] = tables(Author, Book, Comment);
      // And a POJO compound with a correlation only in its second branch
      const ids = query({
        union: [
          { from: c, where: c.text.eq("absent"), select: { id: c.id } },
          { from: c, where: c.parent.eq(b.id), select: { id: c.id } },
        ],
        as: "comment_ids",
      });
      // And recording isolated from the fixtures
      resetQueryCount();
      // When the Book alias has no outer use except through the scalar projection of the second POJO branch
      const rows = await em.query({
        from: a,
        join: [a.books.as(b)],
        select: { name: a.first_name, comment: query({ from: ids, select: ids.id }) },
        orderBy: { name: "ASC" },
      });
      // Then the join survives pruning and the unmatched Author receives SQL NULL
      expect(rows).toEqual([
        { name: "a1", comment: "comment:1" },
        { name: "a2", comment: null },
      ]);
      expect(queries).toHaveLength(1);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.first_name AS name, (SELECT comment_ids.id AS value FROM ((SELECT c.id AS id FROM comments AS c WHERE c.text = $1) UNION (SELECT c1.id AS id FROM comments AS c1 WHERE c1.parent_book_id = b.id)) AS comment_ids) AS comment FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE a.deleted_at IS NULL ORDER BY name ASC",
       ]
      `);
    });

    it("re-renders a reused POJO compound, scalar projection, and condition with fresh aliases", async () => {
      // Given an Author with one Book for both uses of the correlation
      await insertAuthor({ first_name: "a1" });
      // And that Author's Book, selected by the reusable scalar
      await insertBook({ title: "b1", author_id: 1 });
      // And an EntityManager for independent parse contexts
      const em = newEntityManager();
      // And outer Author and inner Book aliases
      const [a, b] = tables(Author, Book);
      // And a reusable cross-column condition tied to alias handles rather than SQL alias strings
      const author = b.author_id.eq(a.id);
      // And a reusable compound containing that condition
      const ids = query({
        union: [
          { from: b, where: author, select: { id: b.id } },
          { from: b, where: b.title.eq("absent"), select: { id: b.id } },
        ],
        as: "book_ids",
      });
      // And an ordinary scalar projection reused in both outer query contexts
      const book = query({ from: ids, select: ids.id });
      // And a different Book alias that will occupy the outer scope only in the second parse
      const outerBook = table(Book, "outer_book");
      // And recording isolated for the first parse
      resetQueryCount();
      // When executing without an outer Book join
      const first = await em.query({ from: a, select: { book } });
      // Then the scalar resolves the inner Book and outer Author
      expect(first).toEqual([{ book: "b:1" }]);
      expect(queries).toHaveLength(1);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT (SELECT book_ids.id AS value FROM ((SELECT b.id AS id FROM books AS b WHERE b.author_id = a.id AND b.deleted_at IS NULL) UNION (SELECT b1.id AS id FROM books AS b1 WHERE b1.title = $1 AND b1.deleted_at IS NULL)) AS book_ids) AS book FROM authors AS a WHERE a.deleted_at IS NULL",
       ]
      `);
      // And recording isolated for the parse that must assign a different inner Book alias
      resetQueryCount();
      // When a retained outer Book join occupies the first Book SQL alias
      const second = await em.query({
        from: a,
        join: [a.books.as(outerBook)],
        where: outerBook.title.eq("b1"),
        select: { book },
      });
      // Then the reused compound and condition resolve afresh rather than reading the outer Book accidentally
      expect(second).toEqual([{ book: "b:1" }]);
      expect(queries).toHaveLength(1);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT (SELECT book_ids.id AS value FROM ((SELECT b1.id AS id FROM books AS b1 WHERE b1.author_id = a.id AND b1.deleted_at IS NULL) UNION (SELECT b2.id AS id FROM books AS b2 WHERE b2.title = $1 AND b2.deleted_at IS NULL)) AS book_ids) AS book FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE b.title = $2 AND a.deleted_at IS NULL",
       ]
      `);
    });

    it("preserves independent branch soft-delete and join-pruning policies", async () => {
      // Given a live Author with no Books, retained only by the pruned branch
      await insertAuthor({ first_name: "no books" });
      // And a second live Author with a matching Book
      await insertAuthor({ first_name: "with book" });
      // And a soft-deleted Author available only to the include branch
      await insertAuthor({ first_name: "deleted", deleted_at: new Date("2020-01-01T00:00:00Z") });
      // And Books for the live and deleted Authors
      await insertBook({ title: "live book", author_id: 2 });
      await insertBook({ title: "deleted author's book", author_id: 3 });
      // And an EntityManager for branch-local policies
      const em = newEntityManager();
      // And aliases for the Author source and potentially unused Book join
      const [a, b] = tables(Author, Book);
      // And recording isolated from setup
      resetQueryCount();
      // When one branch prunes its unused join and the other retains it and includes soft-deleted Authors
      const rows = await em.query({
        unionAll: [
          { from: a, join: [a.books.inner(b)], select: { name: a.first_name } },
          {
            from: a,
            join: [a.books.inner(b)],
            select: { name: a.first_name },
            pruneJoins: false,
            softDeletes: "include",
          },
        ],
        orderBy: { name: "ASC" },
      });
      // Then the retained branch excludes the Book-less Author but includes the deleted Author
      expect(rows).toEqual([{ name: "deleted" }, { name: "no books" }, { name: "with book" }, { name: "with book" }]);
      expect(queries).toHaveLength(1);
      expect(queries).toMatchInlineSnapshot(`
       [
         "(SELECT a.first_name AS name FROM authors AS a WHERE a.deleted_at IS NULL) UNION ALL (SELECT a1.first_name AS name FROM authors AS a1 JOIN books AS b1 ON b1.author_id = a1.id) ORDER BY name ASC",
       ]
      `);
    });

    it("preserves branch-local soft-delete filters on left joins", async () => {
      // Given an Author whose only Book is soft-deleted
      await insertAuthor({ first_name: "a1" });
      // And that deleted Book, excluded from only the default branch's join
      await insertBook({ title: "deleted book", author_id: 1, deleted_at: new Date("2020-01-01T00:00:00Z") });
      // And an EntityManager for the two join policies
      const em = newEntityManager();
      // And Author and Book aliases reused in sibling scopes
      const [a, b] = tables(Author, Book);
      // And recording isolated from fixtures
      resetQueryCount();
      // When one branch excludes deleted join rows and the other includes them
      const rows = await em.query({
        union: [
          { from: a, join: [a.books.as(b)], select: { title: b.title } },
          { from: a, join: [a.books.as(b)], select: { title: b.title }, softDeletes: "include" },
        ],
        orderBy: { title: "ASC NULLS LAST" },
      });
      // Then the default left join still returns its Author row with a NULL title
      expect(rows).toEqual([{ title: "deleted book" }, { title: null }]);
      expect(queries).toHaveLength(1);
      expect(queries).toMatchInlineSnapshot(`
       [
         "(SELECT b.title AS title FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE a.deleted_at IS NULL) UNION (SELECT b1.title AS title FROM authors AS a1 LEFT OUTER JOIN books AS b1 ON b1.author_id = a1.id) ORDER BY title ASC NULLS LAST",
       ]
      `);
    });

    it("preserves STI discriminator filters in each branch", async () => {
      // Given a TaskNew row with its own duration
      await insertTask({ type: "NEW", duration_in_days: 10 });
      // And a TaskOld row in the same physical table with a different duration
      await insertTask({ type: "OLD", duration_in_days: 20 });
      // And an EntityManager for scalar-field projections rather than entity hydration
      const em = newEntityManager();
      // And subtype aliases that must independently filter the shared table
      const [tn, to] = tables(TaskNew, TaskOld);
      // And recording isolated from the Task inserts
      resetQueryCount();
      // When combining each subtype's duration without deduplication
      const rows = await em.query({
        unionAll: [
          { from: tn, select: { days: tn.duration_in_days } },
          { from: to, select: { days: to.duration_in_days } },
        ],
        orderBy: { days: "ASC" },
      });
      // Then each Task appears once, not once per branch
      expect(rows).toEqual([{ days: 10 }, { days: 20 }]);
      expect(queries).toHaveLength(1);
      expect(queries).toMatchInlineSnapshot(`
       [
         "(SELECT t.duration_in_days AS days FROM tasks AS t WHERE t.deleted_at IS NULL AND t.type_id = $1) UNION ALL (SELECT t1.duration_in_days AS days FROM tasks AS t1 WHERE t1.deleted_at IS NULL AND t1.type_id = $2) ORDER BY days ASC",
       ]
      `);
    });
  });

  describe("ordinary scalar queries", () => {
    it("executes an inline ordinary scalar query directly", async () => {
      // Given an Author returned as a scalar row
      await insertAuthor({ first_name: "a1" });
      // And another Author, so the ordinary read returns multiple scalar rows
      await insertAuthor({ first_name: "a2" });
      // And an EntityManager for direct scalar execution
      const em = newEntityManager();
      // And an Author alias for the scalar query
      const a = table(Author);
      // And recording isolated from fixture inserts
      resetQueryCount();
      // When executing an inline scalar read ordered within its own ordinary SELECT
      const rows = await em.query({ from: a, select: a.id, orderBy: [{ asc: a.id }] });
      // Then each Author is one scalar row, with no POJO wrapper or cardinality error
      expect(rows).toEqual(["a:1", "a:2"]);
      expect(queries).toHaveLength(1);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.id AS value FROM authors AS a WHERE a.deleted_at IS NULL ORDER BY a.id ASC",
       ]
      `);
    });

    it("uses an ordinary scalar projection of a multirow POJO compound for entity membership", async () => {
      // Given Author a1 selected by the PK branch
      await insertAuthor({ first_name: "a1" });
      // And Author a2 selected by the FK branch
      await insertAuthor({ first_name: "a2" });
      // And Author a3 excluded from both branches
      await insertAuthor({ first_name: "a3" });
      // And a Book contributing a2 through its Author FK
      await insertBook({ title: "b1", author_id: 2 });
      // And an EntityManager for the ordinary outer entity query
      const em = newEntityManager();
      // And aliases for the outer Author and inner read sources
      const [a, b] = tables(Author, Book);
      // And a separate Author alias local to the PK membership branch
      const inner = table(Author, "inner_author");
      // And compatible POJO Author-id branches, one PK and one FK
      const ids = query({
        union: [
          { from: inner, where: inner.id.eq("a:1"), select: { id: inner.id } },
          query({ from: b, select: { id: b.author_id } }),
        ],
        as: "author_ids",
      });
      // And recording isolated from seed inserts
      resetQueryCount();
      // When the ordinary entity query uses a scalar projection of the compound as an IN list
      const authors = await em.query({
        from: a,
        where: a.id.in(query({ from: ids, select: ids.id })),
        select: a,
        orderBy: { first_name: "ASC" },
      });
      // Then membership hydrates only the selected Authors in one database query
      expect(authors).toMatchEntity([{ firstName: "a1" }, { firstName: "a2" }]);
      expect(queries).toHaveLength(1);
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.* FROM authors AS a WHERE a.id IN (SELECT author_ids.id AS value FROM ((SELECT a1.id AS id FROM authors AS a1 WHERE a1.id = $1 AND a1.deleted_at IS NULL) UNION (SELECT b.author_id AS id FROM books AS b WHERE b.deleted_at IS NULL)) AS author_ids) AND a.deleted_at IS NULL ORDER BY a.first_name ASC",
       ]
      `);
    });

    it("projects a one-row POJO compound as a scalar Expr with an Author-id fallback", async () => {
      // Given an Author projected by the outer SELECT
      await insertAuthor({ first_name: "a1" });
      // And a Book contributing exactly one Author id
      await insertBook({ title: "b1", author_id: 1 });
      // And an EntityManager for scalar expression execution
      const em = newEntityManager();
      // And aliases for the outer Author and inner Book
      const [a, b] = tables(Author, Book);
      // And a POJO compound with one nonempty branch
      const ids = query({
        union: [
          { from: b, where: b.id.eq("b:1"), select: { id: b.author_id } },
          { from: b, where: b.id.eq("b:9"), select: { id: b.author_id } },
        ],
        as: "author_ids",
      });
      // When using an ordinary scalar projection through the Expr coalesce protocol
      const rows = await em.query({ from: a, select: { id: query({ from: ids, select: ids.id }).coalesce("a:9") } });
      // Then the scalar query result decodes with the agreed Author-id codec
      expect(rows).toEqual([{ id: "a:1" }]);
    });

    it("returns SQL NULL for a scalar projection of an empty POJO compound and encodes its fallback", async () => {
      // Given an Author with no Books for either POJO branch
      await insertAuthor({ first_name: "a1" });
      // And an EntityManager for the outer scalar projection
      const em = newEntityManager();
      // And aliases for the outer Author and inner Book
      const [a, b] = tables(Author, Book);
      // And an empty POJO compound whose known domain is Author ids
      const ids = query({
        union: [
          { from: b, select: { id: b.author_id } },
          { from: b, select: { id: b.author_id } },
        ],
        as: "author_ids",
      });
      // And an ordinary scalar projection whose zero rows become NULL in expression context
      const id = query({ from: ids, select: ids.id });
      // And a call-through spy for the fallback's physical binding
      const execute = jest.spyOn(testDriver.driver, "executeQuery");
      // And recording isolated from the Author insert
      resetQueryCount();
      try {
        // When selecting the empty scalar directly and through coalesce
        const rows = await em.query({ from: a, select: { id, fallback: id.coalesce("a:9") } });
        // Then zero scalar rows become NULL only in expression context and the fallback is a physical key
        expect(rows).toEqual([{ id: null, fallback: "a:9" }]);
        expect(queries).toHaveLength(1);
        expect(queries).toMatchInlineSnapshot(`
         [
           "SELECT (SELECT author_ids.id AS value FROM ((SELECT b.author_id AS id FROM books AS b WHERE b.deleted_at IS NULL) UNION (SELECT b1.author_id AS id FROM books AS b1 WHERE b1.deleted_at IS NULL)) AS author_ids) AS id, coalesce((SELECT author_ids1.id AS value FROM ((SELECT b2.author_id AS id FROM books AS b2 WHERE b2.deleted_at IS NULL) UNION (SELECT b3.author_id AS id FROM books AS b3 WHERE b3.deleted_at IS NULL)) AS author_ids1), $1) AS fallback FROM authors AS a WHERE a.deleted_at IS NULL",
         ]
        `);
        expect(execute.mock.calls[0][2]).toEqual([9]);
      } finally {
        execute.mockRestore();
      }
    });

    it("rejects multiple scalar rows in expression context", async () => {
      // Given an Author contributing one id to the POJO compound
      await insertAuthor({ first_name: "a1" });
      // And another Author, so a scalar projection of the compound returns more than one row
      await insertAuthor({ first_name: "a2" });
      // And an EntityManager for the outer SELECT
      const em = newEntityManager();
      // And an Author alias for the outer query
      const a = table(Author);
      // And an independent Author alias for both POJO branches
      const inner = table(Author, "inner_author");
      // And a valid POJO compound returning both Author ids
      const ids = query({
        union: [
          { from: inner, select: { id: inner.id } },
          { from: inner, select: { id: inner.id } },
        ],
        as: "author_ids",
      });
      // When treating an ordinary projection of the multirow compound as a single scalar expression
      const result = em.query({ from: a, where: a.id.eq("a:1"), select: { id: query({ from: ids, select: ids.id }) } });
      // Then PostgreSQL retains the ordinary scalar-subquery cardinality error
      await expect(result).rejects.toThrow("more than one row returned by a subquery used as an expression");
    });
  });
});
