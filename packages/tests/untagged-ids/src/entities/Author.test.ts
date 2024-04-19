import { Author, Book, newAuthor, newBook } from "@src/entities";
import { insertAuthor } from "@src/entities/inserts";
import { newEntityManager } from "@src/setupDbTests";
import { RandomUuidAssigner } from "joist-orm";

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
      author: "a:00000000-0000-0000-000a-000000000000",
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
});
