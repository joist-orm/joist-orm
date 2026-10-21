import { ReadSetDriftError } from "joist-orm";
import { Author, Book, newAuthor, newBook } from "src/entities";
import { readSetCollectionOptions, readSetReactionOptions, readSetRuleOptions } from "src/entities/readSetOptions";
import { knex, newEntityManager, pool, queries, resetQueryCount } from "src/testEm";

describe("ReadSet", () => {
  afterEach(() => {
    readSetRuleOptions.assertUnchanged = false;
    readSetReactionOptions.assertUnchanged = false;
    readSetCollectionOptions.assertUnchanged = false;
  });

  it("batches unchanged dependencies once per table", async () => {
    // Given two persisted authors and a book
    const seed = newEntityManager();
    const b = newBook(seed);
    const a2 = newAuthor(seed);
    await seed.flush();
    const em = newEntityManager();
    const authors = await em.loadAll(Author, [b.author.id, a2.id]);
    const book = await em.load(Book, b.id);
    // When the read set contains duplicates across two tables
    em.assertUnchanged(authors, book, authors[0]);
    resetQueryCount();
    await em.flush();
    // Then each table is locked exactly once, in id order
    expect(shareQueries()).toEqual([
      "SELECT id AS id, updated_at::text AS version FROM authors WHERE id = ANY($1) ORDER BY id FOR SHARE",
      "SELECT id AS id, updated_at::text AS version FROM books WHERE id = ANY($1) ORDER BY id FOR SHARE",
    ]);
  });

  it("detects changes made before the assertion was registered", async () => {
    // Given a loaded author and a pending book edit
    const seed = newEntityManager();
    const b = newBook(seed);
    await seed.flush();
    const em = newEntityManager();
    const book = await em.load(Book, b.id, "author");
    book.notes = "decision based on the author";
    // And another connection changes the author after it was loaded
    await knex("authors").where("id", book.author.get.idUntagged).update({ updated_at: "2050-01-01" });
    // When we assert that the loaded version still holds
    em.assertUnchanged(book.author.get);
    // Then flush rejects the stale decision
    await expect(em.flush()).rejects.toThrow(ReadSetDriftError);
  });

  it("does not persist book edits when an asserted author drifts", async () => {
    // Given a persisted book and a loaded author
    const seed = newEntityManager();
    const b = newBook(seed, { notes: "original" });
    await seed.flush();
    const em = newEntityManager();
    const book = await em.load(Book, b.id, "author");
    // And another connection invalidates the author version
    await knex("authors").where("id", book.author.get.idUntagged).update({ updated_at: "2050-01-01" });
    // When a stale decision tries to change the book
    book.notes = "stale decision";
    em.assertUnchanged(book.author.get);
    await em.flush().catch(() => {});
    // Then the database retains the original book
    expect((await newEntityManager().load(Book, b.id)).notes).toEqual("original");
  });

  it("reports deleted rows with tagged ids and expected versions", async () => {
    // Given a loaded author
    const seed = newEntityManager();
    const a = newAuthor(seed);
    await seed.flush();
    const em = newEntityManager();
    const author = await em.load(Author, a.id);
    // And another connection deletes the author
    await knex("authors").where("id", author.idUntagged).delete();
    // When we flush its assertion
    em.assertUnchanged(author);
    // Then the missing row is reported with the original timestamp
    await expect(em.flush()).rejects.toThrow(
      `Read set drift: ${author.idTagged} expected ${author.updatedAt.toISOString()}, actual missing`,
    );
  });

  it("leaves asserted writes to oplocks", async () => {
    // Given a loaded author
    const seed = newEntityManager();
    const a = newAuthor(seed);
    await seed.flush();
    const em = newEntityManager();
    const author = await em.load(Author, a.id);
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
    const seed = newEntityManager();
    const a = newAuthor(seed);
    await seed.flush();
    const em = newEntityManager();
    const author = await em.load(Author, a.id);
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
    const seed = newEntityManager();
    const b = newBook(seed);
    await seed.flush();
    const em = newEntityManager();
    const book = await em.load(Book, b.id, "author");
    readSetRuleOptions.assertUnchanged = true;
    // And its loaded author changes in another connection
    await knex("authors").where("id", book.author.get.idUntagged).update({ updated_at: "2050-01-01" });
    // When notes trigger the rule
    book.notes = "trigger rule";
    // Then its stale author dependency is rejected
    await expect(em.flush()).rejects.toThrow(ReadSetDriftError);
  });

  it("does not protect dependencies without the opt-in", async () => {
    // Given a book with an ordinary rule reading its author
    const seed = newEntityManager();
    const b = newBook(seed);
    await seed.flush();
    const em = newEntityManager();
    const book = await em.load(Book, b.id, "author");
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
    const seed = newEntityManager();
    const b = newBook(seed);
    await seed.flush();
    const em = newEntityManager();
    const book = await em.load(Book, b.id, "author");
    readSetRuleOptions.assertUnchanged = true;
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
    const seed = newEntityManager();
    const b = newBook(seed);
    await seed.flush();
    const em = newEntityManager();
    const book = await em.load(Book, b.id, "author");
    readSetReactionOptions.assertUnchanged = true;
    // And its author changes in another connection
    await knex("authors").where("id", book.author.get.idUntagged).update({ updated_at: "2050-01-01" });
    // When notes trigger the reaction
    book.notes = "trigger reaction";
    // Then its stale author dependency is rejected
    await expect(em.flush()).rejects.toThrow(ReadSetDriftError);
  });

  it("clears the read set after a successful flush", async () => {
    // Given an asserted author whose first flush succeeds
    const seed = newEntityManager();
    const a = newAuthor(seed);
    await seed.flush();
    const em = newEntityManager();
    const author = await em.load(Author, a.id);
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
    const seed = newEntityManager();
    const a = newAuthor(seed);
    await seed.flush();
    const em = newEntityManager();
    const author = await em.load(Author, a.id);
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
    const seed = newEntityManager();
    const first = newBook(seed);
    const sibling = newBook(seed, { author: first.author.get });
    await seed.flush();
    const em = newEntityManager();
    const book = await em.load(Book, first.id, { author: "books" });
    readSetCollectionOptions.assertUnchanged = true;
    // And a loaded sibling changes outside the EM
    await knex("books").where("id", sibling.idUntagged).update({ updated_at: "2050-01-01" });
    // When title triggers the numberOfBooks2 rule through author.books
    book.title = "changed title";
    // Then the sibling's stale row version is rejected
    await expect(em.flush()).rejects.toThrow(ReadSetDriftError);
  });

  it("locks an unchanged author once while successfully writing its book", async () => {
    // Given a persisted book and author
    const seed = newEntityManager();
    const b = newBook(seed);
    await seed.flush();
    const em = newEntityManager();
    const book = await em.load(Book, b.id, "author");
    // When a decision based on the unchanged author edits the book
    em.assertUnchanged(book.author.get);
    book.notes = "valid decision";
    resetQueryCount();
    await em.flush();
    // Then there is exactly one read-dependency locking query
    expect(shareQueries()).toEqual([
      "SELECT id AS id, updated_at::text AS version FROM authors WHERE id = ANY($1) ORDER BY id FOR SHARE",
    ]);
  });

  it("reports both loaded and current versions for an updated dependency", async () => {
    // Given a loaded author version
    const seed = newEntityManager();
    const a = newAuthor(seed);
    await seed.flush();
    const em = newEntityManager();
    const author = await em.load(Author, a.id);
    // And another connection changes the persisted version
    await knex("authors").where("id", author.idUntagged).update({ updated_at: "2050-01-01" });
    // When the loaded author is asserted
    em.assertUnchanged(author);
    // Then the diagnostic identifies the entity and both versions
    await expect(em.flush()).rejects.toThrow(
      `Read set drift: ${author.idTagged} expected ${author.updatedAt.toISOString()}, actual 2050-01-01T00:00:00.000Z`,
    );
  });

  it("uses the persisted version after this EM has already written the entity", async () => {
    // Given an existing author loaded into this EM
    const seed = newEntityManager();
    const a = newAuthor(seed);
    await seed.flush();
    const em = newEntityManager();
    const author = await em.load(Author, a.id);
    // And this EM successfully updates the author
    author.firstName = "new name";
    await em.flush();
    // When the author becomes a read-only dependency in a later flush
    em.assertUnchanged(author);
    // Then its last persisted version is accepted instead of the old hydration row
    await expect(em.flush()).resolves.toEqual([]);
  });
});

/** Returns only the read-set locking queries. */
function shareQueries(): string[] {
  return queries.filter((q) => q.endsWith("FOR SHARE"));
}
