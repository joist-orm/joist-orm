import { AdvanceStatus, Author, Book, BookAdvance, SmallPublisher, Tag } from "src/entities";
import { insertAuthor, insertBook, insertBookAdvance, insertPublisher, select } from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

describe("EntityManager.dryRun", () => {
  it("skips entity beforeCommit callbacks during a dry run", async () => {
    // Given an author with an ordinary entity beforeCommit hook
    const em = newEntityManager();
    const author = em.create(Author, { firstName: "Alice" });
    // When preparing its changes without committing
    await em.flush({ dryRun: true });
    // Then commit-only behavior has not run
    expect(author.transientFields.beforeCommitRan).toEqual(false);
  });

  it("can ordinarily flush the same graph after repeated pre-write validations", async () => {
    // Given a tag prepared twice without durable writes
    const em = newEntityManager();
    em.create(Tag, { name: "draft" });
    await em.flush({ dryRun: "validate" });
    await em.flush({ dryRun: "validate" });
    // When committing on the same manager
    await em.flush();
    // Then its pending insert is persisted exactly once
    expect(await select("tags")).toMatchObject([{ name: "draft" }]);
  });

  it("leaves existing timestamps out of dry-run changes", async () => {
    // Given a publisher with a known database version and a staged rename
    await insertPublisher({ name: "publisher", updated_at: new Date("2020-01-01T00:00:00.000Z") });
    const em = newEntityManager();
    const publisher = await em.load(SmallPublisher, "p:1");
    publisher.name = "renamed";
    // When preparing the same edit twice
    await em.flush({ dryRun: "validate" });
    await em.flush({ dryRun: "validate" });
    // Then no speculative timestamp mutation needs to be repaired
    expect(publisher.changes.updatedAt.hasChanged).toEqual(false);
  });

  it("preserves an existing timestamp through dry runs", async () => {
    // Given a publisher with a known database version and a staged rename
    const updatedAt = new Date("2020-01-01T00:00:00.000Z");
    await insertPublisher({ name: "publisher", updated_at: updatedAt });
    const em = newEntityManager();
    const publisher = await em.load(SmallPublisher, "p:1");
    publisher.name = "renamed";
    // When preparing without committing
    await em.flush({ dryRun: true });
    // Then the entity still has its original version
    expect(publisher.updatedAt).toEqual(updatedAt);
  });

  it("advances the timestamp only when ordinarily flushing after a dry run", async () => {
    // Given a publisher renamed in a dry run
    const updatedAt = new Date("2020-01-01T00:00:00.000Z");
    await insertPublisher({ name: "publisher", updated_at: updatedAt });
    const em = newEntityManager();
    const publisher = await em.load(SmallPublisher, "p:1");
    publisher.name = "renamed";
    await em.flush({ dryRun: "validate" });
    // When persisting that same graph normally
    await em.flush();
    // Then the ORM advances its row version without an UPDATE trigger
    expect(publisher.updatedAt.getTime()).toBeGreaterThan(updatedAt.getTime());
  });

  it("still rejects stale writes when a dry run does not bump timestamps", async () => {
    // Given a loaded publisher with a pending edit
    await insertPublisher({ name: "publisher", updated_at: new Date("2020-01-01T00:00:00.000Z") });
    const em = newEntityManager();
    const publisher = await em.load(SmallPublisher, "p:1");
    publisher.name = "stale";
    // And a concurrent ORM writer advances its version
    const other = newEntityManager();
    const concurrent = await other.load(SmallPublisher, "p:1");
    concurrent.name = "concurrent";
    await other.flush();
    // When validating against the stale version
    // Then the unchanged timestamp still participates in optimistic locking
    await expect(em.flush({ dryRun: true })).rejects.toThrow("Oplock failure");
  });

  it("prevents reusing an EM whose preview SQL was rolled back", async () => {
    // Given a disposable preview EM that has executed its SQL
    const em = newEntityManager();
    em.create(Tag, { name: "preview" });
    await em.flush({ dryRun: true });
    // When attempting to persist its aborted transaction state
    // Then reuse is rejected instead of repairing speculative persistence bookkeeping
    await expect(em.flush()).rejects.toThrow("previous flush failed");
  });

  it("reruns ordinary validation rules without replaying successful reactions", async () => {
    // Given an author whose ordinary rule rejects identical first and last names
    const em = newEntityManager();
    const author = em.create(Author, { firstName: "Alice", lastName: "Alice" });
    await expect(em.flush({ dryRun: "validate" })).rejects.toThrow("must be different");
    const previousChecks = author.transientFields.firstIsNotLastNameRuleInvoked;
    // When asking for validation again without changing the invalid name
    await expect(em.flush({ dryRun: "validate" })).rejects.toThrow("must be different");
    // Then the rule is evaluated again from the still-pending changes
    expect(author.transientFields.firstIsNotLastNameRuleInvoked).toBeGreaterThan(previousChecks);
  });

  it("does not requeue successful reactions after a validation failure", async () => {
    // Given a name reaction that runs before an ordinary validation failure
    const em = newEntityManager();
    const author = em.create(Author, { firstName: "Alice", lastName: "Alice" });
    await expect(em.flush({ dryRun: "validate" })).rejects.toThrow("must be different");
    const previousReactions = author.transientFields.reactions.direct;
    // When correcting the last name without changing the reaction's first-name dependency
    author.lastName = "Smith";
    await em.flush({ dryRun: "validate" });
    // Then the successful first-name reaction is not replayed
    expect(author.transientFields.reactions.direct).toEqual(previousReactions);
  });

  it("retries a failed transition guard without replaying an earlier successful transition", async () => {
    // Given an advance whose signature is allowed but payment is blocked by its unpublished book
    await insertPublisher({ name: "publisher" });
    await insertAuthor({ first_name: "Alice" });
    await insertBook({ title: "Unpublished", author_id: 1 });
    await insertBookAdvance({ book_id: 1, publisher_id: 1 });
    const em = newEntityManager();
    const advance = await em.load(BookAdvance, "ba:1");
    advance.status = AdvanceStatus.Signed;
    advance.status = AdvanceStatus.Paid;
    await expect(em.flush({ dryRun: "validate" })).rejects.toThrow("unpublished book");
    // When publishing the book and retrying the blocked payment
    const book = await em.load(Book, "b:1");
    book.title = "Published";
    await em.flush({ dryRun: "validate" });
    // Then the signature callback runs once and only the blocked payment is resumed
    expect(advance.transientFields.transitions).toEqual([AdvanceStatus.Signed, AdvanceStatus.Paid]);
  });
});
