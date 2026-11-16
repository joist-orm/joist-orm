import { Author, Book } from "src/entities";
import { newEntityManager, select } from "src/setupDbTests";

describe("EntityManager.clientIds", () => {
  it("uses client references while retaining numeric database identity", async () => {
    // Given a client-identified author in a numeric-ID project
    const em = newEntityManager();
    const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
    const clientId = author.$clientId!;
    // When a book refers to that client identity and the graph is flushed
    const book = await em.upsert(Book, { title: "Earthsea", author: await em.load(Author, clientId) });
    await em.flush();
    // Then the foreign key is a real numeric database ID
    expect(await select("books")).toMatchObject([{ id: String(book.id), author_id: author.id }]);
  });

  it("resolves client IDs with getEntity in numeric-ID projects", async () => {
    // Given a persisted author retaining its client identity
    const em = newEntityManager();
    const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
    await em.flush();
    // When application code resolves its client ID
    const found = em.getEntity("a#7");
    // Then it returns the canonical author
    expect(found).toMatchEntity(author);
  });

  it("rejects a client reference for the wrong entity", async () => {
    // Given a book with a registered client identity
    const em = newEntityManager();
    em.createPartial(Book, { $clientId: "b#7", title: "Earthsea" });
    // When the book's client ID is loaded as an author
    // Then the registered entity's type must still match the requested author type
    await expect(em.load(Author, "b#7")).rejects.toThrow("b#7 is Book but should be Author");
  });
});
