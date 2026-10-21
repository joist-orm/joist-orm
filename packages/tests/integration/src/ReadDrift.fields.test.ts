import { ReadDriftError, getField, isFieldSet, runInTrustedContext } from "joist-orm";
import { Author, AuthorSchedule, Book, PublisherStatus, SmallPublisher, newAuthorSchedule } from "src/entities";
import { insertAuthor, insertAuthorSchedule, insertBook, insertSmallPublisher } from "src/entities/inserts";
import { knex, newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("ReadDrift.fields", () => {
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

  it("compares against the loaded version rather than the getter-read version", async () => {
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

  it("does not enroll a configured field during hydration", async () => {
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

  it("does not enroll a configured field when its setter internally reads the current value", async () => {
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

  it("does not enroll unconfigured getters", async () => {
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
    // Then the convenience getter has enrolled the same row assertion
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
    // Then the detail getter has enrolled the same row assertion
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

  it("clears implicit assertions after a successful flush", async () => {
    // Given an overview read whose implicit assertion has already succeeded
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted draft schedule
    await insertAuthorSchedule({ author_id: 1, overview: "draft" });
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, "authorSchedule:1");
    void parent.overview;
    await em.flush();
    // And another connection changes the version after that flush
    await knex("author_schedules").where("id", parent.idUntagged).update({ updated_at: "2050-01-01" });
    // When no application getter is read again
    resetQueryCount();
    await em.flush();
    // Then the old assertion is not replayed
    expect(queries).toEqual([]);
  });

  it("enrolls another assertion when the cached getter is read after a successful flush", async () => {
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

  it("leaves configured getter reads on dirty entities to oplocks", async () => {
    // Given an existing schedule read through its protected getter
    await insertAuthor({ first_name: "a1" });
    // And the author has a persisted draft schedule
    await insertAuthorSchedule({ author_id: 1, overview: "draft" });
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, "authorSchedule:1");
    void parent.overview;
    // When the same row is also updated
    parent.overview = "published";
    resetQueryCount();
    await em.flush();
    // Then it uses the normal write path without an extra share lock
    expect(queries.filter((q) => q.endsWith("FOR SHARE"))).toEqual([]);
  });

  it("ignores configured getter reads on unsaved entities", async () => {
    // Given a new schedule with a configured overview getter
    const em = newEntityManager();
    const schedule = newAuthorSchedule(em, { overview: "draft" });
    // When application logic reads it before the initial flush
    void schedule.overview;
    await em.flush();
    // Then no persisted version is checked for the new entity
    expect(queries.filter((q) => q.endsWith("FOR SHARE"))).toEqual([]);
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

  it("allows housekeeping to read getField without enrolling an assertion", async () => {
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

  it("does not enroll assertions when checking whether a field is set", async () => {
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

  it("does not enroll assertions when applying unchanged opts", async () => {
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
