import { Author, Book, newAuthor, newBook } from "../entities";

import { newEntityManager } from "@src/testEm";

describe("Book", () => {
  it("non-null reference might still have a null id", async () => {
    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1" });
    const b1 = em.create(Book, { title: "b1", author: a1 });
    expect(() => b1.author.id).toThrow("Reference is assigned to a new entity");
    expect(b1.author.isSet).toBe(true);
  });

  it("should have default values populated immediately on create if they aren't provided as opts", async () => {
    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1" });
    const b1 = em.create(Book, { title: "b1", author: a1 });
    expect(b1.order).toEqual(1);
  });

  it("can update without the order field causing syntax errors", async () => {
    const em = newEntityManager();
    const b = newBook(em);
    await em.flush();
    b.order++;
    await em.flush();
  });

  it("can observe reference from beforeDelete", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    const b = newBook(em, { author: a });
    await em.flush();
    em.delete(a);
    await em.flush();
    expect(b.authorSetWhenDeleteRuns).toBe(true);
  });
});
