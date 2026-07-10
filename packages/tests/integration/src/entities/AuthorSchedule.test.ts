import { Author, AuthorSchedule, newAuthor, newAuthorSchedule } from "../entities";
import { select } from "./inserts";
import { newEntityManager } from "../testEm";

describe("AuthorSchedule flush rules", () => {
  it("runs a flush rule whose em.find sees the just-flushed siblings", async () => {
    const em = newEntityManager();
    // Create an author + 3 schedules in a single flush; the flush rule's `em.find` runs *after* the
    // 3 INSERTs have hit the db (but before COMMIT), so it sees all 3 and rejects.
    const author = newAuthor(em);
    const schedules = [
      em.create(AuthorSchedule, { author }),
      em.create(AuthorSchedule, { author }),
      em.create(AuthorSchedule, { author }),
    ];
    await expect(em.flush()).rejects.toThrow("An author cannot have more than 2 schedules");
    // The flush rule saw the changed (post-flush) state: all 3 sibling rows...
    expect(schedules[0].transientFields.flushRuleFindCount).toBe(3);
    // ...hydrated back to the same in-memory instances (not duplicates).
    expect(schedules[0].transientFields.flushRuleFoundSelf).toBe(true);
    // And because the flush rule threw before COMMIT, the transaction rolled back.
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

  it("allows a flush that stays within the flush rule's limit", async () => {
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

    // A second flush adds a 3rd schedule; the flush rule's `em.find` sees the 2 committed rows
    // plus the 1 just-flushed row = 3, and rejects.
    const em2 = newEntityManager();
    const author2 = await em2.load(Author, author.idTagged);
    const schedule = em2.create(AuthorSchedule, { author: author2 });
    await expect(em2.flush()).rejects.toThrow("An author cannot have more than 2 schedules");
    expect(schedule.transientFields.flushRuleFindCount).toBe(3);
    expect(await select("author_schedules")).toMatchObject([{ id: 1 }, { id: 2 }]);
  });
});
