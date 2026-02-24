import { insertAuthor, insertBook, insertBookReview, select, update } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
import { BookReview } from "../entities";

/**
 * These tests demonstrate that `ReactiveField.get` has a side effect: when the dependency
 * subgraph happens to be loaded in the EntityManager, `.get` recalculates the value and
 * calls `setField`, making the entity dirty — even though the caller only intended to READ.
 *
 * When `isLoaded` is true (deps happen to be in memory), `.get` recalculates AND calls
 * `setField`, which:
 *   1. Marks the entity as dirty
 *   2. Triggers `pluginManager.beforeSetField` (which can throw in plugins like AggregateVersionPlugin)
 *   3. Queues downstream reactables
 */
describe("ReactiveField.get side effects", () => {
  it("recalculates and dirties entity when deps are loaded before first .get call", async () => {
    // Given a BookReview where the DB-stored `is_public` is stale.
    // Setup: author age=25, graduated → isPublic formula returns true
    await insertAuthor({ first_name: "a1", age: 25, graduated: new Date() });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ book_id: 1, rating: 1, is_public: true });

    // Now make the author underage directly in the DB, bypassing Joist's reactivity.
    // The BookReview's `is_public` column is now STALE (DB says true, formula says false).
    await update("authors", { id: 1, age: 18 });

    const em = newEntityManager();
    const br = await em.load(BookReview, "br:1");

    // When the dependency subgraph is loaded BEFORE the first .get call
    // (simulating other GraphQL resolvers loading related entities)
    await em.populate(br, { book: { author: {} }, comment: {} });

    // Then .get recalculates and returns the FRESH value (not the stale DB value)
    expect(br.isPublic.get).toBe(false);

    // And the entity is dirty — a side effect of a getter!
    expect(br.isDirtyEntity).toBe(true);
    expect(br.changes.isPublic.hasChanged).toBe(true);

    // But the DB still has the stale value (no flush was called)
    expect((await select("book_reviews"))[0].is_public).toBe(true);
  });

  it("returns stale DB value when deps are NOT loaded", async () => {
    // Given the same stale data setup
    await insertAuthor({ first_name: "a1", age: 25, graduated: new Date() });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ book_id: 1, rating: 1, is_public: true });
    await update("authors", { id: 1, age: 18 });

    const em = newEntityManager();
    const br = await em.load(BookReview, "br:1");

    // When .get is called WITHOUT loading the dependency subgraph
    // Then it returns the stale DB value
    expect(br.isPublic.get).toBe(true);

    // And the entity is NOT dirty
    expect(br.isDirtyEntity).toBe(false);
  });

  it("same data produces different .get results depending on load order", async () => {
    // Given a BookReview where the DB `is_public` is stale
    await insertAuthor({ first_name: "a1", age: 25, graduated: new Date() });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ book_id: 1, rating: 1, is_public: true });
    await update("authors", { id: 1, age: 18 });

    // Scenario A: Load deps first, then call .get
    {
      const em = newEntityManager();
      const br = await em.load(BookReview, "br:1");
      await em.populate(br, { book: { author: {} }, comment: {} });
      // .get returns the recalculated value
      expect(br.isPublic.get).toBe(false);
      expect(br.isDirtyEntity).toBe(true);
    }

    // Scenario B: Call .get first (caches stale value), then load deps
    {
      const em = newEntityManager();
      const br = await em.load(BookReview, "br:1");
      // .get returns the stale DB value (deps not loaded)
      expect(br.isPublic.get).toBe(true);
      expect(br.isDirtyEntity).toBe(false);
      // Even after loading deps, .get still returns the cached stale value
      await em.populate(br, { book: { author: {} }, comment: {} });
      expect(br.isPublic.get).toBe(true);
      expect(br.isDirtyEntity).toBe(false);
    }

    // Both scenarios read the SAME data from the SAME database,
    // but .get produces different results (false vs true) and
    // different dirty state (dirty vs clean) based solely on load order.
  });
});
