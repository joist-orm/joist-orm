import { insertAuthor } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
import { RecursiveCycleError } from "joist-orm";
import { Author, newAuthor } from "../entities";

describe("RecursiveRelations", () => {
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
      a1.mentor.set(newAuthor(em, { firstName: "a0" }));
      // When we later load a3.mentorsRecursive
      const a3 = await em.load(Author, "a:3", "mentorsRecursive");
      // Then we see the new, unsaved mentor
      expect(a3.mentorsRecursive.get).toMatchEntity([{ firstName: "a2" }, { firstName: "a1" }, { firstName: "a0" }]);
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
        expect(e.entities).toMatchEntity([a3, { firstName: "a2" }, a1, a3]);
      }
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
        expect(e.entities).toMatchEntity([a1, { firstName: "a2" }, a3, a1]);
      }
    });
  });
});
