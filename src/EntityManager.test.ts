import { EntityManager } from "./EntityManager";
import { Author } from "../integration/Author";
import { knex } from "./setupDbTests";
import { Book } from "../integration/Book";

describe("EntityManager", () => {
  it("can load author", async () => {
    await knex.insert({ first_name: "f" }).from("authors");
    const em = new EntityManager(knex);
    const author = await em.load(Author, "1");
    expect(author.firstName).toEqual("f");
  });

  it("can load book", async () => {
    await knex.insert({ title: "f" }).from("books");
    const em = new EntityManager(knex);
    const book = await em.load(Book, "1");
    expect(book.title).toEqual("f");
  });
});
