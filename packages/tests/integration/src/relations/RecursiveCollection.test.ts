import { insertAuthor, insertBook, insertUser, insertUserToParent, select, update } from "@src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "@src/testEm";
import { RecursiveCycleError, withLoaded } from "joist-orm";
import { Author, Book, newAuthor, newBook, newUser, User } from "../entities";

describe("RecursiveCollection", () => {
  describe("parents", () => {
    it("can load recursive levels of mentors", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3", mentor_id: 2 });
      resetQueryCount();
      const em = newEntityManager();
      const a3 = await em.load(Author, "a:3", "mentorsRecursive");
      expect(queries[1]).toMatchInlineSnapshot(
        `"WITH RECURSIVE a_cte AS (SELECT b.id, b.mentor_id FROM authors b WHERE b.id = ANY($1) UNION SELECT r.id, r.mentor_id FROM authors r JOIN a_cte ON r.id = a_cte.mentor_id) SELECT "a".* FROM authors AS a JOIN a_cte AS a_cte ON a.id = a_cte.id ORDER BY a.id ASC LIMIT $2"`,
      );
      expect(a3.mentorsRecursive.get).toMatchEntity([{ firstName: "a2" }, { firstName: "a1" }]);
    });

    it("sees wip changes several layers up", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3", mentor_id: 2 });
      const em = newEntityManager();
      // Given we give a1 a new mentor
      const a1 = await em.load(Author, "a:1");
      a1.mentor.set(newAuthor(em, { firstName: "a0", mentor: undefined }));
      // When we later load a3.mentorsRecursive
      const a3 = await em.load(Author, "a:3", "mentorsRecursive");
      // Then we see the new, unsaved mentor
      expect(a3.mentorsRecursive.get).toMatchEntity([{ firstName: "a2" }, { firstName: "a1" }, { firstName: "a0" }]);
    });

    it("sees wip changes several layers up to unloaded relations", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3" });
      await insertAuthor({ first_name: "a4", mentor_id: 3 });
      const em = newEntityManager();
      // Given we give a3 an existing mentor a2
      const [a2, a3] = await em.loadAll(Author, ["a:2", "a:3"]);
      a3.mentor.set(a2);
      // When we later load a4.mentorsRecursive
      const a4 = await em.load(Author, "a:4", "mentorsRecursive");
      // Then we see the new, unsaved mentor
      expect(a4.mentorsRecursive.get).toMatchEntity([{ firstName: "a3" }, { firstName: "a2" }, { firstName: "a1" }]);
    });

    it("detects wip cycles", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3", mentor_id: 2 });
      const em = newEntityManager();
      // Given we make a3 a mentor of a1
      const [a1, a3] = await em.loadAll(Author, ["a:1", "a:3"]);
      a1.mentor.set(a3);
      // When we later load a3.mentorsRecursive, we expect it to throw
      await expect(a3.mentorsRecursive.load()).rejects.toThrow(RecursiveCycleError);
      // And it knows the path that caused the error
      try {
        await a3.mentorsRecursive.load();
      } catch (e: any) {
        expect(e.message).toBe("Cycle detected in Author:3.mentorsRecursive");
        expect(e.entities).toMatchEntity([a3, { firstName: "a2" }, a1, a3]);
      }
    });

    it("detects persisted cycles", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3", mentor_id: 2 });
      await update("authors", { id: 1, mentor_id: 3 });
      const em = newEntityManager();
      await expect(em.load(Author, "a:3", "mentorsRecursive")).rejects.toThrow(RecursiveCycleError);
    });

    it("works on new instance", async () => {
      const em = newEntityManager();
      const a1 = newAuthor(em);
      expect(await a1.mentorsRecursive.load()).toMatchEntity([]);
    });

    it("works on parent is new instance", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const a1 = await em.load(Author, "a:1");
      a1.mentor.set(newAuthor(em, { mentor: undefined }));
      expect(await a1.mentorsRecursive.load()).toMatchEntity([{}]);
    });

    it("works on parent is new instance to existing ancestor", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3" });
      const em = newEntityManager();
      const [a2, a3] = await em.loadAll(Author, ["a:2", "a:3"]);
      const a2b = newAuthor(em, { mentor: a2 });
      a3.mentor.set(a2b);
      expect(await a3.mentorsRecursive.load()).toMatchEntity([a2b, a2, { id: "a:1" }]);
    });

    it("is loaded on new entities", async () => {
      const em = newEntityManager();
      const a1 = em.create(Author, { firstName: "a1" });
      expect(a1.mentorsRecursive.isLoaded).toBe(true);
      expect(a1.mentorsRecursive.get).toMatchEntity([]);
    });

    it("can use withLoaded", async () => {
      const em = newEntityManager();
      const a = newAuthor(em);
      const { mentorsRecursive } = withLoaded(a);
      expect(mentorsRecursive).toMatchEntity([]);
    });

    it("converts cycle errors to validation errors via addCycleMessage", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3", mentor_id: 2 });
      const em = newEntityManager();
      // Given we make a3 a mentor of a1 (creating a cycle)
      const [a1, a3] = await em.loadAll(Author, ["a:1", "a:3"]);
      a1.mentor.set(a3);
      // When we flush, the cycle is caught and converted to a ValidationErrors
      await expect(em.flush()).rejects.toThrow("Author a1 has a cycle in their mentor chain");
    });

    it("can refresh after new parents are inserted in the chain", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3", mentor_id: 2 });
      const em = newEntityManager();
      const a3 = await em.load(Author, "a:3", "mentorsRecursive");
      expect(a3.mentorsRecursive.get).toMatchEntity([{ firstName: "a2" }, { firstName: "a1" }]);
      // Insert two new ancestors above a1 via raw SQL (simulating external changes)
      await insertAuthor({ first_name: "a0" });
      await insertAuthor({ first_name: "a00", mentor_id: undefined });
      await update("authors", { id: 4, mentor_id: 5 });
      await update("authors", { id: 1, mentor_id: 4 });
      await em.refresh();
      expect(a3.mentorsRecursive.get).toMatchEntity([
        { firstName: "a2" },
        { firstName: "a1" },
        { firstName: "a0" },
        { firstName: "a00" },
      ]);
    });
  });

  describe("children", () => {
    it("can load recursive levels of mentees", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3", mentor_id: 2 });
      const em = newEntityManager();
      const a1 = await em.load(Author, "a:1", "menteesRecursive");
      expect(a1.menteesRecursive.get).toMatchEntity([{ firstName: "a2" }, { firstName: "a3" }]);
    });

    it("sees wip changes several layers down", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3", mentor_id: 2 });
      const em = newEntityManager();
      // Given we give a3 a new mentee
      const a3 = await em.load(Author, "a:3");
      newAuthor(em, { firstName: "a4", mentor: a3 });
      // When we later load a1.menteesRecursive
      const a1 = await em.load(Author, "a:1", "menteesRecursive");
      // Then we see the new, unsaved mentor
      expect(a1.menteesRecursive.get).toMatchEntity([{ firstName: "a2" }, { firstName: "a3" }, { firstName: "a4" }]);
    });

    it("sees wip changes several layers down to unloaded relations", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3" });
      await insertAuthor({ first_name: "a4", mentor_id: 3 });
      const em = newEntityManager();
      // Given we give a2 a new mentee of a3
      const [a2, a3] = await em.loadAll(Author, ["a:2", "a:3"]);
      a2.mentees.add(a3);
      // When we later load a1.menteesRecursive
      const a1 = await em.load(Author, "a:1", "menteesRecursive");
      // Then we see full mentor chain
      expect(a1.menteesRecursive.get).toMatchEntity([{ firstName: "a2" }, { firstName: "a3" }, { firstName: "a4" }]);
    });

    it("detects wip cycles", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3", mentor_id: 2 });
      const em = newEntityManager();
      // Given we give a3 a new mentee
      const [a1, a3] = await em.loadAll(Author, ["a:1", "a:3"]);
      a3.mentees.add(a1);
      // When we later load a1.menteesRecursive, we expect it to throw
      await expect(a1.menteesRecursive.load()).rejects.toThrow(RecursiveCycleError);
      // And it knows the path that caused the error
      try {
        await a1.menteesRecursive.load();
      } catch (e: any) {
        expect(e.message).toBe("Cycle detected in Author:1.menteesRecursive");
        expect(e.entities).toMatchEntity([a1, { firstName: "a2" }, a3, a1]);
      }
    });

    it("detects persisted cycles", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3", mentor_id: 2 });
      await update("authors", { id: 1, mentor_id: 3 });
      const em = newEntityManager();
      await expect(em.load(Author, "a:1", "menteesRecursive")).rejects.toThrow(RecursiveCycleError);
    });

    it("works on new instance", async () => {
      const em = newEntityManager();
      const a1 = newAuthor(em);
      expect(await a1.menteesRecursive.load()).toMatchEntity([]);
    });

    it("works on child is new instance", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const a2 = newAuthor(em);
      const a1 = await em.load(Author, "a:1");
      a1.mentees.add(a2);
      expect(await a1.menteesRecursive.load()).toMatchEntity([a2]);
    });

    it("works on parent is new instance", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const a0 = newAuthor(em);
      const a1 = await em.load(Author, "a:1");
      a1.mentor.set(a0);
      expect(await a0.menteesRecursive.load()).toMatchEntity([a1]);
    });

    it("is loaded on new entities", async () => {
      const em = newEntityManager();
      const a1 = em.create(Author, { firstName: "a1" });
      expect(a1.menteesRecursive.get).toMatchEntity([]);
    });

    it("can delete and refresh", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3", mentor_id: 2 });
      const em = newEntityManager();
      const a1 = await em.load(Author, "a:1", "menteesRecursive");
      em.delete(a1.menteesRecursive.get[1]);
      await em.flush();
      await em.refresh();
      const rows = await select("authors");
      expect(rows.length).toBe(2);
    });

    it("can refresh after new children are inserted in the middle of the chain", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3", mentor_id: 2 });
      const em = newEntityManager();
      const a1 = await em.load(Author, "a:1", "menteesRecursive");
      expect(a1.menteesRecursive.get).toMatchEntity([{ firstName: "a2" }, { firstName: "a3" }]);
      // Insert new children below a3 via raw SQL (simulating external changes)
      await insertAuthor({ first_name: "a4", mentor_id: 3 });
      await insertAuthor({ first_name: "a5", mentor_id: 4 });
      await em.refresh();
      expect(a1.menteesRecursive.get).toMatchEntity([
        { firstName: "a2" },
        { firstName: "a3" },
        { firstName: "a4" },
        { firstName: "a5" },
      ]);
    });
  });

  describe("children o2o", () => {
    it("can load recursive levels of sequels", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1, prequel_id: 1 });
      await insertBook({ title: "b3", author_id: 1, prequel_id: 2 });
      const em = newEntityManager();
      const b1 = await em.load(Book, "b:1", "sequelsRecursive");
      expect(b1.sequelsRecursive.get).toMatchEntity([{ title: "b2" }, { title: "b3" }]);
    });

    it("sees wip changes several layers down", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1, prequel_id: 1 });
      await insertBook({ title: "b3", author_id: 1, prequel_id: 2 });
      const em = newEntityManager();
      // Given we give b3 a new sequel
      const b3 = await em.load(Book, "b:3");
      newBook(em, { title: "b4", author: b3.author.id, prequel: b3 });
      // When we later load b1.sequelsRecursive
      const b1 = await em.load(Book, "b:1", "sequelsRecursive");
      // Then we see the new, unsaved sequel
      expect(b1.sequelsRecursive.get).toMatchEntity([{ title: "b2" }, { title: "b3" }, { title: "b4" }]);
    });

    it("sees wip changes several layers down to unloaded relations", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1, prequel_id: 1 });
      await insertBook({ title: "b3", author_id: 1 });
      await insertBook({ title: "b4", author_id: 1, prequel_id: 3 });
      const em = newEntityManager();
      // Given we give b2 a new sequel of b3
      const [b2, b3] = await em.loadAll(Book, ["b:2", "b:3"]);
      b2.sequel.set(b3);
      // When we later load b1.sequelsRecursive
      const b1 = await em.load(Book, "b:1", "sequelsRecursive");
      // Then we see full mentor chain
      expect(b1.sequelsRecursive.get).toMatchEntity([{ title: "b2" }, { title: "b3" }, { title: "b4" }]);
    });

    it("detects wip cycles", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1, prequel_id: 1 });
      await insertBook({ title: "b3", author_id: 1, prequel_id: 2 });
      const em = newEntityManager();
      const [b1, b3] = await em.loadAll(Book, ["b:1", "b:3"]);
      b3.sequel.set(b1);
      // When we later load b1.sequelsRecursive, we expect it to throw
      await expect(b1.sequelsRecursive.load()).rejects.toThrow(RecursiveCycleError);
      // And it knows the path that caused the error
      try {
        await b1.sequelsRecursive.load();
      } catch (e: any) {
        expect(e.message).toBe("Cycle detected in Book:1.sequelsRecursive");
        expect(e.entities).toMatchEntity([b1, { title: "b2" }, b3, b1]);
      }
    });

    it("detects persisted cycles", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1, prequel_id: 1 });
      await insertBook({ title: "b3", author_id: 1, prequel_id: 2 });
      await update("books", { id: 1, prequel_id: 3 });
      const em = newEntityManager();
      await expect(em.load(Book, "b:1", "sequelsRecursive")).rejects.toThrow(RecursiveCycleError);
    });

    it("works on new instance", async () => {
      const em = newEntityManager();
      const b1 = newBook(em);
      expect(await b1.sequelsRecursive.load()).toMatchEntity([]);
    });

    it("works on child is new instance", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const b1 = await em.load(Book, "b:1");
      const b2 = newBook(em);
      b1.sequel.set(b2);
      expect(await b1.sequelsRecursive.load()).toMatchEntity([b2]);
    });

    it("is loaded on new entities", async () => {
      const em = newEntityManager();
      const b1 = em.create(Book, { title: "b1", author: newAuthor(em) });
      expect(b1.sequelsRecursive.get).toMatchEntity([]);
    });

    it("can use withLoaded", async () => {
      const em = newEntityManager();
      const b = newBook(em);
      const { sequelsRecursive } = withLoaded(b);
      expect(sequelsRecursive).toMatchEntity([]);
    });
  });

  describe("m2m parents", () => {
    it("can load recursive levels of parents", async () => {
      // u1 is parent of u2, u2 is parent of u3
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertUser({ name: "u3" });
      await insertUserToParent({ child_id: 2, parent_id: 1 });
      await insertUserToParent({ child_id: 3, parent_id: 2 });
      resetQueryCount();
      const em = newEntityManager();
      const u3 = await em.load(User, "u:3", "parentsRecursive");
      expect(u3.parentsRecursive.get).toMatchEntity([{ name: "u2" }, { name: "u1" }]);
    });

    it("can load with multiple parents at each level", async () => {
      // u3 has two parents: u1 and u2
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertUser({ name: "u3" });
      await insertUserToParent({ child_id: 3, parent_id: 1 });
      await insertUserToParent({ child_id: 3, parent_id: 2 });
      const em = newEntityManager();
      const u3 = await em.load(User, "u:3", "parentsRecursive");
      expect(u3.parentsRecursive.get).toMatchEntity([{ name: "u1" }, { name: "u2" }]);
    });

    it("can load grandparents through multiple parents", async () => {
      // u4 has parents u2, u3. u2 has parent u1. u3 has parent u1.
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertUser({ name: "u3" });
      await insertUser({ name: "u4" });
      await insertUserToParent({ child_id: 2, parent_id: 1 });
      await insertUserToParent({ child_id: 3, parent_id: 1 });
      await insertUserToParent({ child_id: 4, parent_id: 2 });
      await insertUserToParent({ child_id: 4, parent_id: 3 });
      const em = newEntityManager();
      const u4 = await em.load(User, "u:4", "parentsRecursive");
      // u1 appears once despite being reachable through both u2 and u3
      expect(u4.parentsRecursive.get).toMatchEntity([{ name: "u2" }, { name: "u3" }, { name: "u1" }]);
    });

    it("sees wip changes", async () => {
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertUserToParent({ child_id: 2, parent_id: 1 });
      const em = newEntityManager();
      // Given we add a new parent to u1
      const u1 = await em.load(User, "u:1");
      const u0 = newUser(em, { name: "u0" });
      u1.parents.add(u0);
      // When we load u2.parentsRecursive
      const u2 = await em.load(User, "u:2", "parentsRecursive");
      // Then we see the new, unsaved parent
      expect(u2.parentsRecursive.get).toMatchEntity([{ name: "u1" }, { name: "u0" }]);
    });

    it("detects wip cycles", async () => {
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertUser({ name: "u3" });
      await insertUserToParent({ child_id: 2, parent_id: 1 });
      await insertUserToParent({ child_id: 3, parent_id: 2 });
      const em = newEntityManager();
      // Given we make u3 a parent of u1 (creating a cycle)
      const [u1, u3] = await em.loadAll(User, ["u:1", "u:3"]);
      u1.parents.add(u3);
      // When we load u3.parentsRecursive, we expect it to throw
      await expect(u3.parentsRecursive.load()).rejects.toThrow(RecursiveCycleError);
      try {
        await u3.parentsRecursive.load();
      } catch (e: any) {
        expect(e.message).toBe("Cycle detected in User:3.parentsRecursive");
      }
    });

    it("detects persisted cycles", async () => {
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertUser({ name: "u3" });
      await insertUserToParent({ child_id: 2, parent_id: 1 });
      await insertUserToParent({ child_id: 3, parent_id: 2 });
      await insertUserToParent({ child_id: 1, parent_id: 3 });
      const em = newEntityManager();
      await expect(em.load(User, "u:3", "parentsRecursive")).rejects.toThrow(RecursiveCycleError);
    });

    it("works on new instance", async () => {
      const em = newEntityManager();
      const u1 = newUser(em);
      expect(await u1.parentsRecursive.load()).toMatchEntity([]);
    });

    it("is loaded on new entities", async () => {
      const em = newEntityManager();
      const u1 = em.create(User, { name: "u1", email: "u1@test.com" });
      expect(u1.parentsRecursive.isLoaded).toBe(true);
      expect(u1.parentsRecursive.get).toMatchEntity([]);
    });

    it("can use withLoaded", async () => {
      const em = newEntityManager();
      const u = newUser(em);
      const { parentsRecursive } = withLoaded(u);
      expect(parentsRecursive).toMatchEntity([]);
    });

    it("can refresh after new parents are inserted", async () => {
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertUserToParent({ child_id: 2, parent_id: 1 });
      const em = newEntityManager();
      const u2 = await em.load(User, "u:2", "parentsRecursive");
      expect(u2.parentsRecursive.get).toMatchEntity([{ name: "u1" }]);
      // Insert a new grandparent via raw SQL
      await insertUser({ name: "u0" });
      await insertUserToParent({ child_id: 1, parent_id: 3 });
      await em.refresh();
      expect(u2.parentsRecursive.get).toMatchEntity([{ name: "u1" }, { name: "u0" }]);
    });

    it("snapshots the CTE query", async () => {
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertUserToParent({ child_id: 2, parent_id: 1 });
      resetQueryCount();
      const em = newEntityManager();
      await em.load(User, "u:2", "parentsRecursive");
      // queries[0] is the load of u:2, queries[1] is the CTE
      expect(queries[1]).toMatchInlineSnapshot(
        `"WITH RECURSIVE cte AS (SELECT b.* FROM users_to_parents b WHERE b.child_id = ANY($1) UNION SELECT r.* FROM users_to_parents r JOIN cte ON r.child_id = cte.parent_id) SELECT utp.* FROM cte AS utp ORDER BY utp.id ASC LIMIT $2"`,
      );
    });

    it("can batch multiple seed entities", async () => {
      // u1 -> u3, u2 -> u3 -> u4
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertUser({ name: "u3" });
      await insertUser({ name: "u4" });
      await insertUserToParent({ child_id: 1, parent_id: 3 });
      await insertUserToParent({ child_id: 2, parent_id: 3 });
      await insertUserToParent({ child_id: 3, parent_id: 4 });
      const em = newEntityManager();
      const [u1, u2] = await em.loadAll(User, ["u:1", "u:2"], "parentsRecursive");
      expect(u1.parentsRecursive.get).toMatchEntity([{ name: "u3" }, { name: "u4" }]);
      expect(u2.parentsRecursive.get).toMatchEntity([{ name: "u3" }, { name: "u4" }]);
    });

    it("works on isolated entity with no join rows", async () => {
      await insertUser({ name: "u1" });
      const em = newEntityManager();
      const u1 = await em.load(User, "u:1", "parentsRecursive");
      expect(u1.parentsRecursive.get).toMatchEntity([]);
    });

    it("works when entity is already in the EM", async () => {
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertUserToParent({ child_id: 2, parent_id: 1 });
      const em = newEntityManager();
      // Pre-load u1 so it's already in the EM
      await em.load(User, "u:1");
      // Now load u2.parentsRecursive which discovers u1
      const u2 = await em.load(User, "u:2", "parentsRecursive");
      expect(u2.parentsRecursive.get).toMatchEntity([{ name: "u1" }]);
    });

    it("converts cycle errors to validation errors via addCycleMessage", async () => {
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertUser({ name: "u3" });
      await insertUserToParent({ child_id: 2, parent_id: 1 });
      await insertUserToParent({ child_id: 3, parent_id: 2 });
      const em = newEntityManager();
      // Given we make u3 a parent of u1 (creating a cycle)
      const [u1, u3] = await em.loadAll(User, ["u:1", "u:3"]);
      u1.parents.add(u3);
      // When we flush, the cycle is caught and converted to a ValidationErrors
      await expect(em.flush()).rejects.toThrow("User u1 has a cycle in their parent hierarchy");
    });
  });

  describe("m2m children", () => {
    it("can load recursive levels of children", async () => {
      // u1 is parent of u2, u2 is parent of u3
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertUser({ name: "u3" });
      await insertUserToParent({ child_id: 2, parent_id: 1 });
      await insertUserToParent({ child_id: 3, parent_id: 2 });
      const em = newEntityManager();
      const u1 = await em.load(User, "u:1", "childrenRecursive");
      expect(u1.childrenRecursive.get).toMatchEntity([{ name: "u2" }, { name: "u3" }]);
    });

    it("can load with multiple children at each level", async () => {
      // u1 has two children: u2 and u3
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertUser({ name: "u3" });
      await insertUserToParent({ child_id: 2, parent_id: 1 });
      await insertUserToParent({ child_id: 3, parent_id: 1 });
      const em = newEntityManager();
      const u1 = await em.load(User, "u:1", "childrenRecursive");
      expect(u1.childrenRecursive.get).toMatchEntity([{ name: "u2" }, { name: "u3" }]);
    });

    it("can load grandchildren through multiple children", async () => {
      // u1 has children u2, u3. Both u2 and u3 have child u4.
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertUser({ name: "u3" });
      await insertUser({ name: "u4" });
      await insertUserToParent({ child_id: 2, parent_id: 1 });
      await insertUserToParent({ child_id: 3, parent_id: 1 });
      await insertUserToParent({ child_id: 4, parent_id: 2 });
      await insertUserToParent({ child_id: 4, parent_id: 3 });
      const em = newEntityManager();
      const u1 = await em.load(User, "u:1", "childrenRecursive");
      // u4 appears once despite being reachable through both u2 and u3
      expect(u1.childrenRecursive.get).toMatchEntity([{ name: "u2" }, { name: "u3" }, { name: "u4" }]);
    });

    it("sees wip changes several layers down", async () => {
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertUserToParent({ child_id: 2, parent_id: 1 });
      const em = newEntityManager();
      // Given we give u2 a new child
      const u2 = await em.load(User, "u:2");
      const u3 = newUser(em, { name: "u3" });
      u2.children.add(u3);
      // When we load u1.childrenRecursive
      const u1 = await em.load(User, "u:1", "childrenRecursive");
      // Then we see the new, unsaved child
      expect(u1.childrenRecursive.get).toMatchEntity([{ name: "u2" }, { name: "u3" }]);
    });

    it("detects wip cycles", async () => {
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertUser({ name: "u3" });
      await insertUserToParent({ child_id: 2, parent_id: 1 });
      await insertUserToParent({ child_id: 3, parent_id: 2 });
      const em = newEntityManager();
      // Given we make u1 a child of u3 (creating a cycle)
      const [u1, u3] = await em.loadAll(User, ["u:1", "u:3"]);
      u3.children.add(u1);
      // When we load u1.childrenRecursive, we expect it to throw
      await expect(u1.childrenRecursive.load()).rejects.toThrow(RecursiveCycleError);
      try {
        await u1.childrenRecursive.load();
      } catch (e: any) {
        expect(e.message).toBe("Cycle detected in User:1.childrenRecursive");
      }
    });

    it("detects persisted cycles", async () => {
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertUser({ name: "u3" });
      await insertUserToParent({ child_id: 2, parent_id: 1 });
      await insertUserToParent({ child_id: 3, parent_id: 2 });
      await insertUserToParent({ child_id: 1, parent_id: 3 });
      const em = newEntityManager();
      await expect(em.load(User, "u:1", "childrenRecursive")).rejects.toThrow(RecursiveCycleError);
    });

    it("works on new instance", async () => {
      const em = newEntityManager();
      const u1 = newUser(em);
      expect(await u1.childrenRecursive.load()).toMatchEntity([]);
    });

    it("works on child is new instance", async () => {
      await insertUser({ name: "u1" });
      const em = newEntityManager();
      const u2 = newUser(em);
      const u1 = await em.load(User, "u:1");
      u1.children.add(u2);
      expect(await u1.childrenRecursive.load()).toMatchEntity([u2]);
    });

    it("is loaded on new entities", async () => {
      const em = newEntityManager();
      const u1 = em.create(User, { name: "u1", email: "u1@test.com" });
      expect(u1.childrenRecursive.get).toMatchEntity([]);
    });

    it("can use withLoaded", async () => {
      const em = newEntityManager();
      const u = newUser(em);
      const { childrenRecursive } = withLoaded(u);
      expect(childrenRecursive).toMatchEntity([]);
    });

    it("can refresh after new children are inserted", async () => {
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertUserToParent({ child_id: 2, parent_id: 1 });
      const em = newEntityManager();
      const u1 = await em.load(User, "u:1", "childrenRecursive");
      expect(u1.childrenRecursive.get).toMatchEntity([{ name: "u2" }]);
      // Insert new grandchildren via raw SQL
      await insertUser({ name: "u3" });
      await insertUserToParent({ child_id: 3, parent_id: 2 });
      await em.refresh();
      expect(u1.childrenRecursive.get).toMatchEntity([{ name: "u2" }, { name: "u3" }]);
    });

    it("can load both directions on the same entity", async () => {
      // u1 -> u2 -> u3
      await insertUser({ name: "u1" });
      await insertUser({ name: "u2" });
      await insertUser({ name: "u3" });
      await insertUserToParent({ child_id: 2, parent_id: 1 });
      await insertUserToParent({ child_id: 3, parent_id: 2 });
      const em = newEntityManager();
      const u2 = await em.load(User, "u:2", { parentsRecursive: {}, childrenRecursive: {} });
      expect(u2.parentsRecursive.get).toMatchEntity([{ name: "u1" }]);
      expect(u2.childrenRecursive.get).toMatchEntity([{ name: "u3" }]);
    });
  });
});
