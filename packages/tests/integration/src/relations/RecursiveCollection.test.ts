import { insertAuthor, insertBook, update } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
import { RecursiveCycleError } from "joist-orm";
import { Author, Book, newAuthor, newBook } from "../entities";

describe("RecursiveCollection", () => {
  describe("parents", () => {
    it("can load recursive levels of mentors", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3", mentor_id: 2 });
      const em = newEntityManager();
      const a3 = await em.load(Author, "a:3", "mentorsRecursive");
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

    it("is loaded on new entities", async () => {
      const em = newEntityManager();
      const a1 = em.create(Author, { firstName: "a1" });
      expect(a1.mentorsRecursive.isLoaded).toBe(true);
      expect(a1.mentorsRecursive.get).toMatchEntity([]);
    });

    it("can em.refresh that deletes a parent", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      const em = newEntityManager();
      const [a1, a2] = await em.find(Author, {});
      em.delete(a1);
      await em.flush();
      await em.refresh();
      expect(a1.isDeletedEntity).toBe(true);
      expect(a2.isDeletedEntity).toBe(false);
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
  });
});
