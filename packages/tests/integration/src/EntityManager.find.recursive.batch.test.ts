import type { FindFilter } from "joist-orm";

import { Author, User } from "./entities";
import { insertAuthor, insertBook, insertUser, insertUserToParent } from "./entities/inserts";
import { isPreloadingEnabled, newEntityManager, numberOfQueries, queries, resetQueryCount } from "./testEm";

describe("em.find recursive batching", () => {
  it("shares tagged traversals before each find's count is evaluated", async () => {
    // Given Alice mentors Bob, who mentors Carol
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob", mentor_id: 1 });
    await insertAuthor({ first_name: "Carol", mentor_id: 2 });
    const em = newEntityManager();
    // And only the concurrent counts are recorded
    resetQueryCount();
    // When descendants of Alice and Bob are counted together
    const [alice, bob] = await Promise.all([
      em.findCount(Author, { mentorsRecursive: { firstName: "Alice" } }),
      em.findCount(Author, { mentorsRecursive: { firstName: "Bob" } }),
    ]);
    // Then one shared traversal supplies the separate per-tag counts
    expect(alice).toBe(2);
    expect(bob).toBe(1);
    expect(numberOfQueries).toBe(1);
    expect(queries[0]).toMatchInlineSnapshot(
      `"WITH RECURSIVE _find (tag, arg0) AS (SELECT unnest($1::int[]), unnest($2::character varying[])),  rm AS (SELECT a1.id AS id, _find.tag AS tag FROM authors AS a1 CROSS JOIN _find AS _find WHERE a1.deleted_at IS NULL AND a1.first_name = _find.arg0),  rr (match_id, owner_id, tag) AS ((SELECT rm.id, rs.id, rm.tag FROM rm AS rm JOIN authors AS rs ON rm.id = rs.mentor_id WHERE rs.id IS NOT NULL) UNION (SELECT rr.match_id, rs1.id, rr.tag FROM rr AS rr JOIN authors AS rs1 ON rr.owner_id = rs1.mentor_id WHERE rs1.id IS NOT NULL)) SELECT _find.tag as tag, _data.count as count FROM _find AS _find CROSS JOIN LATERAL (SELECT count(distinct a.id) as count FROM authors AS a WHERE a.deleted_at IS NULL AND EXISTS (SELECT 1 FROM rr AS rr WHERE (rr.owner_id = a.id AND rr.match_id <> a.id) AND rr.tag = _find.tag)) AS _data LIMIT $3"`,
    );
  });

  it("retains every tag when a matching mentor joins to multiple books", async () => {
    // Given Alice mentors Bob and wrote two books
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob", mentor_id: 1 });
    await insertBook({ title: "First", author_id: 1 });
    await insertBook({ title: "Second", author_id: 1 });
    const em = newEntityManager();
    // And the batch differs on book titles while sharing the matching author name
    const first: FindFilter<Author> = {
      mentorsRecursive: { or: [{ firstName: "Alice" }, { books: { title: "First" } }] },
    };
    const second: FindFilter<Author> = {
      mentorsRecursive: { or: [{ firstName: "Alice" }, { books: { title: "Second" } }] },
    };
    resetQueryCount();
    // When both filters match Alice through a name-or-book predicate
    const [byFirst, bySecond] = await Promise.all([em.find(Author, first), em.find(Author, second)]);
    // Then duplicate joined rows do not discard either tag or duplicate Bob
    expect(byFirst.map((a) => a.id)).toEqual(["a:2"]);
    expect(bySecond.map((a) => a.id)).toEqual(["a:2"]);
    expect(numberOfQueries).toBe(1);
  });

  it("propagates tags through nested recursive matching queries", async () => {
    // Given a four-author mentor chain
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob", mentor_id: 1 });
    await insertAuthor({ first_name: "Carol", mentor_id: 2 });
    await insertAuthor({ first_name: "Dave", mentor_id: 3 });
    const em = newEntityManager();
    // And only the concurrent recursive finds are counted
    resetQueryCount();
    // When each matching mentor must itself have a different matching mentor
    const [alice, bob] = await Promise.all([
      em.find(Author, { mentorsRecursive: { mentorsRecursive: { firstName: "Alice" } } }),
      em.find(Author, { mentorsRecursive: { mentorsRecursive: { firstName: "Bob" } } }),
    ]);
    // Then inner and outer recursive traversals agree on the find tag
    expect(alice.map((a) => a.id)).toEqual(["a:3", "a:4"]);
    expect(bob.map((a) => a.id)).toEqual(["a:4"]);
    expect(numberOfQueries).toBe(1);
  });

  it("keeps sibling recursive predicates within the same find", async () => {
    // Given a four-author mentor chain
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob", mentor_id: 1 });
    await insertAuthor({ first_name: "Carol", mentor_id: 2 });
    await insertAuthor({ first_name: "Dave", mentor_id: 3 });
    const em = newEntityManager();
    // And only the concurrent recursive finds are counted
    resetQueryCount();
    // When each author must have both a matching recursive mentor and a matching recursive mentee
    const [aliceToDave, bobToCarol] = await Promise.all([
      em.find(Author, { mentorsRecursive: { firstName: "Alice" }, menteesRecursive: { firstName: "Dave" } }),
      em.find(Author, { mentorsRecursive: { firstName: "Bob" }, menteesRecursive: { firstName: "Carol" } }),
    ]);
    // Then a mentor matching one find cannot combine with a mentee matching another find
    expect(aliceToDave.map((a) => a.id)).toEqual(["a:2", "a:3"]);
    expect(bobToCarol).toEqual([]);
    expect(numberOfQueries).toBe(1);
  });

  it("preserves outer OR branches alongside tagged recursive predicates", async () => {
    // Given Alice mentors Bob, who mentors Carol, while Other has no mentor
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob", mentor_id: 1 });
    await insertAuthor({ first_name: "Carol", mentor_id: 2 });
    await insertAuthor({ first_name: "Other" });
    const em = newEntityManager();
    // And each find has different direct and recursive name predicates
    const first: FindFilter<Author> = {
      or: [{ firstName: "Other" }, { mentorsRecursive: { firstName: "Alice" } }],
    };
    const second: FindFilter<Author> = {
      or: [{ firstName: "Alice" }, { mentorsRecursive: { firstName: "Bob" } }],
    };
    resetQueryCount();
    // When the author's own name can match without any matching recursive mentor
    const [otherOrAlice, aliceOrBob] = await Promise.all([em.find(Author, first), em.find(Author, second)]);
    // Then each tag preserves its own OR semantics
    expect(otherOrAlice.map((a) => a.id)).toEqual(["a:2", "a:3", "a:4"]);
    expect(aliceOrBob.map((a) => a.id)).toEqual(["a:1", "a:3"]);
    expect(numberOfQueries).toBe(1);
  });

  it("batches differently sized mentor ID arrays", async () => {
    // Given a three-author mentor chain
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob", mentor_id: 1 });
    await insertAuthor({ first_name: "Carol", mentor_id: 2 });
    const em = newEntityManager();
    // And only the concurrent recursive finds are counted
    resetQueryCount();
    // When each find accepts a different array of recursive mentors
    const [both, bob, neither] = await Promise.all([
      em.find(Author, { mentorsRecursive: ["a:1", "a:2"] }),
      em.find(Author, { mentorsRecursive: ["a:2"] }),
      em.find(Author, { mentorsRecursive: [] }),
    ]);
    // Then each mentor ID array remains associated with its tag
    expect(both.map((a) => a.id)).toEqual(["a:2", "a:3"]);
    expect(bob.map((a) => a.id)).toEqual(["a:3"]);
    expect(neither).toEqual([]);
    expect(numberOfQueries).toBe(1);
  });

  it("combines shared scope conditions with varying two-binding ranges", async () => {
    // Given Alice and Bob are popular mentors of different ages
    await insertAuthor({ first_name: "Alice", age: 30, is_popular: true });
    await insertAuthor({ first_name: "Bob", age: 45, is_popular: true, mentor_id: 1 });
    await insertAuthor({ first_name: "Carol", age: 20, mentor_id: 2 });
    const em = newEntityManager();
    // And only the concurrent recursive finds are counted
    resetQueryCount();
    // When scoped mentors must fall in different age ranges
    const [younger, older] = await Promise.all([
      em.find(Author, { mentorsRecursive: Author.popular.where({ age: { between: [25, 35] } }) }),
      em.find(Author, { mentorsRecursive: Author.popular.where({ age: { between: [40, 50] } }) }),
    ]);
    // Then the shared popularity condition does not shift the varying range bindings
    expect(younger.map((a) => a.id)).toEqual(["a:2", "a:3"]);
    expect(older.map((a) => a.id)).toEqual(["a:3"]);
    expect(numberOfQueries).toBe(1);
  });

  it("batches recursive emptiness when only outer predicates vary", async () => {
    // Given Alice mentors Bob, while Carol has no mentor
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob", mentor_id: 1 });
    await insertAuthor({ first_name: "Carol" });
    const em = newEntityManager();
    // And only the concurrent recursive finds are counted
    resetQueryCount();
    // When different groups of authors must have empty recursive mentor collections
    const [aliceOrCarol, bobOrCarol] = await Promise.all([
      em.find(Author, { firstName: ["Alice", "Carol"], mentorsRecursive: false }),
      em.find(Author, { firstName: ["Bob", "Carol"], mentorsRecursive: false }),
    ]);
    // Then the shared traversal gives each NOT EXISTS the correct membership
    expect(aliceOrCarol.map((a) => a.id)).toEqual(["a:1", "a:3"]);
    expect(bobOrCarol.map((a) => a.id)).toEqual(["a:3"]);
    expect(numberOfQueries).toBe(1);
  });

  it.each([false, true])("populates recursive find results with pagination=%s", async (paginate) => {
    // Given a four-author mentor chain
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob", mentor_id: 1 });
    await insertAuthor({ first_name: "Carol", mentor_id: 2 });
    await insertAuthor({ first_name: "Dave", mentor_id: 3 });
    // And Carol and Dave each wrote a book
    await insertBook({ title: "Carol's book", author_id: 3 });
    await insertBook({ title: "Dave's book", author_id: 4 });
    const em = newEntityManager();
    resetQueryCount();
    // When concurrent finds request populated books and optionally their second author
    const options = { populate: "books" as const, ...(paginate ? { limit: 1, offset: 1 } : {}) };
    const [alice, bob] = await Promise.all([
      em.find(Author, { mentorsRecursive: { firstName: "Alice" } }, options),
      em.find(Author, { mentorsRecursive: { firstName: "Bob" } }, options),
    ]);
    // Then each tag receives its own page and all books are populated
    expect(alice.map((a) => a.id)).toEqual(paginate ? ["a:3"] : ["a:2", "a:3", "a:4"]);
    expect(bob.map((a) => a.id)).toEqual(paginate ? ["a:4"] : ["a:3", "a:4"]);
    expect(alice.flatMap((a) => a.books.get.map((b) => b.title))).toEqual(
      paginate ? ["Carol's book"] : ["Carol's book", "Dave's book"],
    );
    expect(bob.flatMap((a) => a.books.get.map((b) => b.title))).toEqual(
      paginate ? ["Dave's book"] : ["Carol's book", "Dave's book"],
    );
    expect(numberOfQueries).toBe(isPreloadingEnabled ? 1 : 2);
  });

  it("deduplicates each tagged traversal through an m2m diamond and cycle", async () => {
    // Given Root's two children share a child, Leaf
    await insertUser({ name: "Root" });
    await insertUser({ name: "Left" });
    await insertUser({ name: "Right" });
    await insertUser({ name: "Leaf" });
    await insertUserToParent({ child_id: 2, parent_id: 1 });
    await insertUserToParent({ child_id: 3, parent_id: 1 });
    await insertUserToParent({ child_id: 4, parent_id: 2 });
    await insertUserToParent({ child_id: 4, parent_id: 3 });
    // And invalid persisted data also makes Leaf the parent of Root
    await insertUserToParent({ child_id: 1, parent_id: 4 });
    const em = newEntityManager();
    resetQueryCount();
    // When different recursive parents are requested concurrently
    const [root, left] = await Promise.all([
      em.find(User, { parentsRecursive: { name: "Root" } }),
      em.find(User, { parentsRecursive: { name: "Left" } }),
    ]);
    // Then each traversal terminates, and neither Root nor Left counts as their own parent
    expect(root.map((u) => u.id)).toEqual(["u:2", "u:3", "u:4"]);
    expect(left.map((u) => u.id)).toEqual(["u:1", "u:3", "u:4"]);
    expect(numberOfQueries).toBe(1);
  });
});
