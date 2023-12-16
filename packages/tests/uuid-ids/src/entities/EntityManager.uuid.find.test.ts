import { newAuthor } from "@src/entities/Author.factories";
import { Book } from "@src/entities/Book";
import { BookStatus, BookStatusDetails } from "@src/entities/BookStatus";
import { insertAuthor } from "@src/entities/inserts";
import { insert, newEntityManager } from "@src/setupDbTests";

describe("EntityManager.uuid.find", () => {
  it("can find by uuid enums", async () => {
    await insertAuthor({ first_name: "a1" });
    await insert("books", {
      id: "00000000-0000-0000-0000-000000000001",
      status_id: BookStatusDetails.Published.id,
      author_id: "20000000-0000-0000-0000-000000000000",
      title: "b1",
      created_at: new Date(),
      updated_at: new Date(),
    });
    const em = newEntityManager();
    const books = await em.find(Book, { status: BookStatus.Published });
    expect(books.length).toBe(1);
  });

  it("does not fail on new entities", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const b1 = await em.find(Book, { author: a1 });
  });

  it("does not fail on new entities in a loop", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const b1 = await Promise.all([
      //
      em.findOrCreate(Book, { author: a1 }, { title: "b1", status: BookStatus.Draft }),
      em.findOrCreate(Book, { author: a1 }, { title: "b1", status: BookStatus.Draft }),
    ]);
  });

  it("does not fail in a loop", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const b1 = await Promise.all([
      em.findOrCreate(Book, { title: "t1" }, { author: a1, status: BookStatus.Draft }),
      em.findOrCreate(Book, { title: "t2" }, { author: a1, status: BookStatus.Draft }),
    ]);
  });
});
