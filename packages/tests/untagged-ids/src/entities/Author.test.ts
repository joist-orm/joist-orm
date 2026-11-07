import { type Entity, Plugin, RandomUuidAssigner } from "joist-orm";
import { Author, Book, newAuthor, newBook } from "src/entities";
import { insertAuthor } from "src/entities/inserts";
import { knex, newEntityManager } from "src/setupDbTests";

describe("Author", () => {
  it("can load an entity with a uuid id", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.find(Author, {});
    expect(a1[0].id).toEqual("20000000-0000-0000-0000-000000000000");
  });

  it("can create entities with deterministic uuids", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const a2 = newAuthor(em);
    await em.flush();
    expect(a1.id).toEqual("00000000-0000-0000-000a-000000000000");
    expect(a2.id).toEqual("00000000-0000-0000-000a-000000000001");
  });

  it("can generate random uuids", async () => {
    const em = newEntityManager({ idAssigner: new RandomUuidAssigner() });
    const a1 = newAuthor(em);
    await em.flush();
    expect(a1.id.startsWith("a:")).toBe(false);
  });

  it("can load author and books", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const a2 = newAuthor(em);
    const b1 = newBook(em, { author: a1 });
    const b2 = newBook(em, { author: a2 });
    await em.flush();
    await em.refresh();
    const authors = await em.find(Author, {}, { populate: "books" });

    expect(authors).toHaveLength(2);
  });

  it("can save fks as ids", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    await em.flush();
    const b1 = em.create(Book, { title: "b1", author: a1.id });
    await em.flush();
    expect(b1).toMatchEntity({
      id: "00000000-0000-0000-000b-000000000000",
      author: "a#1:00000000-0000-0000-000a-000000000000",
      title: "b1",
    });
  });

  it("can get an untagged m2o.id", async () => {
    const em = newEntityManager();
    // Given a book with an author
    const [a1, a2] = [newAuthor(em), newAuthor(em)];
    const b1 = newBook(em, { author: a1 });
    await em.flush();
    // We can access the id and not see its tag
    expect(b1.author.id).toBe("00000000-0000-0000-000a-000000000000");
    // And we can change the id via a2's untagge did
    b1.author.id = a2.id;
    expect(b1.author.id).toBe("00000000-0000-0000-000a-000000000001");
    await em.flush();
  });

  it("does not cache an unassigned ID across persistence", async () => {
    // Given a new author whose optional ID has already been read
    const em = newEntityManager();
    const author = newAuthor(em);
    void author.idMaybe;
    void author.idMaybe;
    // When persistence assigns its tagged backing ID
    await em.flush();
    void author.id;
    // Then repeated ID reads return its converted untagged UUID
    expect(author.idMaybe).toBe("00000000-0000-0000-000a-000000000000");
  });

  it("keeps a preassigned UUID after its untagged form has been read", async () => {
    // Given a new author whose deterministic UUID was assigned before insertion
    const em = newEntityManager();
    const author = newAuthor(em);
    await em.assignNewIds();
    // And application logic has read the converted ID
    const assignedId = author.id;
    // When the author is inserted
    await em.flush();
    // Then persistence preserves the identity that application logic already used
    expect(author.idTagged).toBe(`a:${assignedId}`);
  });

  it("keeps a preassigned random UUID after its untagged form has been read", async () => {
    // Given a new author whose random UUID was assigned before insertion
    const em = newEntityManager({ idAssigner: new RandomUuidAssigner() });
    const author = newAuthor(em);
    await em.assignNewIds();
    // And application logic has read the converted ID
    const assignedId = author.id;
    // When the author is inserted
    await em.flush();
    // Then the tagged backing ID still agrees with the previously returned domain ID
    expect(author.idTagged).toBe(`a:${assignedId}`);
  });

  it("retries an ID read when its hook cached the conversion before throwing", async () => {
    // Given a persisted author hydrated without reading its ID getters
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const [author] = em.hydrate(Author, await knex.select("*").from("authors"));
    // And its first ID hook reads the converted ID before failing
    let attempts = 0;
    em.addPlugin(
      new (class extends Plugin {
        /** Exercises conversion caching during a reentrant first-read hook. */
        beforeGetField(entity: Entity, field: string): void {
          if (entity === author && field === "id") {
            attempts++;
            void author.idMaybe;
            if (attempts === 1) throw new Error("retry this ID");
          }
        }
      })(),
    );
    // When application logic retries the failed ID read
    try {
      void author.idMaybe;
    } catch {}
    void author.idMaybe;
    void author.idMaybe;
    // Then the successful retry, not the failed conversion, consumes the callback
    expect(attempts).toBe(2);
  });
});
