import { Author, Book } from "../entities";
import { newEntityManager } from "../setupDbTests";

describe("Book", () => {
  it("non-null reference might still have a null id", async () => {
    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1" });
    const b1 = em.create(Book, { title: "b1", author: a1 });
    expect(b1.author.id).toBeUndefined();
    expect(b1.author.isSet).toBeTruthy();
  });

  it("should have default values populated immediately on create if they aren't provided as opts", async () => {
    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1" });
    const b1 = em.create(Book, { title: "b1", author: a1 });
    expect(b1.order).toEqual(1);
  });
});
