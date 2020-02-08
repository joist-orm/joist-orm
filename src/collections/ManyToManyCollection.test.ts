import { EntityManager } from "../EntityManager";
import { knex } from "../setupDbTests";
import { Book } from "../../integration/Book";

describe("ManyToManyCollection", () => {
  it("can load a many-to-many", async () => {
    await knex.insert({ id: 1, first_name: "a1" }).into("authors");
    await knex.insert({ id: 2, title: "b1", author_id: 1 }).into("books");
    await knex.insert({ id: 3, name: "t1" }).into("tags");
    await knex.insert({ id: 4, book_id: 2, tag_id: 3 }).into("books_to_tags");

    const em = new EntityManager(knex);
    const book = await em.load(Book, "2");
    const tags = await book.tags.load();
    expect(tags.length).toEqual(1);
    expect(tags[0].name).toEqual("t1");
  });
});
