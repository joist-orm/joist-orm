import { EntityManager } from "./EntityManager";
import { Author } from "../integration/Author";
import { knex } from "./setupDbTests";
import { Book } from "../integration/Book";

describe("EntityManager", () => {
  it("can populate many-to-one", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ title: "b1", author_id: 1 }).from("books");
    const em = new EntityManager(knex);
    const booka = await em.load(Book, "1");
    const bookb = await em.populate(booka, "author");
    bookb.author.get();
  });
});
