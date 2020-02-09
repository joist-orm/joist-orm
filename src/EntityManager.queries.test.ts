import { EntityManager } from "./EntityManager";
import { Author } from "../integration/Author";
import { knex } from "./setupDbTests";

describe("EntityManager", () => {
  it("can find all authors", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ first_name: "a2" }).from("authors");
    const em = new EntityManager(knex);
    const authors = await em.find(Author, {});
    expect(authors.length).toEqual(2);
    expect(authors[0].firstName).toEqual("a1");
    expect(authors[1].firstName).toEqual("a2");
  });
});
