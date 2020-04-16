import { EntityManager } from "joist-orm";
import { knex } from "../setupDbTests";
import { Author, Book } from "../entities";

describe("Book", () => {
  it("non-null reference might still have a null id", async () => {
    const em = new EntityManager(knex);
    const a1 = em.create(Author, { firstName: "a1" });
    const b1 = em.create(Book, { title: "b1", author: a1 });
    expect(b1.author.id).toBeUndefined();
    expect(b1.author.isSet()).toBeTruthy();
  });
});
