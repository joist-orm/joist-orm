import { Book, BookStatus, newAuthor, newBook } from "@src/entities";
import { insertAuthor } from "@src/entities/inserts";
import { insert, newEntityManager, select } from "@src/setupDbTests";

describe("Book", () => {
  it("can save a book", async () => {
    const em1 = newEntityManager();
    const b1 = newBook(em1, { title: "b1", author: { firstName: "a1" } });
    await em1.flush();

    const em2 = newEntityManager();
    const b2 = await em2.load(Book, b1.id, "author");
    expect(b2.title).toEqual("b1");
    expect(b2.author.get.firstName).toEqual("a1");
  });

  it("can update a book", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const b1 = newBook(em, { author: a1 });
    await em.flush();

    const a2 = newAuthor(em);
    b1.author.set(a2);
    await em.flush();
  });

  it("can save a uuid-based enum", async () => {
    const em = newEntityManager();
    newBook(em, { status: BookStatus.Published });
    await em.flush();
    expect(await select("books")).toMatchObject([{ status_id: "00000000-0000-0000-0000-000000000002" }]);
  });

  it("can load a uuid-based enum", async () => {
    await insertAuthor({ first_name: "a1" });
    await insert("books", {
      id: "00000000-0000-0000-0000-000000000001",
      status_id: "00000000-0000-0000-0000-000000000002",
      author_id: "20000000-0000-0000-0000-000000000000",
      title: "b1",
      created_at: new Date(),
      updated_at: new Date(),
    });
    const em = newEntityManager();
    const b1 = await em.load(Book, "00000000-0000-0000-0000-000000000001");
    expect(b1.status).toBe(BookStatus.Published);
  });
});
