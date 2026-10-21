import { ReadDriftError } from "joist-orm";
import {
  Author,
  AuthorSchedule,
  Book,
  Color,
  FavoriteShape,
  PublisherStatus,
  SmallPublisher,
  newAuthor,
  newAuthorSchedule,
  newBook,
  newSmallPublisher,
} from "src/entities";
import { knex, newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("ReadDrift.fields", () => {
  it("batches repeated reads of a configured scalar getter", async () => {
    // Given a persisted schedule whose overview has field-level protection
    const seed = newEntityManager();
    const schedule = newAuthorSchedule(seed, { overview: "draft" });
    await seed.flush();
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, schedule.id);
    // When application logic reads its overview repeatedly
    void parent.overview;
    void parent.overview;
    resetQueryCount();
    await em.flush();
    // Then the unchanged row is checked once inside the flush transaction
    expect(queries).toEqual([
      "BEGIN;",
      "SELECT id AS id, updated_at::text AS version FROM author_schedules WHERE id = ANY($1) ORDER BY id FOR SHARE",
      "COMMIT;",
    ]);
  });

  it("compares against the loaded version rather than the getter-read version", async () => {
    // Given a schedule loaded before a concurrent update
    const seed = newEntityManager();
    const schedule = newAuthorSchedule(seed, { overview: "draft" });
    await seed.flush();
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, schedule.id);
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
    const seed = newEntityManager();
    const schedule = newAuthorSchedule(seed, { overview: "draft" });
    await seed.flush();
    const em = newEntityManager();
    // When it is loaded but its getter is never read
    await em.load(AuthorSchedule, schedule.id);
    resetQueryCount();
    await em.flush();
    // Then hydration alone adds no assertion or transaction
    expect(queries).toEqual([]);
  });

  it("does not enroll a configured field when its setter internally reads the current value", async () => {
    // Given a loaded schedule with a configured overview
    const seed = newEntityManager();
    const schedule = newAuthorSchedule(seed, { overview: "draft" });
    await seed.flush();
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, schedule.id);
    // When a setter compares an unchanged value through internal getField
    parent.overview = "draft";
    resetQueryCount();
    await em.flush();
    // Then internal field access does not acquire a read lock
    expect(queries).toEqual([]);
  });

  it("does not enroll unconfigured getters", async () => {
    // Given a loaded schedule with only overview configured
    const seed = newEntityManager();
    const schedule = newAuthorSchedule(seed, { overview: "draft" });
    await seed.flush();
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, schedule.id);
    // When application logic only reads createdAt
    void parent.createdAt;
    resetQueryCount();
    await em.flush();
    // Then no locking query is added
    expect(queries).toEqual([]);
  });

  it("protects a parent's inherited status read when deciding to edit a book", async () => {
    // Given a book whose publisher status is draft
    const seed = newEntityManager();
    const publisher = newSmallPublisher(seed, { status: PublisherStatus.Draft });
    const b = newBook(seed, { author: { publisher } });
    await seed.flush();
    const em = newEntityManager();
    const book = await em.load(Book, b.id, { author: "publisher" });
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
    const seed = newEntityManager();
    const p = newSmallPublisher(seed, { status: PublisherStatus.Draft });
    await seed.flush();
    const em = newEntityManager();
    const publisher = await em.load(SmallPublisher, p.id);
    // When application logic uses isDraft instead of the status getter
    void publisher.isDraft;
    // And another connection changes the row version
    await knex("publishers").where("id", publisher.idUntagged).update({ updated_at: "2050-01-01" });
    // Then the convenience getter has enrolled the same row assertion
    await expect(em.flush()).rejects.toThrow(ReadDriftError);
  });

  it("protects enum detail getters", async () => {
    // Given a loaded draft publisher
    const seed = newEntityManager();
    const p = newSmallPublisher(seed, { status: PublisherStatus.Draft });
    await seed.flush();
    const em = newEntityManager();
    const publisher = await em.load(SmallPublisher, p.id);
    // When application logic accesses the enum details
    void publisher.statusDetails;
    // And another connection changes the row version
    await knex("publishers").where("id", publisher.idUntagged).update({ updated_at: "2050-01-01" });
    // Then the detail getter has enrolled the same row assertion
    await expect(em.flush()).rejects.toThrow(ReadDriftError);
  });

  it("protects configured native enum reads", async () => {
    // Given an author's configured native enum field
    const seed = newEntityManager();
    const a = newAuthor(seed, { favoriteShape: FavoriteShape.Circle });
    await seed.flush();
    const em = newEntityManager();
    const author = await em.load(Author, a.id);
    // When application logic uses a native enum convenience getter
    void author.isCircle;
    // And another connection changes the row version
    await knex("authors").where("id", author.idUntagged).update({ updated_at: "2050-01-01" });
    // Then the native enum read detects drift
    await expect(em.flush()).rejects.toThrow(ReadDriftError);
  });

  it("protects configured enum array reads", async () => {
    // Given an author's configured enum array field
    const seed = newEntityManager();
    const a = newAuthor(seed, { favoriteColors: [Color.Red] });
    await seed.flush();
    const em = newEntityManager();
    const author = await em.load(Author, a.id);
    // When application logic reads the enum array
    void author.favoriteColors;
    // And another connection changes an unrelated field on the same row
    await knex("authors").where("id", author.idUntagged).update({ last_name: "changed", updated_at: "2050-01-01" });
    // Then the protection detects row-level drift, not just changes to the configured field
    await expect(em.flush()).rejects.toThrow(ReadDriftError);
  });

  it("clears implicit assertions after a successful flush", async () => {
    // Given an overview read whose implicit assertion has already succeeded
    const seed = newEntityManager();
    const schedule = newAuthorSchedule(seed, { overview: "draft" });
    await seed.flush();
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, schedule.id);
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
    const seed = newEntityManager();
    const schedule = newAuthorSchedule(seed, { overview: "draft" });
    await seed.flush();
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, schedule.id);
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
    const seed = newEntityManager();
    const schedule = newAuthorSchedule(seed, { overview: "draft" });
    await seed.flush();
    const em = newEntityManager();
    const parent = await em.load(AuthorSchedule, schedule.id);
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
});
