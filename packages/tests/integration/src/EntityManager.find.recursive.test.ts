import { buildQuery } from "joist-knex";
import { type FindFilter, alias } from "joist-orm";

import { AdminUser, Author, type AuthorFilter, Book, TaskOld, User, newAdminUser, newUser } from "./entities";
import { insertAuthor, insertBook, insertTask, insertUser, insertUserToParent, update } from "./entities/inserts";
import { knex, newEntityManager, numberOfQueries, queries, resetQueryCount } from "./testEm";

describe("em.find recursive collections", () => {
  it("finds authors with a matching mentor at any depth", async () => {
    // Given Alice mentors Bob, who mentors Carol
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob", mentor_id: 1 });
    await insertAuthor({ first_name: "Carol", mentor_id: 2 });
    const em = newEntityManager();
    // When authors are filtered by Alice anywhere in their mentor chain
    const authors = await em.find(Author, { mentorsRecursive: { firstName: "Alice" } });
    // Then both descendants match, but Alice does not match herself
    expect(authors.map((a) => a.id)).toEqual(["a:2", "a:3"]);
    expect(authors[1].mentorsRecursive.isLoaded).toBe(false);
  });

  it("matches all endpoint predicates on the same recursive mentee", async () => {
    // Given Root mentors Middle, who mentors Alice
    await insertAuthor({ first_name: "Root" });
    await insertAuthor({ first_name: "Middle", mentor_id: 1 });
    await insertAuthor({ first_name: "Alice", mentor_id: 2 });
    // And only Alice wrote the matching book
    await insertBook({ title: "Postgres", author_id: 3 });
    const em = newEntityManager();
    // When a recursive mentee must be Alice and have a matching book
    const authors = await em.find(Author, { menteesRecursive: { firstName: "Alice", books: { title: "Postgres" } } });
    // Then intermediate mentees need not satisfy the endpoint predicate
    expect(authors.map((a) => a.id)).toEqual(["a:1", "a:2"]);
    // When the name and book predicates match different mentees
    const split = await em.find(Author, { menteesRecursive: { firstName: "Middle", books: { title: "Postgres" } } });
    // Then no author matches
    expect(split).toEqual([]);
  });

  it("keeps recursive predicates inside their boolean branches", async () => {
    // Given Alice mentors Bob, while Carol has no mentor
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob", mentor_id: 1 });
    await insertAuthor({ first_name: "Carol" });
    const em = newEntityManager();
    // When either the author's name or a recursive mentor can match
    const filter: FindFilter<Author> = {
      or: [{ firstName: "Carol" }, { mentorsRecursive: { or: [{ firstName: "Alice" }, { firstName: "Nobody" }] } }],
    };
    const authors = await em.find(Author, filter);
    // Then Carol remains eligible without a mentor
    expect(authors.map((a) => a.id)).toEqual(["a:2", "a:3"]);
  });

  it("supports IDs, entities, arrays, and ordinary collection inequality", async () => {
    // Given Alice mentors Bob, who mentors Carol
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob", mentor_id: 1 });
    await insertAuthor({ first_name: "Carol", mentor_id: 2 });
    const em = newEntityManager();
    const alice = await em.load(Author, "a:1");
    // When the recursive mentor is specified by ID, entity, or array
    const [byId, byEntity, byArray, empty, unequal] = await Promise.all([
      em.find(Author, { mentorsRecursive: alice.id }),
      em.find(Author, { mentorsRecursive: alice }),
      em.find(Author, { mentorsRecursive: [alice.id] }),
      em.find(Author, { mentorsRecursive: [] }),
      em.find(Author, { mentorsRecursive: { ne: alice } }),
    ]);
    // Then all membership forms agree and an empty array matches nothing
    expect(byId.map((a) => a.id)).toEqual(["a:2", "a:3"]);
    expect(byEntity).toEqual(byId);
    expect(byArray).toEqual(byId);
    expect(empty).toEqual([]);
    // Then inequality requires some other mentor, rather than absence of Alice
    expect(unequal.map((a) => a.id)).toEqual(["a:3"]);
  });

  it("supports collection emptiness and prunes omitted predicates", async () => {
    // Given Alice mentors Bob and Bob has no mentees
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob", mentor_id: 1 });
    const em = newEntityManager();
    // When recursive collection membership is tested or its condition is omitted
    const [nonempty, empty, nullCollection, omitted, emptyObject, undefinedField] = await Promise.all([
      em.find(Author, { menteesRecursive: true }),
      em.find(Author, { menteesRecursive: false }),
      em.find(Author, { menteesRecursive: null }),
      em.find(Author, { menteesRecursive: undefined }),
      em.find(Author, { menteesRecursive: {} }),
      em.find(Author, { menteesRecursive: { firstName: undefined } }),
    ]);
    // Then emptiness refers to reachable authors and omitted filters impose no constraint
    expect(nonempty.map((a) => a.id)).toEqual(["a:1"]);
    expect(empty.map((a) => a.id)).toEqual(["a:2"]);
    expect(nullCollection).toEqual(empty);
    expect(omitted.map((a) => a.id)).toEqual(["a:1", "a:2"]);
    expect(emptyObject).toEqual(omitted);
    expect(undefinedField).toEqual(omitted);
  });

  it("accepts scopes with local alias predicates", async () => {
    // Given Alice mentors Bob, who mentors Carol
    await insertAuthor({ first_name: "Alice", age: 30 });
    await insertAuthor({ first_name: "Bob", age: 12, mentor_id: 1 });
    await insertAuthor({ first_name: "Carol", age: 10, mentor_id: 2 });
    const em = newEntityManager();
    // When the endpoint is described by a scope using a local alias
    const authors = await em.find(Author, { mentorsRecursive: Author.named("Ali").adult });
    // Then both descendants match the scoped ancestor
    expect(authors.map((a) => a.id)).toEqual(["a:2", "a:3"]);
  });

  it("nests recursive filters inside relations and other recursive filters", async () => {
    // Given Alice mentors Bob, who mentors Carol
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob", mentor_id: 1 });
    await insertAuthor({ first_name: "Carol", mentor_id: 2 });
    // And Carol wrote a book
    await insertBook({ title: "Postgres", author_id: 3 });
    const em = newEntityManager();
    // When a book's author must have a mentor who has Alice as a mentor
    const books = await em.find(Book, { author: { mentorsRecursive: { mentorsRecursive: { firstName: "Alice" } } } });
    // Then the nested traversals preserve their separate owner aliases
    expect(books.map((b) => b.id)).toEqual(["b:1"]);
  });

  it("batches simultaneous finds, counts, and ID queries with isolated results", async () => {
    // Given Alice mentors Bob, who mentors Carol
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob", mentor_id: 1 });
    await insertAuthor({ first_name: "Carol", mentor_id: 2 });
    const em = newEntityManager();
    // And only the concurrent find statements are counted
    resetQueryCount();
    // When concurrent queries have the same recursive structure but different values
    const [alice, bob, aliceCount, bobCount, aliceIds, bobIds, missing, missingCount, missingIds] = await Promise.all([
      em.find(Author, { mentorsRecursive: { firstName: "Alice" } }),
      em.find(Author, { mentorsRecursive: { firstName: "Bob" } }),
      em.findCount(Author, { mentorsRecursive: { firstName: "Alice" } }),
      em.findCount(Author, { mentorsRecursive: { firstName: "Bob" } }),
      em.findIds(Author, { mentorsRecursive: { firstName: "Alice" } }),
      em.findIds(Author, { mentorsRecursive: { firstName: "Bob" } }),
      em.find(Author, { mentorsRecursive: { firstName: "Nobody" } }),
      em.findCount(Author, { mentorsRecursive: { firstName: "Nobody" } }),
      em.findIds(Author, { mentorsRecursive: { firstName: "Nobody" } }),
    ]);
    // Then each result uses only its own matching endpoints
    expect(alice.map((a) => a.id)).toEqual(["a:2", "a:3"]);
    expect(bob.map((a) => a.id)).toEqual(["a:3"]);
    expect(aliceCount).toBe(2);
    expect(bobCount).toBe(1);
    expect(aliceIds).toEqual(["a:2", "a:3"]);
    expect(bobIds).toEqual(["a:3"]);
    expect(missing).toEqual([]);
    expect(missingCount).toBe(0);
    expect(missingIds).toEqual([]);
    expect(numberOfQueries).toBe(3);
  });

  it("preserves recursive conditions inside ordinary collection filters", async () => {
    // Given Alice wrote a trilogy
    await insertAuthor({ first_name: "Alice" });
    await insertBook({ title: "First", author_id: 1 });
    await insertBook({ title: "Second", author_id: 1, prequel_id: 1 });
    await insertBook({ title: "Third", author_id: 1, prequel_id: 2 });
    // And Bob wrote an unrelated book
    await insertAuthor({ first_name: "Bob" });
    await insertBook({ title: "Unrelated", author_id: 2 });
    const em = newEntityManager();
    // When a book must have matching recursive endpoints in both directions
    const authors = await em.find(Author, {
      books: { prequelsRecursive: { title: "First" }, sequelsRecursive: { title: "Third" } },
    });
    // Then both CTEs remain usable after the books join becomes an EXISTS
    expect(authors.map((a) => a.id)).toEqual(["a:1"]);
  });

  it("paginates outer authors and populates their ordinary relations", async () => {
    // Given Alice mentors Bob, who mentors Carol
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob", mentor_id: 1 });
    await insertAuthor({ first_name: "Carol", mentor_id: 2 });
    // And Carol wrote a book
    await insertBook({ title: "Postgres", author_id: 3 });
    const em = newEntityManager();
    // When the second matching author is requested with books populated
    const authors = await em.find(
      Author,
      { mentorsRecursive: { firstName: "Alice" } },
      { limit: 1, offset: 1, populate: "books" },
    );
    // Then pagination applies after reachability filtering
    expect(authors.map((a) => a.id)).toEqual(["a:3"]);
    expect(authors[0].books.get.map((b) => b.title)).toEqual(["Postgres"]);
  });

  it("filters soft-deleted endpoints but traverses soft-deleted intermediates", async () => {
    // Given Alice mentors deleted Bob, who mentors Carol
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob", mentor_id: 1, deleted_at: new Date() });
    await insertAuthor({ first_name: "Carol", mentor_id: 2 });
    const em = newEntityManager();
    // When either a live or deleted ancestor is the matching endpoint
    const [alice, bob, included, descendants] = await Promise.all([
      em.find(Author, { mentorsRecursive: { firstName: "Alice" } }),
      em.find(Author, { mentorsRecursive: { firstName: "Bob" } }),
      em.find(Author, { mentorsRecursive: { firstName: "Bob" } }, { softDeletes: "include" }),
      em.find(Author, { menteesRecursive: { firstName: "Carol" } }),
    ]);
    // Then endpoint visibility does not cut off traversal through Bob
    expect(alice.map((a) => a.id)).toEqual(["a:3"]);
    expect(bob).toEqual([]);
    expect(included.map((a) => a.id)).toEqual(["a:3"]);
    expect(descendants.map((a) => a.id)).toEqual(["a:1"]);
  });

  it("terminates on persisted cycles and excludes self-reachability", async () => {
    // Given Alice mentors Bob
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob", mentor_id: 1 });
    // And invalid persisted data makes Bob mentor Alice as well
    await update("authors", { id: 1, mentor_id: 2 });
    const em = newEntityManager();
    // When Alice is the required ancestor or descendant
    const [parents, children] = await Promise.all([
      em.find(Author, { mentorsRecursive: "a:1" }),
      em.find(Author, { menteesRecursive: "a:1" }),
    ]);
    // Then Bob matches in both directions, but Alice never matches herself
    expect(parents.map((a) => a.id)).toEqual(["a:2"]);
    expect(children.map((a) => a.id)).toEqual(["a:2"]);
  });

  it("traverses recursive one-to-one sequels", async () => {
    // Given one author wrote a trilogy
    await insertAuthor({ first_name: "Alice" });
    await insertBook({ title: "First", author_id: 1 });
    await insertBook({ title: "Second", author_id: 1, prequel_id: 1 });
    await insertBook({ title: "Third", author_id: 1, prequel_id: 2 });
    const em = newEntityManager();
    // When books must eventually lead to Third
    const books = await em.find(Book, { sequelsRecursive: { title: "Third" } });
    // Then both earlier volumes match
    expect(books.map((b) => b.id)).toEqual(["b:1", "b:2"]);
  });

  it("deduplicates m2m diamonds in both directions", async () => {
    // Given Root has two children who share one child, Leaf
    await insertUser({ name: "Root" });
    await insertUser({ name: "Left" });
    await insertUser({ name: "Right" });
    await insertUser({ name: "Leaf" });
    await insertUserToParent({ child_id: 2, parent_id: 1 });
    await insertUserToParent({ child_id: 3, parent_id: 1 });
    await insertUserToParent({ child_id: 4, parent_id: 2 });
    await insertUserToParent({ child_id: 4, parent_id: 3 });
    const em = newEntityManager();
    // When either Root is an ancestor or Leaf is a descendant
    const [descendants, ancestors] = await Promise.all([
      em.find(User, { parentsRecursive: { name: "Root" } }),
      em.find(User, { childrenRecursive: { name: "Leaf" } }),
    ]);
    // Then multiple paths do not duplicate owners
    expect(descendants.map((u) => u.id)).toEqual(["u:2", "u:3", "u:4"]);
    expect(ancestors.map((u) => u.id)).toEqual(["u:1", "u:2", "u:3"]);
  });

  it("applies STI endpoint constraints without restricting intermediate types", async () => {
    // Given an old task was copied through a new task into another old task
    await insertTask({ type: "OLD", special_old_field: 1 });
    await insertTask({ type: "NEW" });
    await insertTask({ type: "OLD", special_old_field: 3 });
    // And the persisted copy chain crosses subtype boundaries
    await update("tasks", { id: 2, copied_from_id: 1 });
    await update("tasks", { id: 3, copied_from_id: 2 });
    const em = newEntityManager();
    // And only the concurrent subtype finds are counted
    resetQueryCount();
    // When old tasks must descend from different old endpoints
    const [tasks, leafCopies] = await Promise.all([
      em.find(TaskOld, { copiedFromsRecursive: { specialOldField: 1 } }),
      em.find(TaskOld, { copiedFromsRecursive: { specialOldField: 3 } }),
    ]);
    // Then the new intermediate task does not prevent reaching the old endpoint
    expect(tasks.map((t) => t.id)).toEqual(["task:3"]);
    expect(leafCopies).toEqual([]);
    expect(numberOfQueries).toBe(1);
  });

  it("resolves recursive metadata inherited by a CTI subtype", async () => {
    // Given an admin user descends from Root through a regular user
    const em = newEntityManager();
    const root = newUser(em, { name: "Root" });
    const middle = newUser(em, { name: "Middle", parents: [root] });
    const admin = newAdminUser(em, { name: "Admin", parents: [middle] });
    await em.flush();
    // And a fresh EntityManager counts only the concurrent inherited-relation finds
    const em2 = newEntityManager();
    resetQueryCount();
    // When the admin subtype is filtered through different inherited recursive endpoints
    const [admins, middleAdmins] = await Promise.all([
      em2.find(AdminUser, { parentsRecursive: { name: "Root" } }),
      em2.find(AdminUser, { parentsRecursive: { name: "Middle" } }),
    ]);
    // Then the base User graph supplies the path to the admin
    expect(admins.map((a) => a.id)).toEqual([admin.id]);
    expect(middleAdmins.map((a) => a.id)).toEqual([admin.id]);
    expect(numberOfQueries).toBe(1);
  });

  it("terminates on m2m cycles without treating an owner as its own endpoint", async () => {
    // Given Root is the parent of Leaf
    await insertUser({ name: "Root" });
    await insertUser({ name: "Leaf" });
    await insertUserToParent({ child_id: 2, parent_id: 1 });
    // And invalid persisted data also makes Leaf the parent of Root
    await insertUserToParent({ child_id: 1, parent_id: 2 });
    const em = newEntityManager();
    // When Root is required as a recursive parent
    const users = await em.find(User, { parentsRecursive: { name: "Root" } });
    // Then only Leaf matches despite the path back to Root
    expect(users.map((u) => u.id)).toEqual(["u:2"]);
  });

  it("renders executable recursive CTEs through the Knex API", async () => {
    // Given Alice mentors Bob
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob", mentor_id: 1 });
    // When the public Knex builder filters on Alice as a recursive mentor
    const rows = await buildQuery(knex, Author, { where: { mentorsRecursive: { firstName: "Alice" } } });
    // Then its recursive union has the same membership as em.find
    expect(rows.map((row) => (row as { id: number }).id)).toEqual([2]);
  });

  it("rejects aliases that would escape a recursive filter", async () => {
    // Given an alias for the matching mentor
    const a = alias(Author);
    const em = newEntityManager();
    const filter: AuthorFilter = {
      // @ts-expect-error Recursive endpoints cannot export their alias to the outer query
      mentorsRecursive: { as: a, firstName: "Alice" },
    };
    // And no database statements have been issued for this filter
    resetQueryCount();
    // When an endpoint alias is exported from the recursive query
    await expect(em.find(Author, filter)).rejects.toThrow(
      "Recursive collection filters do not support exporting aliases",
    );
    // Then the unsupported correlation is rejected before SQL execution
    expect(queries).toEqual([]);
  });
});
