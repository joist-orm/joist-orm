import { ReadDriftError, getField, isFieldSet, runInTrustedContext } from "joist-orm";
import { Author, AuthorSchedule, Book, PublisherStatus, SmallPublisher, newAuthor } from "src/entities";
import { insertAuthor, insertAuthorSchedule, insertBook, insertSmallPublisher } from "src/entities/inserts";
import {
  readDriftCollectionOptions,
  readDriftReactionOptions,
  readDriftRuleOptions,
} from "src/entities/readDriftOptions";
import { knex, newEntityManager, pool, queries, resetQueryCount } from "src/testEm";

describe("ReadDrift", () => {
  afterEach(() => {
    readDriftRuleOptions.assertUnchanged = false;
    readDriftReactionOptions.assertUnchanged = false;
    readDriftCollectionOptions.assertUnchanged = false;
  });

  it("batches read locks per table", async () => {
    // Given two persisted authors and a book
    await insertAuthor({ first_name: "a1" });
    // And a second author and a book belong to the read set
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const authors = await em.loadAll(Author, ["a:1", "a:2"]);
    const book = await em.load(Book, "b:1");
    // When the read set contains duplicates across two tables
    em.assertUnchanged([...authors, book, authors[0]]);
    resetQueryCount();
    await em.flush();
    // Then each table is locked exactly once, in id order
    expect(shareQueries()).toEqual([
      "SELECT id AS id, updated_at AS version FROM authors WHERE id = ANY($1) ORDER BY id FOR SHARE",
      "SELECT id AS id, updated_at AS version FROM books WHERE id = ANY($1) ORDER BY id FOR SHARE",
    ]);
  });

  it("does not persist book edits when an asserted author drifts", async () => {
    // Given a persisted book and a loaded author
    await insertAuthor({ first_name: "a1" });
    // And the author has a book with its original notes
    await insertBook({ title: "b1", author_id: 1, notes: "original" });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1", "author");
    // And another connection invalidates the author version
    await knex("authors").where("id", book.author.get.idUntagged).update({ updated_at: "2050-01-01" });
    // When a stale decision tries to change the book
    book.notes = "stale decision";
    em.assertUnchanged(book.author.get);
    await em.flush().catch(() => {});
    // Then the database retains the original book
    expect((await newEntityManager().load(Book, "b:1")).notes).toEqual("original");
  });

  it("reports deleted rows with tagged ids and expected versions", async () => {
    // Given a loaded author
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    // And another connection deletes the author
    await knex("authors").where("id", author.idUntagged).delete();
    // When we flush its assertion
    em.assertUnchanged(author);
    // Then the missing row is reported with the original timestamp
    await expect(em.flush()).rejects.toThrow(
      `Read drift: a:1 expected ${author.updatedAt.toISOString()}, actual deleted`,
    );
  });

  it("leaves asserted writes to oplocks", async () => {
    // Given a loaded author
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    // When the asserted author is also changed
    em.assertUnchanged(author);
    author.firstName = "changed";
    resetQueryCount();
    await em.flush();
    // Then no read-only lock is needed
    expect(shareQueries()).toEqual([]);
  });

  it("still rejects oplock collisions on asserted writes", async () => {
    // Given an asserted author with a pending edit
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    em.assertUnchanged(author);
    author.firstName = "changed";
    // And another writer invalidates its version
    await knex("authors").where("id", author.idUntagged).update({ updated_at: "2050-01-01" });
    // When we flush the author edit
    const flushed = em.flush();
    // Then the existing oplock detects the collision
    await expect(flushed).rejects.toThrow("Oplock failure for authors rows");
  });

  it("protects dependencies when an opted-in rule runs", async () => {
    // Given a book whose rule reads its author
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted book
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1", "author");
    readDriftRuleOptions.assertUnchanged = true;
    // And its loaded author changes in another connection
    await knex("authors").where("id", book.author.get.idUntagged).update({ updated_at: "2050-01-01" });
    // When notes trigger the rule
    book.notes = "trigger rule";
    // Then its stale author dependency is rejected
    await expect(em.flush()).rejects.toThrow(ReadDriftError);
  });

  it("does not protect dependencies without the opt-in", async () => {
    // Given a book with an ordinary rule reading its author
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted book
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1", "author");
    // And the author changes in another connection
    await knex("authors").where("id", book.author.get.idUntagged).update({ updated_at: "2050-01-01" });
    // When the unprotected rule runs
    book.notes = "ordinary rule";
    resetQueryCount();
    await em.flush();
    // Then no row locks were requested
    expect(shareQueries()).toEqual([]);
  });

  it("does not assert dependencies of rules that do not run", async () => {
    // Given an opted-in rule on book notes and author firstName
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted book
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1", "author");
    readDriftRuleOptions.assertUnchanged = true;
    // And its author changes outside this EM
    await knex("authors").where("id", book.author.get.idUntagged).update({ updated_at: "2050-01-01" });
    // When only the unrelated book order changes
    book.order = 99;
    resetQueryCount();
    await em.flush();
    // Then the rule contributes no assertions
    expect(shareQueries()).toEqual([]);
  });

  it("protects opted-in reaction dependencies", async () => {
    // Given a reaction on book notes that also reads its author
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted book
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1", "author");
    readDriftReactionOptions.assertUnchanged = true;
    // And its author changes in another connection
    await knex("authors").where("id", book.author.get.idUntagged).update({ updated_at: "2050-01-01" });
    // When notes trigger the reaction
    book.notes = "trigger reaction";
    // Then its stale author dependency is rejected
    await expect(em.flush()).rejects.toThrow(ReadDriftError);
  });

  it("clears the read set after a successful flush", async () => {
    // Given an asserted author whose first flush succeeds
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    em.assertUnchanged(author);
    await em.flush();
    // And the author subsequently changes
    await knex("authors").where("id", author.idUntagged).update({ updated_at: "2050-01-01" });
    // When we flush without asserting again
    resetQueryCount();
    await em.flush();
    // Then the previous assertion is not repeated
    expect(queries).toEqual([]);
  });

  it("ignores unsaved entities", async () => {
    // Given a new author
    const em = newEntityManager();
    const author = newAuthor(em);
    // When it is asserted and saved
    em.assertUnchanged(author);
    await em.flush();
    // Then no persisted version was checked
    expect(shareQueries()).toEqual([]);
  });

  it("holds the share lock until the surrounding transaction commits", async () => {
    // Given a persisted author and an independent writer
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    const writer = await pool.connect();
    try {
      // When the read assertion is flushed inside a still-open transaction
      await em.transaction(async () => {
        em.assertUnchanged(author);
        await em.flush();
        await writer.query("SET lock_timeout = '100ms'");
        // Then a non-key update cannot acquire its row lock before we commit
        await expect(
          writer.query("UPDATE authors SET updated_at = '2050-01-01' WHERE id = $1", [author.idUntagged]),
        ).rejects.toThrow("lock timeout");
      });
    } finally {
      await writer.query("RESET lock_timeout");
      writer.release();
    }
  });

  it("protects sibling rows reached through a reactive property's collection hint", async () => {
    // Given two books by the same author
    await insertAuthor({ first_name: "a1" });
    // And the author has two persisted books
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1", { author: "books" });
    readDriftCollectionOptions.assertUnchanged = true;
    // And a loaded sibling changes outside the EM
    await knex("books").where("id", 2).update({ updated_at: "2050-01-01" });
    // When title triggers the numberOfBooks2 rule through author.books
    book.title = "changed title";
    // Then the sibling's stale row version is rejected
    await expect(em.flush()).rejects.toThrow(ReadDriftError);
  });

  it("locks an unchanged author once while successfully writing its book", async () => {
    // Given a persisted book and author
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted book
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1", "author");
    // When a decision based on the unchanged author edits the book
    em.assertUnchanged(book.author.get);
    book.notes = "valid decision";
    resetQueryCount();
    await em.flush();
    // Then there is exactly one read-dependency locking query
    expect(shareQueries()).toEqual([
      "SELECT id AS id, updated_at AS version FROM authors WHERE id = ANY($1) ORDER BY id FOR SHARE",
    ]);
  });

  it("reports both loaded and current versions for an updated dependency", async () => {
    // Given a loaded author version
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    // And another connection changes the persisted version
    await knex("authors").where("id", author.idUntagged).update({ updated_at: "2050-01-01" });
    // When the loaded author is asserted
    em.assertUnchanged(author);
    // Then the diagnostic identifies the entity and both versions
    await expect(em.flush()).rejects.toThrow(
      `Read drift: a:1 expected ${author.updatedAt.toISOString()}, actual 2050-01-01T00:00:00.000Z`,
    );
  });

  it("uses the persisted version after this EM has already written the entity", async () => {
    // Given an existing author loaded into this EM
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    // And this EM successfully updates the author
    author.firstName = "new name";
    await em.flush();
    // When the author becomes a read-only dependency in a later flush
    em.assertUnchanged(author);
    // Then its last persisted version is accepted instead of the old hydration row
    await expect(em.flush()).resolves.toEqual([]);
  });

  it("queues later table checks without waiting for an earlier row lock", async () => {
    // Given an asserted book and author, registered in reverse table order
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted book
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1", "author");
    const author = book.author.get;
    em.assertUnchanged([book, author]);
    // And another transaction holds a conflicting lock on the author
    const writer = await pool.connect();
    try {
      await writer.query("BEGIN");
      await writer.query("SELECT id FROM authors WHERE id = $1 FOR UPDATE", [author.idUntagged]);
      // When the author's read lock times out during flush
      await em
        .transaction(async () => {
          await em.driver.executeQuery(em, "SET LOCAL lock_timeout = '100ms'", []);
          resetQueryCount();
          await em.flush();
        })
        .catch(() => {});
      // Then both checks were submitted in table order without waiting for the author query to finish
      expect(shareQueries()).toEqual([
        "SELECT id AS id, updated_at AS version FROM authors WHERE id = ANY($1) ORDER BY id FOR SHARE",
        "SELECT id AS id, updated_at AS version FROM books WHERE id = ANY($1) ORDER BY id FOR SHARE",
      ]);
    } finally {
      await writer.query("ROLLBACK");
      writer.release();
    }
  });

  it("batches repeated reads of a configured scalar getter", async () => {
    // Given a persisted schedule whose overview has field-level protection
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted draft schedule
    await insertAuthorSchedule({ author_id: 1, overview: "draft" });
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, "authorSchedule:1");
    // When application logic reads its overview repeatedly
    void parent.overview;
    void parent.overview;
    resetQueryCount();
    await em.flush();
    // Then the unchanged row is checked once inside the flush transaction
    expect(queries).toEqual([
      "BEGIN;",
      "SELECT id AS id, updated_at AS version FROM author_schedules WHERE id = ANY($1) ORDER BY id FOR SHARE",
      "COMMIT;",
    ]);
  });

  it("detects changes to a loaded entity", async () => {
    // Given a schedule loaded before a concurrent update
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted draft schedule
    await insertAuthorSchedule({ author_id: 1, overview: "draft" });
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, "authorSchedule:1");
    // And another connection publishes it before application logic reads the cached value
    await knex("author_schedules")
      .where("id", parent.idUntagged)
      .update({ overview: "published", updated_at: "2050-01-01" });
    // When application logic reads the original overview
    void parent.overview;
    // Then its implicit assertion rejects the stale row
    await expect(em.flush()).rejects.toThrow(ReadDriftError);
  });

  it("merely hydrating a field does not mark it as read locked", async () => {
    // Given a persisted schedule with a configured overview
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted draft schedule
    await insertAuthorSchedule({ author_id: 1, overview: "draft" });
    const em = newEntityManager();
    // When it is loaded but its getter is never read
    await em.load(AuthorSchedule, "authorSchedule:1");
    resetQueryCount();
    await em.flush();
    // Then hydration alone adds no assertion or transaction
    expect(queries).toEqual([]);
  });

  it("setting an unchanged field does not mark it as read locked", async () => {
    // Given a loaded schedule with a configured overview
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted draft schedule
    await insertAuthorSchedule({ author_id: 1, overview: "draft" });
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, "authorSchedule:1");
    // When a setter compares an unchanged value through internal getField
    parent.overview = "draft";
    resetQueryCount();
    await em.flush();
    // Then internal field access does not acquire a read lock
    expect(queries).toEqual([]);
  });

  it("reading an unconfigured field does not mark it as read locked", async () => {
    // Given a loaded schedule with only overview configured
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted draft schedule
    await insertAuthorSchedule({ author_id: 1, overview: "draft" });
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, "authorSchedule:1");
    // When application logic only reads createdAt
    void parent.createdAt;
    resetQueryCount();
    await em.flush();
    // Then no locking query is added
    expect(queries).toEqual([]);
  });

  it("protects a parent's inherited status read when deciding to edit a book", async () => {
    // Given a book whose publisher status is draft
    await insertSmallPublisher({ name: "p1", status_id: 1 });
    // And the publisher has an author with a persisted book
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1", { author: "publisher" });
    const parent = book.author.get.publisher.get!;
    // When application logic uses the inherited status getter without an explicit assertion
    if (parent.status === PublisherStatus.Draft) book.notes = "allowed while draft";
    // And a concurrent transaction changes the publisher
    await knex("publishers").where("id", parent.idUntagged).update({ status_id: 2, updated_at: "2050-01-01" });
    // Then the stale decision fails instead of committing the book edit
    await expect(em.flush()).rejects.toThrow(ReadDriftError);
  });

  it("protects enum boolean convenience getters", async () => {
    // Given a loaded draft publisher
    await insertSmallPublisher({ name: "p1", status_id: 1 });
    const em = newEntityManager();
    const publisher = await em.load(SmallPublisher, "p:1");
    // When application logic uses isDraft instead of the status getter
    void publisher.isDraft;
    // And another connection changes the row version
    await knex("publishers").where("id", publisher.idUntagged).update({ updated_at: "2050-01-01" });
    // Then the convenience getter has marked the publisher for read locking
    await expect(em.flush()).rejects.toThrow(ReadDriftError);
  });

  it("protects enum detail getters", async () => {
    // Given a loaded draft publisher
    await insertSmallPublisher({ name: "p1", status_id: 1 });
    const em = newEntityManager();
    const publisher = await em.load(SmallPublisher, "p:1");
    // When application logic accesses the enum details
    void publisher.statusDetails;
    // And another connection changes the row version
    await knex("publishers").where("id", publisher.idUntagged).update({ updated_at: "2050-01-01" });
    // Then the detail getter has marked the publisher for read locking
    await expect(em.flush()).rejects.toThrow(ReadDriftError);
  });

  it("protects configured native enum reads", async () => {
    // Given an author's configured native enum field
    await insertAuthor({ first_name: "a1", favorite_shape: "circle" });
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    // When application logic uses a native enum convenience getter
    void author.isCircle;
    // And another connection changes the row version
    await knex("authors").where("id", author.idUntagged).update({ updated_at: "2050-01-01" });
    // Then the native enum read detects drift
    await expect(em.flush()).rejects.toThrow(ReadDriftError);
  });

  it("protects configured enum array reads", async () => {
    // Given an author's configured enum array field
    await insertAuthor({ first_name: "a1", favorite_colors: [1] });
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    // When application logic reads the enum array
    void author.favoriteColors;
    // And another connection changes an unrelated field on the same row
    await knex("authors").where("id", author.idUntagged).update({ last_name: "changed", updated_at: "2050-01-01" });
    // Then the protection detects row-level drift, not just changes to the configured field
    await expect(em.flush()).rejects.toThrow(ReadDriftError);
  });

  it("reading a cached field after flushing marks it as read locked again", async () => {
    // Given a protected getter read and a successful flush
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted draft schedule
    await insertAuthorSchedule({ author_id: 1, overview: "draft" });
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, "authorSchedule:1");
    void parent.overview;
    await em.flush();
    // And another connection invalidates the still-cached entity
    await knex("author_schedules").where("id", parent.idUntagged).update({ updated_at: "2050-01-01" });
    // When application logic reads the cached getter again
    void parent.overview;
    // Then the new assertion detects drift from the unchanged loaded version
    await expect(em.flush()).rejects.toThrow(ReadDriftError);
  });

  it("protects direct application calls to getField", async () => {
    // Given a configured field on a loaded schedule
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted draft schedule
    await insertAuthorSchedule({ author_id: 1, overview: "draft" });
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, "authorSchedule:1");
    // When application code reads the field without using its generated getter
    getField(parent, "overview");
    // And another connection invalidates that read
    await knex("author_schedules").where("id", parent.idUntagged).update({ updated_at: "2050-01-01" });
    // Then the direct read has the same protection as a getter read
    await expect(em.flush()).rejects.toThrow(ReadDriftError);
  });

  it("internal getField reads do not mark the entity as read locked", async () => {
    // Given a configured field on a loaded schedule
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted draft schedule
    await insertAuthorSchedule({ author_id: 1, overview: "draft" });
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, "authorSchedule:1");
    // And another connection changes its version
    await knex("author_schedules").where("id", parent.idUntagged).update({ updated_at: "2050-01-01" });
    // When housekeeping explicitly marks its read internal
    getField(parent, "overview", true);
    resetQueryCount();
    await em.flush();
    // Then it creates neither a read assertion nor a transaction
    expect(queries).toEqual([]);
  });

  it("checking whether a field is set does not mark it as read locked", async () => {
    // Given a configured field on a loaded schedule
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted draft schedule
    await insertAuthorSchedule({ author_id: 1, overview: "draft" });
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, "authorSchedule:1");
    // When housekeeping checks presence without reading a domain value
    isFieldSet(parent, "overview");
    resetQueryCount();
    await em.flush();
    // Then the presence check creates no assertion
    expect(queries).toEqual([]);
  });

  it("applying unchanged opts does not mark the entity as read locked", async () => {
    // Given a configured field on a loaded schedule
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted draft schedule
    await insertAuthorSchedule({ author_id: 1, overview: "draft" });
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, "authorSchedule:1");
    // When opts application inspects the current value without changing it
    parent.set({ overview: "draft" });
    resetQueryCount();
    await em.flush();
    // Then the internal inspection does not become a protected application read
    expect(queries).toEqual([]);
  });

  it("protects reads in auth-trusted contexts", async () => {
    // Given a configured field on a loaded schedule
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted draft schedule
    await insertAuthorSchedule({ author_id: 1, overview: "draft" });
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, "authorSchedule:1");
    // When trusted domain logic reads the field, as hooks and rules do
    runInTrustedContext(() => getField(parent, "overview"));
    // And another connection invalidates the read
    await knex("author_schedules").where("id", parent.idUntagged).update({ updated_at: "2050-01-01" });
    // Then auth trust has not disabled read drift protection
    await expect(em.flush()).rejects.toThrow(ReadDriftError);
  });

  it("protects configured source values copied during cloning", async () => {
    // Given a configured field on a loaded schedule
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted draft schedule
    await insertAuthorSchedule({ author_id: 1, overview: "draft" });
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, "authorSchedule:1");
    // When application logic copies the configured field into a new entity
    await em.clone(parent);
    // And another connection changes the source row
    await knex("author_schedules").where("id", parent.idUntagged).update({ updated_at: "2050-01-01" });
    // Then cloning cannot commit a protected value copied from a stale source
    await expect(em.flush()).rejects.toThrow(ReadDriftError);
  });

  it("protects configured values read through changes.originalValue", async () => {
    // Given a configured field on an unchanged loaded schedule
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted draft schedule
    await insertAuthorSchedule({ author_id: 1, overview: "draft" });
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, "authorSchedule:1");
    // When application logic reads the loaded value through the changes API
    void parent.changes.overview.originalValue;
    // And another connection changes the source row
    await knex("author_schedules").where("id", parent.idUntagged).update({ updated_at: "2050-01-01" });
    // Then that domain read has not been treated as housekeeping
    await expect(em.flush()).rejects.toThrow(ReadDriftError);
  });
});

/** Returns only the read drift locking queries. */
function shareQueries(): string[] {
  return queries.filter((q) => q.endsWith("FOR SHARE"));
}
