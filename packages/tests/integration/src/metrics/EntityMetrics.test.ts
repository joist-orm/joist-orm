import { EntityMetrics, type EvaluationStats } from "joist-orm";
import {
  AdvanceStatus,
  Author,
  Publisher,
  PublisherStatus,
  authorConfig,
  authorScheduleConfig,
  newAuthor,
  newAuthorSchedule,
  newBook,
  newBookAdvance,
  newLargePublisher,
  newSmallPublisher,
  publisherConfig,
} from "src/entities";
import { insertAuthor, insertBook, insertPublisher } from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

describe("EntityMetrics", () => {
  afterEach(() => jest.restoreAllMocks());

  describe("reactive fields", () => {
    it("counts actual reactive field evaluations, not cached reads", () => {
      // Given a request collecting an author's calculations
      const em = newEntityManager();
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      const author = newAuthor(em);
      // And each clock tick advances by one millisecond
      let now = 0;
      jest.spyOn(performance, "now").mockImplementation(() => now++);
      // When the same calculated value is read repeatedly
      void author.numberOfBooks.get;
      void author.numberOfBooks.get;
      void author.numberOfBooks.get;
      // Then only the first read evaluates the callback
      expect(evaluation(metrics, "numberOfBooks")).toEqual({
        name: "Author.numberOfBooks",
        count: 1,
        totalMillis: 1,
      });
    });

    it("does not count stored reactive field values as calculations", async () => {
      // Given a stored author whose books have not been loaded
      await insertAuthor({ first_name: "a1", number_of_books: 7 });
      const em = newEntityManager();
      const author = await em.load(Author, "a:1");
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      // When the materialized book count is read
      void author.numberOfBooks.get;
      // Then the callback did not run
      expect(metrics.snapshot()).toEqual({ evaluations: [] });
    });

    it("excludes prerequisite population from reactive field timings", async () => {
      // Given an author whose book collection still needs to be loaded
      await insertAuthor({ first_name: "a1" });
      await insertBook({ author_id: 1, title: "book" });
      const em = newEntityManager();
      const author = await em.load(Author, "a:1");
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      // And the clock can advance while dependencies load
      let now = 10;
      jest.spyOn(performance, "now").mockImplementation(() => now);
      // When time passes while dependencies load, before the callback runs
      const count = author.numberOfBooks.load();
      now = 25;
      await count;
      // Then the dependency-loading interval is not charged to the calculation
      expect(evaluation(metrics, "numberOfBooks")).toEqual({
        name: "Author.numberOfBooks",
        count: 1,
        totalMillis: 0,
      });
    });

    it("counts explicit async reactive field calculations, not stored reads", async () => {
      // Given a stored publisher with a database-backed reactive field
      await insertPublisher({ name: "p1", number_of_book_reviews: 0 });
      const em = newEntityManager();
      const publisher = await em.load(Publisher, "p:1");
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      // And each clock tick advances by one millisecond
      let now = 0;
      jest.spyOn(performance, "now").mockImplementation(() => now++);
      // When the request explicitly calculates the value, then reads it twice
      await Promise.all([publisher.numberOfBookReviews.load(), publisher.numberOfBookReviews.load()]);
      void publisher.numberOfBookReviews.get;
      void publisher.numberOfBookReviews.get;
      // Then only the actual asynchronous callback is counted
      expect(evaluation(metrics, "numberOfBookReviews", "SmallPublisher")).toEqual({
        name: "SmallPublisher.numberOfBookReviews",
        count: 1,
        totalMillis: 1,
      });
    });

    it("records rejected async reactive field callbacks", async () => {
      // Given a new publisher whose count query cannot access an id yet
      const em = newEntityManager();
      const publisher = newSmallPublisher(em);
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      // When its database-backed calculation fails before persistence
      await expect(publisher.numberOfBookReviews.load()).rejects.toThrow();
      // Then the attempted callback was still recorded
      expect(evaluation(metrics, "numberOfBookReviews", "SmallPublisher")?.count).toBe(1);
    });
  });

  describe("collector behavior", () => {
    it("aggregates multiple instances by entity type and member", () => {
      // Given two authors in the same request
      const em = newEntityManager();
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      const first = newAuthor(em);
      const second = newAuthor(em);
      // And each clock tick advances by one millisecond
      let now = 0;
      jest.spyOn(performance, "now").mockImplementation(() => now++);
      // When both authors calculate their book counts
      void first.numberOfBooks.get;
      void second.numberOfBooks.get;
      // Then they contribute to one aggregate
      expect(evaluation(metrics, "numberOfBooks")).toEqual({
        name: "Author.numberOfBooks",
        count: 2,
        totalMillis: 2,
      });
    });

    it("retains totals across multiple flushes", async () => {
      // Given a request with an author to persist
      const em = newEntityManager();
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      const author = newAuthor(em);
      // When the author is first persisted
      await em.flush();
      // Then the initial calculation is included in the request total
      expect(evaluation(metrics, "numberOfBooks")?.count).toBe(1);
      // When a book is added and flushed in the same request
      newBook(em, { author });
      await em.flush();
      // Then the request total includes the second calculation without resetting
      expect(evaluation(metrics, "numberOfBooks")?.count).toBe(2);
    });

    it("shares a request collector across EntityManagers", () => {
      // Given two EntityManagers attached to one request collector
      const metrics = new EntityMetrics();
      const first = newEntityManager();
      first.setMetrics(metrics);
      const second = newEntityManager();
      second.setMetrics(metrics);
      // When each EntityManager calculates an author's book count
      void newAuthor(first).numberOfBooks.get;
      void newAuthor(second).numberOfBooks.get;
      // Then both evaluations are retained
      expect(evaluation(metrics, "numberOfBooks")?.count).toBe(2);
    });

    it("isolates concurrent requests", async () => {
      // Given two requests with independent collectors
      const first = newEntityManager();
      const firstMetrics = new EntityMetrics();
      first.setMetrics(firstMetrics);
      const second = newEntityManager();
      const secondMetrics = new EntityMetrics();
      second.setMetrics(secondMetrics);
      // When their method calls overlap
      await Promise.all([newAuthor(first).booksTitles.load(), newAuthor(second).booksWithTitle.load("book")]);
      // Then the first request does not contain the second request's method
      expect(firstMetrics.snapshot().evaluations.map((e) => e.name)).toEqual(["Author.booksTitles"]);
    });

    it("returns detached snapshots without resetting the collector", () => {
      // Given a snapshot taken after one calculation
      const em = newEntityManager();
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      const author = newAuthor(em);
      // And each clock tick advances by one millisecond
      let now = 0;
      jest.spyOn(performance, "now").mockImplementation(() => now++);
      void author.numberOfBooks.get;
      const snapshot = metrics.snapshot();
      // When a changed dependency causes another calculation
      author.firstName = "Changed";
      void author.numberOfBooks.get;
      // Then the previous snapshot still contains the original totals
      expect(snapshot.evaluations).toEqual([{ name: "Author.numberOfBooks", count: 1, totalMillis: 1 }]);
    });

    it("does not read the clock when metrics are disabled", async () => {
      // Given an author without a metrics collector
      const em = newEntityManager();
      const author = newAuthor(em);
      // And a schedule whose commit rule queries the database
      const schedule = newAuthorSchedule(em, { author });
      // And reading the clock would fail the request
      jest.spyOn(performance, "now").mockImplementation(() => {
        throw new Error("Unexpected timing");
      });
      // When fields, methods, validation rules, and commit rules run
      void author.numberOfBooks.get;
      void author.booksTitles.call();
      void author.booksWithTitle.call("book");
      await em.flush();
      // Then the callbacks still return normally without timing
      expect(schedule.transientFields.commitRuleFindCount).toBe(1);
    });

    it("keeps shared field definitions isolated when requests interleave", () => {
      // Given two requests evaluating the same reactive-field definition
      const first = newEntityManager();
      const firstMetrics = new EntityMetrics();
      first.setMetrics(firstMetrics);
      const firstAuthor = newAuthor(first);
      // And a second request has its own collector and author
      const second = newEntityManager();
      second.setMetrics(new EntityMetrics());
      const secondAuthor = newAuthor(second);
      // When the shared definition alternates between the two requests
      void firstAuthor.numberOfBooks.get;
      void secondAuthor.numberOfBooks.get;
      firstAuthor.firstName = "Changed";
      void firstAuthor.numberOfBooks.get;
      // Then the first request retains only its own callback executions
      expect(evaluation(firstMetrics, "numberOfBooks")?.count).toBe(2);
    });

    it("resumes the right totals when an EntityManager changes collectors", () => {
      // Given an author's first calculation collected for one request
      const em = newEntityManager();
      const author = newAuthor(em);
      const firstMetrics = new EntityMetrics();
      em.setMetrics(firstMetrics);
      void author.numberOfBooks.get;
      // And a later calculation belongs to a different collector
      em.setMetrics(new EntityMetrics());
      author.firstName = "Second request";
      void author.numberOfBooks.get;
      // When the original collector is reattached
      em.setMetrics(firstMetrics);
      author.firstName = "First request again";
      void author.numberOfBooks.get;
      // Then its original counter is resumed rather than replaced or combined
      expect(evaluation(firstMetrics, "numberOfBooks")?.count).toBe(2);
    });
  });

  describe("AsyncMethods", () => {
    it("counts method load and call once each, but not populate-only loading", async () => {
      // Given an author whose methods have not been populated
      await insertAuthor({ first_name: "a1" });
      await insertBook({ author_id: 1, title: "book" });
      const em = newEntityManager();
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      const author = await em.load(Author, "a:1", ["booksTitles", "booksWithTitle"]);
      // And each clock tick advances by one millisecond
      let now = 0;
      jest.spyOn(performance, "now").mockImplementation(() => now++);
      // When both methods are explicitly invoked through load and call
      await author.booksTitles.load();
      author.booksTitles.call();
      await author.booksWithTitle.load("book");
      author.booksWithTitle.call("book");
      // Then each callback ran exactly twice and retained synchronous call results
      expect(metrics.snapshot().evaluations).toEqual([
        { name: "Author.booksTitles", count: 2, totalMillis: 2 },
        { name: "Author.booksWithTitle", count: 2, totalMillis: 2 },
      ]);
    });

    it("records synchronous callback failures without replacing the error", () => {
      // Given a loaded method with an invalid title argument
      const em = newEntityManager();
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      const author = newAuthor(em);
      // And each clock tick advances by one millisecond
      let now = 0;
      jest.spyOn(performance, "now").mockImplementation(() => now++);
      // When the title callback throws its original error
      expect(() => author.booksWithTitle.call(null!)).toThrow(TypeError);
      // Then the failed attempt contributes to the totals
      expect(evaluation(metrics, "booksWithTitle")).toEqual({
        name: "Author.booksWithTitle",
        count: 1,
        totalMillis: 1,
      });
    });

    it("times promise-returning methods through settlement", async () => {
      // Given a stored author with a database-backed method
      await insertAuthor({ first_name: "a1" });
      await insertBook({ author_id: 1, title: "book" });
      const em = newEntityManager();
      const author = await em.load(Author, "a:1", "persistedBookCount");
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      // And the clock can advance while the callback's query runs
      let now = 10;
      jest.spyOn(performance, "now").mockImplementation(() => now);
      // When the callback starts a query and the clock advances before it completes
      const count = author.persistedBookCount.call();
      now = 25;
      await count;
      // Then elapsed time includes awaiting the callback's promise
      expect(evaluation(metrics, "persistedBookCount")).toEqual({
        name: "Author.persistedBookCount",
        count: 1,
        totalMillis: 15,
      });
    });

    it("keeps independent start times for overlapping calls sharing one member counter", async () => {
      // Given two persisted authors whose async methods share the same request counter
      await insertAuthor({ id: 1, first_name: "First" });
      await insertAuthor({ id: 2, first_name: "Second" });
      const em = newEntityManager();
      const first = await em.load(Author, "a:1", "persistedBookCount");
      const second = await em.load(Author, "a:2", "persistedBookCount");
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      // And the calls start at different times before their queries settle
      let now = 10;
      jest.spyOn(performance, "now").mockImplementation(() => now);

      // When both callbacks finish at 25 milliseconds
      const firstCount = first.persistedBookCount.call();
      now = 20;
      const secondCount = second.persistedBookCount.call();
      now = 25;
      await Promise.all([firstCount, secondCount]);

      // Then the shared counter sums both independent elapsed intervals
      expect(evaluation(metrics, "persistedBookCount")).toEqual({
        name: "Author.persistedBookCount",
        count: 2,
        totalMillis: 20,
      });
    });
  });

  describe("validation rules", () => {
    it("aggregates simple validation callbacks across flushes using their registration names", async () => {
      // Given an author with a non-reactive validation rule
      const em = newEntityManager();
      const author = newAuthor(em);
      const rule = authorConfig.__data.rules.find(
        (r) => r.hint === undefined && r.name.startsWith("addRule(Author.ts:"),
      )!;
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      // When the author is validated in two flushes
      await em.flush();
      author.firstName = "Changed";
      await em.flush();
      // Then both callback executions use the existing rule location
      expect(evaluation(metrics, rule.name)?.count).toBe(2);
    });

    it("counts a reactive validation once when multiple changed dependencies trigger it", async () => {
      // Given a stored author and book with a validation depending on both names
      const em = newEntityManager();
      const author = newAuthor(em);
      const book = newBook(em, { author });
      await em.flush();
      const rule = authorConfig.__data.rules.find(
        (r) => typeof r.hint === "object" && r.hint !== null && "firstName" in r.hint && "books" in r.hint,
      )!;
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      // When both dependencies change before one flush
      author.firstName = "Changed author";
      book.title = "Changed book";
      await em.flush();
      // Then dependency discovery still results in only one callback execution
      expect(evaluation(metrics, rule.name)?.count).toBe(1);
    });

    it("retains validation metrics when a flush fails validation", async () => {
      // Given an author rejected by its first non-reactive rule
      const em = newEntityManager();
      newAuthor(em, { firstName: "Same", lastName: "Same" });
      const rule = authorConfig.__data.rules.find(
        (r) => r.hint === undefined && r.name.startsWith("addRule(Author.ts:"),
      )!;
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      // When validation rejects the flush
      await expect(em.flush()).rejects.toThrow("firstName and lastName must be different");
      // Then the failed validation remains available for request-end publishing
      expect(evaluation(metrics, rule.name)?.count).toBe(1);
    });

    it("collects asynchronous commit rules using their registration names", async () => {
      // Given a schedule whose invariant runs after database writes
      const em = newEntityManager();
      newAuthorSchedule(em);
      const rule = authorScheduleConfig.__data.commitRules[0];
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      // When the request flushes the schedule and validates its siblings
      await em.flush();
      // Then the commit callback is included with its distinct registration prefix
      expect(evaluation(metrics, rule.name, "AuthorSchedule")).toMatchObject({
        name: `AuthorSchedule.${rule.name}`,
        count: 1,
      });
    });

    it("records rejected validation promises through settlement", async () => {
      // Given a regular rule that attempts an illegal pre-flush query
      const em = newEntityManager();
      const schedule = newAuthorSchedule(em);
      schedule.transientFields.tryFindInRegularRule = true;
      const rule = authorScheduleConfig.__data.rules.find((r) => r.name.startsWith("addRule(AuthorSchedule.ts:"))!;
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      // And each clock tick advances by one millisecond
      let now = 0;
      jest.spyOn(performance, "now").mockImplementation(() => now++);
      // When the callback's query promise rejects
      await expect(em.flush()).rejects.toThrow();
      // Then the rejected asynchronous evaluation still accumulates elapsed time
      expect(evaluation(metrics, rule.name, "AuthorSchedule")?.totalMillis).toBeGreaterThan(0);
    });

    it("prepares inherited simple-rule names for each concrete entity type", async () => {
      // Given publisher subtypes sharing a non-reactive base-type validation rule
      const em = newEntityManager();
      newSmallPublisher(em, { authors: [{ firstName: "Small" }] });
      newLargePublisher(em, { authors: [{ firstName: "Large" }] });
      const rule = publisherConfig.__data.rules.find(
        (r) => r.hint === undefined && r.name.startsWith("addRule(Publisher.ts:"),
      )!;
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      // When both concrete types validate their inherited rule
      await em.flush();
      // Then their prepared slots already have separate names
      expect(
        metrics
          .snapshot()
          .evaluations.filter((stat) => stat.name.endsWith(`.${rule.name}`))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ).toMatchObject([
        { name: `LargePublisher.${rule.name}`, count: 1 },
        { name: `SmallPublisher.${rule.name}`, count: 1 },
      ]);
    });
  });

  describe("reactions", () => {
    it("collects named reactions across multiple flushes", async () => {
      // Given an author whose name changes trigger a named reaction
      const em = newEntityManager();
      const author = newAuthor(em);
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      // And each clock tick advances by one millisecond
      let now = 0;
      jest.spyOn(performance, "now").mockImplementation(() => now++);
      // When the author is created and then renamed in a second flush
      await em.flush();
      author.firstName = "Changed";
      await em.flush();
      // Then both reaction callbacks contribute their own elapsed time
      expect(evaluation(metrics, "direct")).toEqual({
        name: "Author.direct",
        count: 2,
        totalMillis: 2,
      });
    });

    it("uses the registration location for unnamed reactions", async () => {
      // Given an author with an unnamed reaction on ssn
      const em = newEntityManager();
      newAuthor(em);
      const reaction = authorConfig.__data.reactions.find((r) => r.hint === "ssn")!;
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      // When the author's creation triggers the reaction
      await em.flush();
      // Then its existing source location identifies the callback
      expect(evaluation(metrics, reaction.name)?.count).toBe(1);
    });

    it("counts runOnce reaction callbacks once per flush, not once per request", async () => {
      // Given an author whose runOnce reaction fills empty nicknames
      const em = newEntityManager();
      const author = newAuthor(em, { nickNames: [] });
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      // When the reaction changes its own dependency in each of two flushes
      await em.flush();
      author.nickNames = [];
      await em.flush();
      // Then only actual callback executions are counted
      expect(evaluation(metrics, "runOnce")?.count).toBe(2);
    });

    it("collects hinted transition-reaction callbacks", async () => {
      // Given a persisted advance with a signature reaction that loads its book
      const em = newEntityManager();
      const advance = newBookAdvance(em);
      await em.flush();
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      // And each clock tick advances by one millisecond
      let now = 0;
      jest.spyOn(performance, "now").mockImplementation(() => now++);
      // When signing the advance triggers the matching reaction
      advance.status = AdvanceStatus.Signed;
      await em.flush();
      // Then only the callback contributes to the reaction timing
      expect(evaluation(metrics, "observeSignature", "BookAdvance")).toEqual({
        name: "BookAdvance.observeSignature",
        count: 1,
        totalMillis: 1,
      });
    });

    it("collects commit-phase transition reactions", async () => {
      // Given a signed advance whose payment reaction runs after writes
      const em = newEntityManager();
      const advance = newBookAdvance(em, { status: AdvanceStatus.Signed });
      await em.flush();
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      // And each clock tick advances by one millisecond
      let now = 0;
      jest.spyOn(performance, "now").mockImplementation(() => now++);
      // When the payment is flushed and its commit reaction runs
      advance.status = AdvanceStatus.Paid;
      await em.flush();
      // Then the commit callback is measured without its publisher population
      expect(evaluation(metrics, "countPaidCommit", "BookAdvance")).toEqual({
        name: "BookAdvance.countPaidCommit",
        count: 1,
        totalMillis: 1,
      });
    });

    it("separates inherited reaction totals by the actual entity type", async () => {
      // Given two publisher subtypes sharing their base type's reaction definition
      const em = newEntityManager();
      newSmallPublisher(em, { authors: [{ firstName: "Small" }] });
      newLargePublisher(em, { authors: [{ firstName: "Large" }] });
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      // When both subtypes run the shared reaction during the same flush
      await em.flush();
      // Then each concrete type retains its own counter
      expect(
        metrics
          .snapshot()
          .evaluations.filter((stat) => stat.name.endsWith(".logoColorsReaction"))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ).toMatchObject([
        { name: "LargePublisher.logoColorsReaction", count: 1 },
        { name: "SmallPublisher.logoColorsReaction", count: 1 },
      ]);
    });

    it("prepares inherited transition-reaction names for each concrete entity type", async () => {
      // Given persisted publisher subtypes sharing their base type's status reaction
      const em = newEntityManager();
      const small = newSmallPublisher(em, { status: PublisherStatus.Draft, authors: [{ firstName: "Small" }] });
      const large = newLargePublisher(em, { status: PublisherStatus.Draft, authors: [{ firstName: "Large" }] });
      await em.flush();
      const metrics = new EntityMetrics();
      em.setMetrics(metrics);
      // When both publishers activate and trigger the inherited status reaction
      small.status = PublisherStatus.Active;
      large.status = PublisherStatus.Active;
      await em.flush();
      // Then transition metadata supplies a separately named slot for each type
      expect(
        metrics
          .snapshot()
          .evaluations.filter((stat) => stat.name.endsWith(".recordPublisherStatus"))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ).toMatchObject([
        { name: "LargePublisher.recordPublisherStatus", count: 1 },
        { name: "SmallPublisher.recordPublisherStatus", count: 1 },
      ]);
    });
  });
});

/** Finds one entity type/member aggregate without depending on snapshot ordering. */
function evaluation(metrics: EntityMetrics, member: string, entity = "Author"): EvaluationStats | undefined {
  const name = `${entity}.${member}`;
  return metrics.snapshot().evaluations.find((e) => e.name === name);
}
