import { insertAuthor } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
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
  });
});
