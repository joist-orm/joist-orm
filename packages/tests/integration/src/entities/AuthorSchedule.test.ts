import { Author, AuthorSchedule, newAuthor, newAuthorSchedule } from "../entities";
import { newEntityManager } from "../testEm";
import { select } from "./inserts";

describe("AuthorSchedule", () => {
  describe("commit rules", () => {
    it("runs a commit rule whose em.find sees the just-flushed siblings", async () => {
      const em = newEntityManager();
      // Create an author + 3 schedules in a single flush; the commit rule's `em.find` runs *after* the
      // 3 INSERTs have hit the db (but before COMMIT), so it sees all 3 and rejects.
      const author = newAuthor(em);
      const schedules = [
        em.create(AuthorSchedule, { author }),
        em.create(AuthorSchedule, { author }),
        em.create(AuthorSchedule, { author }),
      ];
      await expect(em.flush()).rejects.toThrow("An author cannot have more than 2 schedules");
      // The commit rule saw the changed (post-flush) state: all 3 sibling rows...
      expect(schedules[0].transientFields.commitRuleFindCount).toBe(3);
      // ...hydrated back to the same in-memory instances (not duplicates).
      expect(schedules[0].transientFields.commitRuleFoundSelf).toBe(true);
      // And because the commit rule threw before COMMIT, the transaction rolled back.
      expect(await select("author_schedules")).toMatchObject([]);
    });

    it("bars a regular validation rule from calling em.find", async () => {
      const em = newEntityManager();
      const schedule = newAuthorSchedule(em);
      // Opt the regular rule into attempting an `em.find`, which Joist should reject.
      schedule.transientFields.tryFindInRegularRule = true;
      await expect(em.flush()).rejects.toThrow(
        "em.find cannot be called from a validation rule (added via config.addRule)",
      );
    });

    it("allows a flush that stays within the commit rule's limit", async () => {
      const em = newEntityManager();
      const author = newAuthor(em);
      em.create(AuthorSchedule, { author });
      em.create(AuthorSchedule, { author });
      await em.flush();
      expect(await select("author_schedules")).toMatchObject([{ id: 1 }, { id: 2 }]);
    });

    it("sees previously-committed rows plus the newly-flushed row", async () => {
      const em1 = newEntityManager();
      const author = newAuthor(em1);
      em1.create(AuthorSchedule, { author });
      em1.create(AuthorSchedule, { author });
      await em1.flush();

      // A second flush adds a 3rd schedule; the commit rule's `em.find` sees the 2 committed rows
      // plus the 1 just-flushed row = 3, and rejects.
      const em2 = newEntityManager();
      const author2 = await em2.load(Author, author.idTagged);
      const schedule = em2.create(AuthorSchedule, { author: author2 });
      await expect(em2.flush()).rejects.toThrow("An author cannot have more than 2 schedules");
      expect(schedule.transientFields.commitRuleFindCount).toBe(3);
      expect(await select("author_schedules")).toMatchObject([{ id: 1 }, { id: 2 }]);
    });
  });

  describe("delete rules", () => {
    it("runs an addDeleteRule only when the entity is deleted", async () => {
      const em = newEntityManager();
      const schedule = newAuthorSchedule(em);
      await em.flush();
      expect(schedule.transientFields.deleteRuleRuns).toBe(0);

      schedule.transientFields.preventDelete = true;
      em.delete(schedule);
      await expect(em.flush()).rejects.toThrow("This schedule cannot be deleted");
      expect(schedule.transientFields.deleteRuleRuns).toBe(1);
      expect(await select("author_schedules")).toMatchObject([{ id: 1 }]);
    });

    it("bars an addDeleteRule from calling em.find", async () => {
      const em = newEntityManager();
      const schedule = newAuthorSchedule(em);
      await em.flush();

      schedule.transientFields.tryFindInDeleteRule = true;
      em.delete(schedule);
      await expect(em.flush()).rejects.toThrow(
        "em.find cannot be called from a validation rule (added via config.addDeleteRule)",
      );
    });

    it("allows an addCommitDeleteRule to query the just-flushed transaction state", async () => {
      const em1 = newEntityManager();
      const author = newAuthor(em1);
      const deleted = em1.create(AuthorSchedule, { author, overview: "deleted" });
      em1.create(AuthorSchedule, { author, overview: "kept" });
      await em1.flush();

      const em2 = newEntityManager();
      const author2 = await em2.load(Author, author.idTagged);
      const deleted2 = await em2.load(AuthorSchedule, deleted.idTagged);
      em2.create(AuthorSchedule, { author: author2, overview: "replacement" });
      deleted2.transientFields.preventDeleteAtCommit = true;
      em2.delete(deleted2);

      await expect(em2.flush()).rejects.toThrow("This schedule cannot be deleted at commit");
      expect(deleted2.transientFields.commitDeleteRuleFindOverviews).toEqual(["kept", "replacement"]);
      expect(deleted2.transientFields.commitDeleteRuleFoundSelf).toBe(false);
      expect(await select("author_schedules")).toMatchObject([
        { id: 1, overview: "deleted" },
        { id: 2, overview: "kept" },
      ]);
    });
  });
});
