import { insertAuthor } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
import { Author } from "../entities";

describe("RecursiveRelations", () => {
  describe("parents", () => {
    it("can load recursive levels of mentors", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3", mentor_id: 2 });
      const em = newEntityManager();
      const a1 = await em.load(Author, "a:3", "mentorRecursive");
      expect(a1.mentorRecursive.get).toMatchEntity([{ firstName: "a2" }, { firstName: "a1" }]);
    });
  });
});
