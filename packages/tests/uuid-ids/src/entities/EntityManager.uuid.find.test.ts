import { Book, BookStatus, BookStatusDetails, newAuthor, newBook } from "@src/entities";
import { insertAuthor } from "@src/entities/inserts";
import { insert, newEntityManager } from "@src/setupDbTests";

describe("EntityManager.uuid.find", () => {
  describe("em.find", () => {
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

    it("does not fail if given new entities", async () => {
      const em = newEntityManager();
      const a1 = newAuthor(em);
      const books = await em.find(Book, { author: a1 });
      expect(books.length).toBe(0);
    });
  });

  describe("enums", () => {
    it("work on bulk creation", async () => {
      const em = newEntityManager();
      newBook(em, { status: BookStatus.Published });
      newBook(em, { status: BookStatus.Draft });
      await em.flush();
    });

    it("work on bulk update", async () => {
      const em = newEntityManager();
      newBook(em, { status: BookStatus.Draft });
      newBook(em, { status: BookStatus.Draft });
      await em.flush();

      const em2 = newEntityManager();
      const [b1, b2] = await em2.find(Book, {});
      b1.status = BookStatus.Published;
      b2.status = BookStatus.Published;
      await em2.flush();
    });
  });

  describe("findOrCreate", () => {
    it("finding existing new entity does not fail", async () => {
      const em = newEntityManager();
      const a1 = newAuthor(em);
      const [b1, b2] = await Promise.all([
        em.findOrCreate(Book, { author: a1 }, { title: "b1", status: BookStatus.Draft }),
        em.findOrCreate(Book, { author: a1 }, { title: "b1", status: BookStatus.Draft }),
      ]);
      expect(b1).toBe(b2);
    });

    it("creating two entities does not fail", async () => {
      const em = newEntityManager();
      const a1 = newAuthor(em);
      const [b1, b2] = await Promise.all([
        em.findOrCreate(Book, { title: "t1" }, { author: a1, status: BookStatus.Draft }),
        em.findOrCreate(Book, { title: "t2" }, { author: a1, status: BookStatus.Draft }),
      ]);
      expect(b1).not.toBe(b2);
      await em.flush();
    });
  });
});
