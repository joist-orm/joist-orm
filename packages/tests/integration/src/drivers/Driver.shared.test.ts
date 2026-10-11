import { Author, newAuthor } from "src/entities";
import { update } from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

describe("Driver.shared", () => {
  it("persists multiple Authors with different field values", async () => {
    // Given two Authors with different names and nicknames
    const em1 = newEntityManager();
    const a1 = newAuthor(em1, { firstName: "a1", nickNames: ["one"] });
    const a2 = newAuthor(em1, { firstName: "a2", nickNames: ["two", "second"] });

    // When both Authors are flushed and loaded in a new EntityManager
    await em1.flush();
    const authors = await newEntityManager().loadAll(Author, [a1.id, a2.id]);

    // Then each Author retains its own values
    expect(authors).toMatchEntity([
      { firstName: "a1", nickNames: ["one"] },
      { firstName: "a2", nickNames: ["two", "second"] },
    ]);
  });

  it("updates multiple Authors with different field values", async () => {
    // Given two persisted Authors
    const em1 = newEntityManager();
    const a1 = newAuthor(em1, { firstName: "a1" });
    const a2 = newAuthor(em1, { firstName: "a2" });
    await em1.flush();

    // And each Author has a different name change
    a1.firstName = "updated1";
    a2.firstName = "updated2";

    // When both changes are flushed and loaded in a new EntityManager
    await em1.flush();
    const authors = await newEntityManager().loadAll(Author, [a1.id, a2.id]);

    // Then each Author retains its own changed name
    expect(authors).toMatchEntity([{ firstName: "updated1" }, { firstName: "updated2" }]);
  });

  it("preserves an Author's binary certificate", async () => {
    // Given an Author with a binary certificate
    const em1 = newEntityManager();
    const a1 = newAuthor(em1, { certificate: Buffer.from([0, 1, 127, 255]) });

    // When the Author is flushed and loaded in a new EntityManager
    await em1.flush();
    const author = await newEntityManager().load(Author, a1.id);

    // Then the certificate remains binary data
    expect(author.certificate).toEqual(Buffer.from([0, 1, 127, 255]));
  });

  it("preserves an Author's bigint atom count", async () => {
    // Given an Author with a bigint atom count
    const em1 = newEntityManager();
    const a1 = newAuthor(em1, { numberOfAtoms: 123_456_789n });

    // When the Author is flushed and loaded in a new EntityManager
    await em1.flush();
    const author = await newEntityManager().load(Author, a1.id);

    // Then the atom count retains its bigint domain type
    expect(author.numberOfAtoms).toEqual(123_456_789n);
  });

  it("rolls back all Author updates when one optimistic lock fails", async () => {
    // Given two persisted Authors in one EntityManager
    const em1 = newEntityManager();
    const a1 = newAuthor(em1, { firstName: "a1" });
    const a2 = newAuthor(em1, { firstName: "a2" });
    await em1.flush();

    // And an external writer changes the second Author after it was loaded
    await update("authors", { id: 2, first_name: "external", updated_at: new Date("2000-01-01T00:00:00Z") });

    // When the stale EntityManager tries to update both Authors
    a1.firstName = "updated1";
    a2.firstName = "updated2";

    // Then the second Author's optimistic lock rejects the flush
    await expect(em1.flush()).rejects.toThrow("Oplock failure");

    // When both Authors are loaded in a new EntityManager
    const authors = await newEntityManager().loadAll(Author, [a1.id, a2.id]);

    // Then neither stale update persisted and the external change remains
    expect(authors).toMatchEntity([{ firstName: "a1" }, { firstName: "external" }]);
  });
});
